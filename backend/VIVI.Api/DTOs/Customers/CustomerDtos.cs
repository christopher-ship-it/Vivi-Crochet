namespace VIVI.Api.DTOs.Customers;

public sealed class CustomerProfileResponse
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public SavedShippingAddressResponse? ShippingAddress { get; set; }
}

public sealed class SavedShippingAddressResponse
{
    public string FullName { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string AddressLine1 { get; set; } = string.Empty;
    public string? AddressLine2 { get; set; }
    public string? Landmark { get; set; }
    public string City { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string PinCode { get; set; } = string.Empty;
    public string Country { get; set; } = "India";
}

public sealed class UpdateCustomerProfileRequest
{
    public string? FullName { get; set; }
    public string? Email { get; set; }
    public SavedShippingAddressRequest? ShippingAddress { get; set; }
}

public sealed class SavedShippingAddressRequest
{
    public string FullName { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string AddressLine1 { get; set; } = string.Empty;
    public string? AddressLine2 { get; set; }
    public string? Landmark { get; set; }
    public string City { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string PinCode { get; set; } = string.Empty;
    public string? Country { get; set; }
}

/// <summary>Admin list row for a mobile app customer (OTP sign-in).</summary>
public sealed class AdminCustomerListItemResponse
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime SignedUpAt { get; set; }
    /// <summary>Approx. last app activity — updated on each OTP sign-in.</summary>
    public DateTime LastActiveAt { get; set; }
    public int OrderCount { get; set; }
}
