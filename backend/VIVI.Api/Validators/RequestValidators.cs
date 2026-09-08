using FluentValidation;
using VIVI.Api.DTOs.Auth;
using VIVI.Api.DTOs.Categories;
using VIVI.Api.DTOs.Courses;
using VIVI.Api.DTOs.Customers;
using VIVI.Api.DTOs.Orders;
using VIVI.Api.DTOs.Payments;
using VIVI.Api.DTOs.Products;
using VIVI.Api.DTOs.Videos;
using VIVI.Core.Enums;

namespace VIVI.Api.Validators;

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8).MaximumLength(128);
    }
}

public sealed class DevCustomerLoginRequestValidator : AbstractValidator<DevCustomerLoginRequest>
{
    public DevCustomerLoginRequestValidator()
    {
        RuleFor(x => x.Phone)
            .NotEmpty()
            .Matches(@"^\d{10}$")
            .WithMessage("Phone must be a 10-digit Indian mobile number.");
        RuleFor(x => x.Name).MaximumLength(120);
    }
}

public sealed class OtpRequestValidator : AbstractValidator<OtpRequest>
{
    public OtpRequestValidator()
    {
        RuleFor(x => x.Phone)
            .NotEmpty()
            .Matches(@"^\d{10}$")
            .WithMessage("Phone must be a 10-digit Indian mobile number.");
    }
}

public sealed class OtpVerifyRequestValidator : AbstractValidator<OtpVerifyRequest>
{
    public OtpVerifyRequestValidator()
    {
        RuleFor(x => x.ChallengeId).NotEmpty();
        RuleFor(x => x.Code)
            .NotEmpty()
            .Matches(@"^\d{4,6}$")
            .WithMessage("OTP must be 4–6 digits.");
        RuleFor(x => x.Name).MaximumLength(120);
    }
}

public sealed class CategoryRequestValidator : AbstractValidator<CategoryRequest>
{
    public CategoryRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(80);
        RuleFor(x => x.Description).MaximumLength(400);
    }
}

public sealed class CourseRequestValidator : AbstractValidator<CourseRequest>
{
    public CourseRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(160);
        RuleFor(x => x.Level).MaximumLength(80);
        RuleFor(x => x.About).MaximumLength(2000);
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Mrp).GreaterThanOrEqualTo(0).When(x => x.Mrp.HasValue);
        RuleFor(x => x.AccessDays).InclusiveBetween(1, 3650);
        RuleFor(x => x.RenewalPercentage).InclusiveBetween((byte)0, (byte)100);
        RuleFor(x => x.Languages).MaximumLength(200);
        RuleFor(x => x.Type).IsInEnum();
        RuleFor(x => x.LaunchPrice).GreaterThanOrEqualTo(0).When(x => x.LaunchPrice.HasValue);
        RuleFor(x => x.LaunchLimit).InclusiveBetween(1, 100_000).When(x => x.LaunchLimit.HasValue);
        RuleFor(x => x.RegularPriceAfterLaunch).GreaterThanOrEqualTo(0).When(x => x.RegularPriceAfterLaunch.HasValue);
    }
}

public sealed class UploadUrlRequestValidator : AbstractValidator<UploadUrlRequest>
{
    public UploadUrlRequestValidator()
    {
        RuleFor(x => x.CourseId).NotEmpty();
        RuleFor(x => x.FileName).NotEmpty().MaximumLength(260);
        RuleFor(x => x.ContentType).NotEmpty().MaximumLength(80);
        RuleFor(x => x.FileSizeBytes).GreaterThan(0);
    }
}

public sealed class UpdateVideoRequestValidator : AbstractValidator<UpdateVideoRequest>
{
    public UpdateVideoRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(1000);
        RuleFor(x => x.DurationSeconds).GreaterThanOrEqualTo(0).When(x => x.DurationSeconds.HasValue);
    }
}

public sealed class CreateOrderRequestValidator : AbstractValidator<CreateOrderRequest>
{
    public CreateOrderRequestValidator()
    {
        RuleFor(x => x.Items).NotEmpty();
        RuleForEach(x => x.Items).SetValidator(new CreateOrderItemRequestValidator());
        RuleFor(x => x.ShippingAddress).SetValidator(new ShippingAddressRequestValidator()!)
            .When(x => x.ShippingAddress is not null);
    }
}

public sealed class DeliveryQuoteRequestValidator : AbstractValidator<DeliveryQuoteRequest>
{
    public DeliveryQuoteRequestValidator()
    {
        RuleFor(x => x.Items).NotEmpty();
        RuleForEach(x => x.Items).SetValidator(new CreateOrderItemRequestValidator());
        RuleFor(x => x.ShippingAddress).NotNull().SetValidator(new ShippingAddressRequestValidator());
    }
}

public sealed class ShippingAddressRequestValidator : AbstractValidator<ShippingAddressRequest>
{
    public ShippingAddressRequestValidator()
    {
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(120);
        RuleFor(x => x.PhoneNumber)
            .NotEmpty()
            .Matches(@"^\d{10}$")
            .WithMessage("Phone must be a 10-digit Indian mobile number.");
        RuleFor(x => x.AddressLine1).NotEmpty().MaximumLength(200);
        RuleFor(x => x.AddressLine2).MaximumLength(200);
        RuleFor(x => x.Landmark).MaximumLength(120);
        RuleFor(x => x.City).NotEmpty().MaximumLength(80);
        RuleFor(x => x.State).NotEmpty().MaximumLength(80);
        RuleFor(x => x.PinCode)
            .NotEmpty()
            .Matches(@"^[1-9][0-9]{5}$")
            .WithMessage("PIN code must be a valid 6-digit Indian PIN.");
    }
}

public sealed class UpdateDeliveryDateRequestValidator : AbstractValidator<UpdateDeliveryDateRequest>
{
    public UpdateDeliveryDateRequestValidator()
    {
        RuleFor(x => x.DeliveryDateFrom).NotEqual(default(DateTime));
        RuleFor(x => x.Reason).MaximumLength(400);
        RuleFor(x => x)
            .Must(x => !x.DeliveryDateTo.HasValue || x.DeliveryDateTo.Value.Date >= x.DeliveryDateFrom.Date)
            .WithMessage("Delivery end date cannot be before the start date.");
    }
}

public sealed class ProductRequestValidator : AbstractValidator<ProductRequest>
{
    public ProductRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(160);
        RuleFor(x => x.Category).NotEmpty().MaximumLength(80);
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Mrp).GreaterThanOrEqualTo(0).When(x => x.Mrp.HasValue);
        RuleFor(x => x.ProductType).IsInEnum();
        RuleFor(x => x.AvailableStock).GreaterThanOrEqualTo(0);
    }
}

public sealed class CreateOrderItemRequestValidator : AbstractValidator<CreateOrderItemRequest>
{
    public CreateOrderItemRequestValidator()
    {
        RuleFor(x => x.ItemType).IsInEnum();
        RuleFor(x => x.Quantity).GreaterThan(0);
        RuleFor(x => x.ProductId).NotEmpty().When(x => x.ItemType == OrderItemType.Product);
        RuleFor(x => x.CourseId).NotEmpty().When(x => x.ItemType is OrderItemType.Course or OrderItemType.CourseBundle);
    }
}

public sealed class RazorpayVerifyRequestValidator : AbstractValidator<RazorpayVerifyRequest>
{
    public RazorpayVerifyRequestValidator()
    {
        RuleFor(x => x.InternalOrderId).NotEmpty();
        RuleFor(x => x.RazorpayOrderId).NotEmpty().MaximumLength(64);
        RuleFor(x => x.RazorpayPaymentId).NotEmpty().MaximumLength(64);
        RuleFor(x => x.RazorpaySignature).NotEmpty().MaximumLength(256);
    }
}

public sealed class UpdateCustomerProfileRequestValidator : AbstractValidator<UpdateCustomerProfileRequest>
{
    public UpdateCustomerProfileRequestValidator()
    {
        RuleFor(x => x.FullName).MaximumLength(120).When(x => !string.IsNullOrWhiteSpace(x.FullName));
        RuleFor(x => x.Email).EmailAddress().MaximumLength(256).When(x => !string.IsNullOrWhiteSpace(x.Email));
        RuleFor(x => x.ShippingAddress).SetValidator(new SavedShippingAddressRequestValidator()!)
            .When(x => x.ShippingAddress is not null);
    }
}

public sealed class SavedShippingAddressRequestValidator : AbstractValidator<SavedShippingAddressRequest>
{
    public SavedShippingAddressRequestValidator()
    {
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(120);
        RuleFor(x => x.PhoneNumber)
            .NotEmpty()
            .Matches(@"^\d{10}$")
            .WithMessage("Phone must be a 10-digit Indian mobile number.");
        RuleFor(x => x.AddressLine1).NotEmpty().MaximumLength(200);
        RuleFor(x => x.AddressLine2).MaximumLength(200);
        RuleFor(x => x.Landmark).MaximumLength(120);
        RuleFor(x => x.City).NotEmpty().MaximumLength(80);
        RuleFor(x => x.State).NotEmpty().MaximumLength(80);
        RuleFor(x => x.PinCode)
            .NotEmpty()
            .Matches(@"^[1-9][0-9]{5}$")
            .WithMessage("PIN code must be a valid 6-digit Indian PIN.");
    }
}
