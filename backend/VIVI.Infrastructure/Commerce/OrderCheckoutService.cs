using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Data;

namespace VIVI.Infrastructure.Commerce;

public sealed record CheckoutLineInput(OrderItemType ItemType, Guid? ProductId, Guid? CourseId, int Quantity);

public sealed record CheckoutResult(
    Order Order,
    string RazorpayOrderId,
    string RazorpayKeyId,
    int AmountPaise,
    string Currency,
    DeliveryQuoteSnapshot? Delivery);

public sealed record DeliveryQuoteSnapshot(
    bool IsCoimbatore,
    string LocationLabel,
    int MinDays,
    int MaxDays,
    string Summary,
    DateTime EstimatedDeliveryDateFrom,
    DateTime EstimatedDeliveryDateTo);

public sealed class OrderCheckoutService
{
    private readonly ViviDbContext _db;
    private readonly PricingService _pricing;
    private readonly IRazorpayPaymentGateway _razorpay;
    private readonly RazorpayOptionsAccessor _razorpayOptions;
    private readonly IDeliveryEstimateService _delivery;
    private readonly InventoryService _inventory;

    public OrderCheckoutService(
        ViviDbContext db,
        PricingService pricing,
        IRazorpayPaymentGateway razorpay,
        RazorpayOptionsAccessor razorpayOptions,
        IDeliveryEstimateService delivery,
        InventoryService inventory)
    {
        _db = db;
        _pricing = pricing;
        _razorpay = razorpay;
        _razorpayOptions = razorpayOptions;
        _delivery = delivery;
        _inventory = inventory;
    }

    public async Task<DeliveryQuoteSnapshot> QuoteDeliveryAsync(
        IReadOnlyList<CheckoutLineInput> items,
        ShippingAddressInput shipping,
        CancellationToken cancellationToken)
    {
        _delivery.EnsureOnlinePaymentOrThrow(null);
        EnsureNotMixed(items);
        if (!items.Any(i => i.ItemType == OrderItemType.Product))
            throw ViviException.Conflict("NOT_A_PHYSICAL_ORDER", "Delivery estimates apply to physical products only.");

        ValidateShipping(shipping);
        var types = await LoadProductTypesAsync(items, cancellationToken);
        return BuildQuote(types, shipping, DateTime.UtcNow);
    }

    public async Task<CheckoutResult> CreateCheckoutAsync(
        Guid customerId,
        IReadOnlyList<CheckoutLineInput> items,
        CancellationToken cancellationToken,
        string? paymentMethod = null,
        ShippingAddressInput? shipping = null,
        bool saveShippingAddress = true)
    {
        if (items.Count == 0)
            throw ViviException.Conflict("EMPTY_ORDER", "Add at least one item to checkout.");

        _delivery.EnsureOnlinePaymentOrThrow(paymentMethod);
        EnsureNotMixed(items);

        var hasPhysical = items.Any(i => i.ItemType == OrderItemType.Product);

        if (hasPhysical)
        {
            if (shipping is null)
                throw ViviException.Conflict("DELIVERY_ADDRESS_REQUIRED", "Enter a delivery address for physical products.");
            ValidateShipping(shipping);
        }

        await using var transaction = _db.Database.IsRelational()
            ? await _db.Database.BeginTransactionAsync(cancellationToken)
            : null;
        var now = DateTime.UtcNow;
        var order = new Order
        {
            Id = Guid.NewGuid(),
            OrderNumber = await GenerateOrderNumberAsync(cancellationToken),
            CustomerId = customerId,
            Status = OrderStatus.PendingPayment,
            Currency = "INR",
            CreatedAt = now,
            UpdatedAt = now
        };

        decimal subtotal = 0;
        decimal discountTotal = 0;
        var productTypes = new List<ProductType>();

        foreach (var line in items)
        {
            var (orderItem, productType) = await BuildOrderItemAsync(line, customerId, cancellationToken);
            orderItem.OrderId = order.Id;
            order.Items.Add(orderItem);
            subtotal += orderItem.UnitPrice * orderItem.Quantity;
            discountTotal += orderItem.DiscountAmount;
            if (productType.HasValue)
                productTypes.Add(productType.Value);
        }

        order.Subtotal = subtotal;
        order.DiscountAmount = discountTotal;
        order.TaxAmount = 0;
        order.ShippingAmount = 0;
        order.TotalAmount = subtotal + order.TaxAmount + order.ShippingAmount;

        if (order.TotalAmount <= 0)
            throw ViviException.Conflict("INVALID_TOTAL", "Order total must be greater than zero.");

        DeliveryQuoteSnapshot? deliveryQuote = null;
        if (hasPhysical && shipping is not null)
        {
            ApplyShipping(order, shipping);
            var quote = BuildQuote(productTypes, shipping, now);
            _delivery.ApplySystemEstimate(
                order,
                new DeliveryWindow(quote.MinDays, quote.MaxDays),
                quote.IsCoimbatore,
                now);
            deliveryQuote = quote;

            if (saveShippingAddress)
            {
                var customer = await _db.Customers.SingleOrDefaultAsync(c => c.Id == customerId, cancellationToken);
                if (customer is not null)
                {
                    CustomerResolver.ApplyShippingAddress(customer, shipping, shipping.Country);
                    customer.UpdatedAt = now;
                }
            }
        }

        var amountPaise = ToPaise(order.TotalAmount);
        var razorpayOrder = await _razorpay.CreateOrderAsync(order.OrderNumber, amountPaise, order.Currency, cancellationToken);
        order.RazorpayOrderId = razorpayOrder.RazorpayOrderId;

        var payment = new Payment
        {
            Id = Guid.NewGuid(),
            OrderId = order.Id,
            Provider = PaymentProvider.Razorpay,
            ProviderOrderId = razorpayOrder.RazorpayOrderId,
            Amount = order.TotalAmount,
            Currency = order.Currency,
            Status = PaymentStatus.Created,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.Orders.Add(order);
        _db.Payments.Add(payment);
        await _db.SaveChangesAsync(cancellationToken);
        if (transaction is not null)
            await transaction.CommitAsync(cancellationToken);

        return new CheckoutResult(
            order,
            razorpayOrder.RazorpayOrderId,
            _razorpayOptions.KeyId,
            razorpayOrder.AmountPaise,
            razorpayOrder.Currency,
            deliveryQuote);
    }

    private DeliveryQuoteSnapshot BuildQuote(
        IReadOnlyList<ProductType> types,
        ShippingAddressInput shipping,
        DateTime utcAnchor)
    {
        var isCoimbatore = _delivery.IsCoimbatore(shipping);
        var window = _delivery.Combine(types.Select(t => _delivery.WindowFor(t, isCoimbatore)));
        var dates = _delivery.ToCalendarDates(window, utcAnchor);
        return new DeliveryQuoteSnapshot(
            isCoimbatore,
            isCoimbatore ? "Coimbatore" : "Outside Coimbatore",
            window.MinDays,
            window.MaxDays,
            _delivery.FormatWindowSummary(window),
            dates.From,
            dates.To);
    }

    private async Task<IReadOnlyList<ProductType>> LoadProductTypesAsync(
        IReadOnlyList<CheckoutLineInput> items,
        CancellationToken cancellationToken)
    {
        var types = new List<ProductType>();
        foreach (var line in items.Where(i => i.ItemType == OrderItemType.Product))
        {
            if (!line.ProductId.HasValue)
                throw ViviException.Conflict("INVALID_PRODUCT", "Product id is required.");
            var product = await _db.Products
                .AsNoTracking()
                .SingleOrDefaultAsync(p => p.Id == line.ProductId && p.Status == ProductStatus.Published, cancellationToken)
                ?? throw ViviException.NotFound("PRODUCT_NOT_FOUND", "Product was not found or is not published.");
            types.Add(product.ProductType);
        }

        if (types.Count == 0)
            throw ViviException.Conflict("NOT_A_PHYSICAL_ORDER", "Delivery estimates apply to physical products only.");

        return types;
    }

    private static void EnsureNotMixed(IReadOnlyList<CheckoutLineInput> items)
    {
        var hasPhysical = items.Any(i => i.ItemType == OrderItemType.Product);
        var hasDigital = items.Any(i => i.ItemType is OrderItemType.Course or OrderItemType.CourseBundle);
        var hasLive = items.Any(i => i.ItemType == OrderItemType.LivePackage);
        if (hasPhysical && hasDigital)
        {
            throw ViviException.Conflict(
                "MIXED_ORDER_NOT_ALLOWED",
                "Physical products and courses must be purchased in separate checkouts.");
        }

        if (hasLive && (hasPhysical || hasDigital || items.Count > 1))
        {
            throw ViviException.Conflict(
                "LIVE_ORDER_SEPARATE",
                "Live Crochet Studio packages must be booked on their own checkout.");
        }
    }

    public static void ValidateShipping(ShippingAddressInput shipping, string? country = null)
    {
        if (string.IsNullOrWhiteSpace(shipping.FullName))
            throw ViviException.Conflict("INVALID_ADDRESS", "Enter the recipient's full name.");

        var resolvedCountry = string.IsNullOrWhiteSpace(country) ? shipping.Country : country;
        var requireIndian =
            string.IsNullOrWhiteSpace(resolvedCountry)
            || resolvedCountry.Trim().Equals("India", StringComparison.OrdinalIgnoreCase);

        var phoneDigits = new string((shipping.PhoneNumber ?? string.Empty).Where(char.IsDigit).ToArray());
        if (requireIndian)
        {
            if (!Regex.IsMatch(phoneDigits, @"^\d{10}$"))
                throw ViviException.Conflict("INVALID_PHONE", "Enter a 10-digit Indian mobile number.");
        }
        else if (phoneDigits.Length is < 8 or > 15)
        {
            throw ViviException.Conflict(
                "INVALID_PHONE",
                "Enter a valid phone number with country code.");
        }

        if (string.IsNullOrWhiteSpace(shipping.AddressLine1))
            throw ViviException.Conflict("INVALID_ADDRESS", "Enter address line 1.");
        if (string.IsNullOrWhiteSpace(shipping.City))
            throw ViviException.Conflict("INVALID_ADDRESS", "Enter the delivery city.");
        if (string.IsNullOrWhiteSpace(shipping.State))
            throw ViviException.Conflict("INVALID_ADDRESS", "Enter the delivery state.");

        var pin = (shipping.PinCode ?? string.Empty).Trim();
        if (requireIndian)
        {
            if (!Regex.IsMatch(pin, @"^[1-9][0-9]{5}$"))
                throw ViviException.Conflict("INVALID_PIN", "Enter a valid 6-digit PIN code.");
        }
        else if (pin.Length is < 3 or > 12)
        {
            throw ViviException.Conflict("INVALID_PIN", "Enter a valid postal code.");
        }
    }

    private static void ApplyShipping(Order order, ShippingAddressInput shipping)
    {
        order.ShipFullName = shipping.FullName.Trim();
        order.ShipPhone = shipping.PhoneNumber.Trim();
        order.ShipAddressLine1 = shipping.AddressLine1.Trim();
        order.ShipAddressLine2 = string.IsNullOrWhiteSpace(shipping.AddressLine2) ? null : shipping.AddressLine2.Trim();
        order.ShipLandmark = string.IsNullOrWhiteSpace(shipping.Landmark) ? null : shipping.Landmark.Trim();
        order.ShipCity = shipping.City.Trim();
        order.ShipState = shipping.State.Trim();
        order.ShipPinCode = shipping.PinCode.Trim();
        order.ShipCountry = string.IsNullOrWhiteSpace(shipping.Country) ? "India" : shipping.Country.Trim();
    }

    private async Task<(OrderItem Item, ProductType? ProductType)> BuildOrderItemAsync(
        CheckoutLineInput line,
        Guid customerId,
        CancellationToken cancellationToken)
    {
        return line.ItemType switch
        {
            OrderItemType.Product => await BuildProductItemAsync(line, cancellationToken),
            OrderItemType.Course => (await BuildCourseItemAsync(line, OrderItemType.Course, customerId, cancellationToken), null),
            OrderItemType.CourseBundle => (await BuildCourseItemAsync(line, OrderItemType.CourseBundle, customerId, cancellationToken), null),
            OrderItemType.LivePackage => throw ViviException.Conflict(
                "USE_LIVE_BOOKING_API",
                "Book live packages via POST /api/live/bookings."),
            _ => throw ViviException.Conflict("INVALID_ITEM_TYPE", "Unsupported order item type.")
        };
    }

    private async Task<(OrderItem Item, ProductType? ProductType)> BuildProductItemAsync(
        CheckoutLineInput line,
        CancellationToken cancellationToken)
    {
        if (!line.ProductId.HasValue)
            throw ViviException.Conflict("INVALID_PRODUCT", "Product id is required.");

        if (line.Quantity < 1)
            throw ViviException.Conflict("INVALID_QUANTITY", "Product quantity must be at least 1.");

        var product = await _db.Products
            .AsNoTracking()
            .SingleOrDefaultAsync(p => p.Id == line.ProductId && p.Status == ProductStatus.Published, cancellationToken)
            ?? throw ViviException.NotFound("PRODUCT_NOT_FOUND", "Product was not found or is not published.");

        _inventory.EnsureAvailableOrThrow(product, line.Quantity);

        var unitPrice = product.Price;
        var discount = product.Mrp.HasValue && product.Mrp > product.Price
            ? (product.Mrp.Value - product.Price) * line.Quantity
            : 0;

        var item = new OrderItem
        {
            Id = Guid.NewGuid(),
            ItemType = OrderItemType.Product,
            ProductId = product.Id,
            Quantity = line.Quantity,
            UnitPrice = unitPrice,
            DiscountAmount = discount,
            TotalAmount = unitPrice * line.Quantity,
            ItemNameSnapshot = product.Name
        };
        return (item, product.ProductType);
    }

    private async Task<OrderItem> BuildCourseItemAsync(
        CheckoutLineInput line,
        OrderItemType itemType,
        Guid customerId,
        CancellationToken cancellationToken)
    {
        if (!line.CourseId.HasValue)
            throw ViviException.Conflict("INVALID_COURSE", "Course id is required.");

        if (line.Quantity != 1)
            throw ViviException.Conflict("INVALID_QUANTITY", "Course quantity must be 1.");

        var course = await _db.Courses
            .AsNoTracking()
            .Include(c => c.LaunchOffer)
            .Include(c => c.BundleItems)
            .SingleOrDefaultAsync(c => c.Id == line.CourseId && c.Status == CourseStatus.Published, cancellationToken)
            ?? throw ViviException.NotFound("COURSE_NOT_FOUND", "Course was not found or is not published.");

        if (itemType == OrderItemType.CourseBundle && course.Type != CourseType.Bundle)
            throw ViviException.Conflict("NOT_A_BUNDLE", "This course is not a bundle.");

        if (itemType == OrderItemType.Course && course.Type == CourseType.Bundle)
            itemType = OrderItemType.CourseBundle;

        var (unitPrice, isRenewal, basePrice, _) = await _pricing.ResolveCheckoutUnitPriceAsync(
            course,
            customerId,
            cancellationToken);

        var listForDiscount = course.Mrp ?? (isRenewal ? basePrice : unitPrice);
        var discount = listForDiscount > unitPrice ? listForDiscount - unitPrice : 0;

        return new OrderItem
        {
            Id = Guid.NewGuid(),
            ItemType = itemType,
            CourseId = course.Id,
            Quantity = 1,
            UnitPrice = unitPrice,
            DiscountAmount = discount,
            TotalAmount = unitPrice,
            ItemNameSnapshot = isRenewal ? $"{course.Name} (renewal)" : course.Name
        };
    }

    private static int ToPaise(decimal amount) => (int)Math.Round(amount * 100m, MidpointRounding.AwayFromZero);

    private async Task<string> GenerateOrderNumberAsync(CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var candidate = $"VIVI-{DateTime.UtcNow:yyyyMMdd}-{Random.Shared.Next(100000, 999999)}";
            var exists = await _db.Orders.AnyAsync(o => o.OrderNumber == candidate, cancellationToken);
            if (!exists)
                return candidate;
        }

        return $"VIVI-{Guid.NewGuid():N}"[..24].ToUpperInvariant();
    }
}

public sealed class RazorpayOptionsAccessor
{
    public string KeyId { get; init; } = string.Empty;
}
