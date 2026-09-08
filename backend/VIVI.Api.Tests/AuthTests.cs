using System.Net;
using Xunit;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using VIVI.Api.DTOs.Auth;
using VIVI.Infrastructure.Auth;

namespace VIVI.Api.Tests;

public sealed class AuthTests : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client;

    public AuthTests(ApiFactory factory)
    {
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

    internal static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

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
}
