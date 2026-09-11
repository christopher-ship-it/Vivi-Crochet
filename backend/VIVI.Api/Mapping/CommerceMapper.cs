using VIVI.Api.DTOs.Enrollments;
using VIVI.Api.DTOs.Orders;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Auth;
using VIVI.Infrastructure.Commerce;

namespace VIVI.Api.Mapping;

public static class CommerceMapper
{
    public static OrderResponse ToDto(this Order order, IDeliveryEstimateService? delivery = null)
    {
        var payment = order.Payments?
            .OrderByDescending(p => p.UpdatedAt)
            .FirstOrDefault();

        return new OrderResponse
        {
            Id = order.Id,
            OrderNumber = order.OrderNumber,
            Status = order.Status,
            Currency = order.Currency,
            Subtotal = order.Subtotal,
            DiscountAmount = order.DiscountAmount,
            TaxAmount = order.TaxAmount,
            ShippingAmount = order.ShippingAmount,
            TotalAmount = order.TotalAmount,
            PaymentMethod = "Online Payment",
            PaymentStatus = payment?.Status,
            RazorpayOrderId = order.RazorpayOrderId,
            CreatedAt = order.CreatedAt,
            PaidAt = order.PaidAt,
            ConfirmedAt = order.ConfirmedAt,
            Items = order.Items.Select(i => i.ToDto()).ToList(),
            ShippingAddress = order.ToShippingAddress(),
            Delivery = delivery is not null ? order.ToDeliveryDto(delivery) : order.ToDeliveryDtoWithoutService()
        };
    }

    public static OrderItemResponse ToDto(this OrderItem item) => new()
    {
        Id = item.Id,
        ItemType = item.ItemType,
        ProductId = item.ProductId,
        CourseId = item.CourseId,
        Quantity = item.Quantity,
        UnitPrice = item.UnitPrice,
        DiscountAmount = item.DiscountAmount,
        TotalAmount = item.TotalAmount,
        ItemNameSnapshot = item.ItemNameSnapshot
    };

    public static CreateOrderResponse ToCheckoutResponse(this Order order, CheckoutResult result) => new()
    {
        OrderId = order.Id,
        OrderNumber = order.OrderNumber,
        RazorpayOrderId = result.RazorpayOrderId,
        RazorpayKeyId = result.RazorpayKeyId,
        AmountPaise = result.AmountPaise,
        Currency = result.Currency,
        TotalAmount = order.TotalAmount,
        PaymentMethod = "Online Payment",
        Delivery = result.Delivery is null ? null : result.Delivery.ToDto()
    };

    public static DeliveryQuoteResponse ToDto(this DeliveryQuoteSnapshot quote) => new()
    {
        IsCoimbatore = quote.IsCoimbatore,
        LocationLabel = quote.LocationLabel,
        MinDays = quote.MinDays,
        MaxDays = quote.MaxDays,
        Summary = quote.Summary,
        EstimatedDeliveryDateFrom = quote.EstimatedDeliveryDateFrom,
        EstimatedDeliveryDateTo = quote.EstimatedDeliveryDateTo,
        PaymentMethod = "Online Payment"
    };

    public static ShippingAddressInput ToInput(this ShippingAddressRequest address) => new(
        address.FullName.Trim(),
        address.PhoneNumber.Trim(),
        address.AddressLine1.Trim(),
        string.IsNullOrWhiteSpace(address.AddressLine2) ? null : address.AddressLine2.Trim(),
        string.IsNullOrWhiteSpace(address.Landmark) ? null : address.Landmark.Trim(),
        address.City.Trim(),
        address.State.Trim(),
        address.PinCode.Trim());

    public static EnrollmentResponse ToDto(this CourseEnrollment enrollment, DateTime utcNow) => new()
    {
        Id = enrollment.Id,
        CourseId = enrollment.CourseId,
        CourseName = enrollment.Course?.Name ?? string.Empty,
        PurchaseDate = enrollment.PurchaseDate,
        AccessStartDate = enrollment.AccessStartDate,
        AccessExpiryDate = enrollment.AccessExpiryDate,
        IsActive = enrollment.AccessStartDate <= utcNow && enrollment.AccessExpiryDate > utcNow,
        IsExpired = enrollment.AccessExpiryDate <= utcNow,
        CompletedFlag = enrollment.CompletedFlag,
        CompletedAt = enrollment.CompletedAt
    };

    public static CoursePricingResponse ToDto(this CoursePricingResult pricing) => new()
    {
        CourseId = pricing.CourseId,
        Name = pricing.Name,
        CourseName = pricing.Name,
        ListPrice = pricing.ListPrice,
        Mrp = pricing.Mrp,
        Price = pricing.Price,
        ApplicablePrice = pricing.Price,
        IsLaunchOffer = pricing.IsLaunchOffer,
        LaunchOfferActive = pricing.IsLaunchOffer,
        LaunchOfferRemaining = pricing.LaunchOfferRemaining,
        AccessDays = pricing.AccessDays
    };

    public static AdminOrderListItemResponse ToAdminListItem(this Order order, IDeliveryEstimateService delivery)
    {
        var hasPhysical = order.Items.Any(i => i.ItemType == OrderItemType.Product);
        var payment = order.Payments?.OrderByDescending(p => p.UpdatedAt).FirstOrDefault();
        return new AdminOrderListItemResponse
        {
            Id = order.Id,
            OrderNumber = order.OrderNumber,
            Status = order.Status,
            PaymentStatus = payment?.Status,
            TotalAmount = order.TotalAmount,
            CustomerName = DisplayCustomerName(order.Customer, order.ShipFullName),
            CustomerPhone = order.Customer?.PhoneNumber ?? order.ShipPhone ?? string.Empty,
            CreatedAt = order.CreatedAt,
            HasPhysicalItems = hasPhysical,
            DeliveryDateOverridden = delivery.HasManualOverride(order),
            DeliveryLabel = hasPhysical && order.DeliveryEstimateMinDays.HasValue
                ? delivery.CustomerDeliveryLabel(order)
                : null
        };
    }

    public static AdminOrderDetailResponse ToAdminDetail(this Order order, IDeliveryEstimateService delivery)
    {
        var baseDto = order.ToDto(delivery);
        return new AdminOrderDetailResponse
        {
            Id = baseDto.Id,
            OrderNumber = baseDto.OrderNumber,
            Status = baseDto.Status,
            Currency = baseDto.Currency,
            Subtotal = baseDto.Subtotal,
            DiscountAmount = baseDto.DiscountAmount,
            TaxAmount = baseDto.TaxAmount,
            ShippingAmount = baseDto.ShippingAmount,
            TotalAmount = baseDto.TotalAmount,
            PaymentMethod = baseDto.PaymentMethod,
            PaymentStatus = baseDto.PaymentStatus,
            RazorpayOrderId = baseDto.RazorpayOrderId,
            CreatedAt = baseDto.CreatedAt,
            PaidAt = baseDto.PaidAt,
            ConfirmedAt = baseDto.ConfirmedAt,
            Items = baseDto.Items,
            ShippingAddress = baseDto.ShippingAddress,
            Delivery = baseDto.Delivery,
            CustomerName = DisplayCustomerName(order.Customer, order.ShipFullName),
            CustomerPhone = order.Customer?.PhoneNumber ?? order.ShipPhone ?? string.Empty,
            CustomerEmail = order.Customer?.Email ?? string.Empty,
            OverrideReason = order.DeliveryDateOverrideReason,
            OverriddenAt = order.DeliveryDateOverriddenAt,
            OverriddenByName = order.DeliveryDateOverriddenByUser?.Name,
            DeliveryHistory = (order.DeliveryUpdates ?? Array.Empty<OrderDeliveryUpdate>())
                .OrderByDescending(u => u.ChangedAt)
                .Select(u => new OrderDeliveryHistoryResponse
                {
                    Id = u.Id,
                    PreviousFrom = u.PreviousDateFrom,
                    PreviousTo = u.PreviousDateTo,
                    NewFrom = u.NewDateFrom,
                    NewTo = u.NewDateTo,
                    Reason = u.Reason,
                    ChangedBy = u.ChangedBy,
                    ChangedByName = u.ChangedByUser?.Name ?? string.Empty,
                    ChangedAt = u.ChangedAt
                })
                .ToList()
        };
    }

    private static ShippingAddressResponse? ToShippingAddress(this Order order)
    {
        if (string.IsNullOrWhiteSpace(order.ShipAddressLine1) || string.IsNullOrWhiteSpace(order.ShipCity))
            return null;

        return new ShippingAddressResponse
        {
            FullName = order.ShipFullName ?? string.Empty,
            PhoneNumber = order.ShipPhone ?? string.Empty,
            AddressLine1 = order.ShipAddressLine1 ?? string.Empty,
            AddressLine2 = order.ShipAddressLine2,
            Landmark = order.ShipLandmark,
            City = order.ShipCity ?? string.Empty,
            State = order.ShipState ?? string.Empty,
            PinCode = order.ShipPinCode ?? string.Empty,
            Country = order.ShipCountry ?? "India"
        };
    }

    private static OrderDeliveryResponse? ToDeliveryDto(this Order order, IDeliveryEstimateService delivery)
    {
        if (!order.DeliveryEstimateMinDays.HasValue && !order.EstimatedDeliveryDateFrom.HasValue)
            return null;

        var system = delivery.GetSystemDates(order);
        var effective = delivery.GetEffectiveDates(order);
        var isCoimbatore = order.IsCoimbatoreDelivery == true;
        return new OrderDeliveryResponse
        {
            IsCoimbatore = isCoimbatore,
            LocationLabel = isCoimbatore ? "Coimbatore" : "Outside Coimbatore",
            MinDays = order.DeliveryEstimateMinDays ?? 0,
            MaxDays = order.DeliveryEstimateMaxDays ?? 0,
            EstimateSummary = delivery.FormatWindowSummary(new DeliveryWindow(
                order.DeliveryEstimateMinDays ?? 1,
                order.DeliveryEstimateMaxDays ?? 1)),
            SystemFrom = system.From,
            SystemTo = system.To,
            ExpectedFrom = effective.From,
            ExpectedTo = effective.To,
            IsOverridden = delivery.HasManualOverride(order),
            CustomerLabel = delivery.CustomerDeliveryLabel(order)
        };
    }

    private static OrderDeliveryResponse? ToDeliveryDtoWithoutService(this Order order)
    {
        if (order.EstimatedDeliveryDateFrom is not DateTime from || order.EstimatedDeliveryDateTo is not DateTime to)
            return null;

        var effectiveFrom = order.ManualDeliveryDateFrom ?? from;
        var effectiveTo = order.ManualDeliveryDateTo ?? to;
        var isCoimbatore = order.IsCoimbatoreDelivery == true;
        var overridden = order.ManualDeliveryDateFrom.HasValue;
        return new OrderDeliveryResponse
        {
            IsCoimbatore = isCoimbatore,
            LocationLabel = isCoimbatore ? "Coimbatore" : "Outside Coimbatore",
            MinDays = order.DeliveryEstimateMinDays ?? 0,
            MaxDays = order.DeliveryEstimateMaxDays ?? 0,
            EstimateSummary = string.Empty,
            SystemFrom = from,
            SystemTo = to,
            ExpectedFrom = effectiveFrom,
            ExpectedTo = effectiveTo,
            IsOverridden = overridden,
            CustomerLabel = string.Empty
        };
    }

    /// <summary>Prefer a real account name; fall back to shipping name when OTP left the placeholder.</summary>
    public static string DisplayCustomerName(Customer? customer, string? shipFullName = null)
    {
        if (customer is not null && !CustomerAccountService.IsPlaceholderName(customer.FullName))
            return customer.FullName;

        if (!CustomerAccountService.IsPlaceholderName(shipFullName))
            return shipFullName!.Trim();

        if (customer is not null && !CustomerAccountService.IsPlaceholderName(customer.ShipFullName))
            return customer.ShipFullName!.Trim();

        return customer?.FullName ?? string.Empty;
    }
}
