using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using VIVI.Infrastructure.Commerce;

namespace VIVI.Api.Tests;

public class ApiFactory : WebApplicationFactory<Program>
{
    public const string AdminEmail = "admin@vivicrochet.local";
    public const string AdminPassword = "TestAdmin!234";

    private readonly string _databaseName = $"vivi-tests-{Guid.NewGuid():N}";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Jwt:SigningKey", "vivi-test-signing-key-must-be-32-chars!");
        builder.UseSetting("Jwt:Issuer", "vivi-api");
        builder.UseSetting("Jwt:Audience", "vivi-clients");
        builder.UseSetting("Seed:AdminEmail", AdminEmail);
        builder.UseSetting("Seed:AdminPassword", AdminPassword);
        builder.UseSetting("Seed:AdminName", "Test Admin");
        builder.UseSetting("Blob:Provider", "InMemory");
        builder.UseSetting("Database:Provider", "InMemory");
        builder.UseSetting("Database:Name", _databaseName);
        builder.UseSetting("Razorpay:KeyId", FakeRazorpayPaymentGateway.TestKeyId);
        builder.UseSetting("Razorpay:KeySecret", "test_secret");
        builder.UseSetting("Razorpay:WebhookSecret", "test_webhook_secret");
        builder.UseSetting("LiveStudio:PackagePrice", "999");
        builder.UseSetting("LiveStudio:DefaultSeatCapacity", "5");
        builder.UseSetting("LiveStudio:ReservationMinutes", "15");
        builder.UseSetting("LiveStudio:SeasonStartMonday", "2026-01-05");
    }
}
