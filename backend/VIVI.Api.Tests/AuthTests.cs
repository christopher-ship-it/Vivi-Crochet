using System.Net;
using Xunit;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using VIVI.Api.Controllers;
using VIVI.Api.DTOs.Auth;
using VIVI.Infrastructure.Auth;

namespace VIVI.Api.Tests;

public sealed class AuthTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public AuthTests(ApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Login_with_seed_admin_returns_jwt()
    {
        var response = await _client.PostAsJsonAsync("/api/auth/login", new
        {
            email = ApiFactory.AdminEmail,
            password = ApiFactory.AdminPassword
        });

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<LoginResponse>(Json);
        Assert.False(string.IsNullOrWhiteSpace(body!.AccessToken));
        Assert.Equal("Admin", body.User.Role);
        Assert.Equal(ApiFactory.AdminEmail, body.User.Email);
    }

    [Fact]
    public async Task Login_with_wrong_password_is_unauthorized()
    {
        var response = await _client.PostAsJsonAsync("/api/auth/login", new
        {
            email = ApiFactory.AdminEmail,
            password = "WrongPassword1"
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Protected_endpoint_without_token_is_unauthorized()
    {
        var response = await _client.PostAsJsonAsync("/api/courses", new
        {
            name = "Basic",
            price = 299
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Mobile_otp_verify_returns_customer_jwt()
    {
        var request = await _client.PostAsJsonAsync("/api/auth/mobile/otp/request", new { phone = "9876543210" });
        request.EnsureSuccessStatusCode();
        var challenge = await request.Content.ReadFromJsonAsync<OtpRequestResponse>(Json);
        Assert.NotNull(challenge);

        var verify = await _client.PostAsJsonAsync("/api/auth/mobile/otp/verify", new
        {
            challengeId = challenge!.ChallengeId,
            code = FakeOtpService.TestCode,
            name = "Test Customer"
        });

        verify.EnsureSuccessStatusCode();
        var body = await verify.Content.ReadFromJsonAsync<LoginResponse>(Json);
        Assert.Equal("Customer", body!.User.Role);
        Assert.False(string.IsNullOrWhiteSpace(body.AccessToken));
    }

    [Fact]
    public async Task Email_register_and_login_returns_customer_jwt()
    {
        var email = $"intl.{Guid.NewGuid():N}@example.com";
        var register = await _client.PostAsJsonAsync("/api/auth/mobile/email/register", new
        {
            email,
            password = "SecurePass1",
            age = 28,
            country = "United Kingdom"
        });

        register.EnsureSuccessStatusCode();
        var created = await register.Content.ReadFromJsonAsync<LoginResponse>(Json);
        Assert.Equal("Customer", created!.User.Role);
        Assert.Equal(email.ToLowerInvariant(), created.User.Email);

        var login = await _client.PostAsJsonAsync("/api/auth/mobile/email/login", new
        {
            email,
            password = "SecurePass1"
        });
        login.EnsureSuccessStatusCode();
        var signedIn = await login.Content.ReadFromJsonAsync<LoginResponse>(Json);
        Assert.Equal("Customer", signedIn!.User.Role);
        Assert.False(string.IsNullOrWhiteSpace(signedIn.AccessToken));
    }

    [Fact]
    public async Task Email_login_unknown_email_asks_to_register()
    {
        var login = await _client.PostAsJsonAsync("/api/auth/mobile/email/login", new
        {
            email = $"missing.{Guid.NewGuid():N}@example.com",
            password = "SecurePass1"
        });

        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
        var body = await login.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("ACCOUNT_NOT_FOUND", body.GetProperty("code").GetString());
        Assert.Contains("create an account", body.GetProperty("message").GetString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Email_register_duplicate_is_conflict()
    {
        var email = $"dup.{Guid.NewGuid():N}@example.com";
        var first = await _client.PostAsJsonAsync("/api/auth/mobile/email/register", new
        {
            email,
            password = "SecurePass1",
            age = 30,
            country = "Canada"
        });
        first.EnsureSuccessStatusCode();

        var second = await _client.PostAsJsonAsync("/api/auth/mobile/email/register", new
        {
            email,
            password = "SecurePass1",
            age = 30,
            country = "Canada"
        });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task Admin_login_rejects_customer_email_account()
    {
        var email = $"cust.{Guid.NewGuid():N}@example.com";
        var register = await _client.PostAsJsonAsync("/api/auth/mobile/email/register", new
        {
            email,
            password = "SecurePass1",
            age = 25,
            country = "Australia"
        });
        register.EnsureSuccessStatusCode();

        var adminLogin = await _client.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "SecurePass1"
        });
        Assert.Equal(HttpStatusCode.Unauthorized, adminLogin.StatusCode);
    }

    internal static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    [Fact]
    public async Task Email_password_reset_updates_password()
    {
        var email = $"reset.{Guid.NewGuid():N}@example.com";
        var register = await _client.PostAsJsonAsync("/api/auth/mobile/email/register", new
        {
            email,
            password = "OldPass123",
            age = 32,
            country = "United States"
        });
        register.EnsureSuccessStatusCode();

        var request = await _client.PostAsJsonAsync("/api/auth/mobile/email/password-reset/request", new { email });
        request.EnsureSuccessStatusCode();

        var confirm = await _client.PostAsJsonAsync("/api/auth/mobile/email/password-reset/confirm", new
        {
            email,
            code = AuthController.TestPasswordResetCode,
            newPassword = "NewPass123"
        });
        Assert.Equal(HttpStatusCode.NoContent, confirm.StatusCode);

        var oldLogin = await _client.PostAsJsonAsync("/api/auth/mobile/email/login", new
        {
            email,
            password = "OldPass123"
        });
        Assert.Equal(HttpStatusCode.Unauthorized, oldLogin.StatusCode);

        var newLogin = await _client.PostAsJsonAsync("/api/auth/mobile/email/login", new
        {
            email,
            password = "NewPass123"
        });
        newLogin.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Email_verification_otp_marks_profile_verified()
    {
        var phone = $"98{Random.Shared.Next(10000000, 99999999)}";
        var customer = await LoginCustomerAsync(_client, phone);
        var email = $"verify.{Guid.NewGuid():N}@example.com";

        var before = await customer.GetFromJsonAsync<JsonElement>("/api/me/profile", Json);
        Assert.False(before.GetProperty("isEmailVerified").GetBoolean());

        var blocked = await customer.PutAsJsonAsync("/api/me/profile", new
        {
            fullName = "Verify Me",
            email
        });
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);

        var request = await customer.PostAsJsonAsync("/api/me/email/verify/request", new { email });
        request.EnsureSuccessStatusCode();

        var confirm = await customer.PostAsJsonAsync("/api/me/email/verify/confirm", new
        {
            email,
            code = MeController.TestEmailVerificationCode
        });
        confirm.EnsureSuccessStatusCode();
        var after = await confirm.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.True(after.GetProperty("isEmailVerified").GetBoolean());
        Assert.Equal(email, after.GetProperty("email").GetString(), ignoreCase: true);

        var profile = await customer.GetFromJsonAsync<JsonElement>("/api/me/profile", Json);
        Assert.True(profile.GetProperty("isEmailVerified").GetBoolean());
        Assert.Equal(email, profile.GetProperty("email").GetString(), ignoreCase: true);
    }

    [Fact]
    public async Task Email_verification_request_does_not_send_duplicate_otp_within_cooldown()
    {
        var emails = _factory.GetFakeEmailService();
        emails.Clear();

        var customer = await LoginCustomerAsync(_factory.CreateClient(), "9876500099");
        var email = $"dedupe.{Guid.NewGuid():N}@example.com";

        var first = await customer.PostAsJsonAsync("/api/me/email/verify/request", new { email });
        first.EnsureSuccessStatusCode();
        var second = await customer.PostAsJsonAsync("/api/me/email/verify/request", new { email });
        second.EnsureSuccessStatusCode();

        Assert.Single(
            emails.SentMessages,
            m => m.To.Equals(email, StringComparison.OrdinalIgnoreCase));
    }

    internal static async Task<string> LoginAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = ApiFactory.AdminEmail,
            password = ApiFactory.AdminPassword
        });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<LoginResponse>(Json);
        return body!.AccessToken;
    }

    internal static HttpClient WithToken(HttpClient client, string token)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    internal static async Task<HttpClient> LoginCustomerAsync(HttpClient client, string phone = "9876543210")
    {
        var request = await client.PostAsJsonAsync("/api/auth/mobile/otp/request", new { phone });
        request.EnsureSuccessStatusCode();
        var challenge = await request.Content.ReadFromJsonAsync<OtpRequestResponse>(Json);

        var verify = await client.PostAsJsonAsync("/api/auth/mobile/otp/verify", new
        {
            challengeId = challenge!.ChallengeId,
            code = FakeOtpService.TestCode,
            name = "Test Customer"
        });
        verify.EnsureSuccessStatusCode();
        var body = await verify.Content.ReadFromJsonAsync<LoginResponse>(Json);
        return WithToken(client, body!.AccessToken);
    }

    internal static async Task EnsureVerifiedEmailAsync(HttpClient customer, string? email = null)
    {
        email ??= $"live.{Guid.NewGuid():N}@example.com";
        var request = await customer.PostAsJsonAsync("/api/me/email/verify/request", new { email });
        request.EnsureSuccessStatusCode();
        var confirm = await customer.PostAsJsonAsync("/api/me/email/verify/confirm", new
        {
            email,
            code = MeController.TestEmailVerificationCode
        });
        confirm.EnsureSuccessStatusCode();
    }
}
