using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using VIVI.Api.DTOs.Auth;
using Xunit;

namespace VIVI.Api.Tests;

/// <summary>Boots the API with Seed:TestAccount configured, as production would be.</summary>
public sealed class TestAccountApiFactory : ApiFactory
{
    public const string Phone = "9999999999";
    public const string Secret = "vivi-test-access-code-1234";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("Seed:TestAccount:Enabled", "true");
        builder.UseSetting("Seed:TestAccount:Phone", Phone);
        builder.UseSetting("Seed:TestAccount:Name", "VIVI Test Account");
        builder.UseSetting("Seed:TestAccount:LoginSecret", Secret);
    }
}

public sealed class TestAccountLoginTests : IClassFixture<TestAccountApiFactory>, IClassFixture<ApiFactory>
{
    private readonly TestAccountApiFactory _configured;
    private readonly ApiFactory _unconfigured;

    public TestAccountLoginTests(TestAccountApiFactory configured, ApiFactory unconfigured)
    {
        _configured = configured;
        _unconfigured = unconfigured;
    }

    [Fact]
    public async Task Correct_secret_returns_a_customer_token()
    {
        var response = await _configured.CreateClient()
            .PostAsJsonAsync("/api/auth/test-login", new { secret = TestAccountApiFactory.Secret });

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<LoginResponse>(AuthTests.Json);
        Assert.Equal("Customer", body!.User.Role);
        Assert.False(string.IsNullOrWhiteSpace(body.AccessToken));
        Assert.Contains(TestAccountApiFactory.Phone, body.User.Email);
    }

    [Fact]
    public async Task Returned_token_authenticates_customer_endpoints()
    {
        var client = _configured.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/test-login", new { secret = TestAccountApiFactory.Secret });
        login.EnsureSuccessStatusCode();
        var body = await login.Content.ReadFromJsonAsync<LoginResponse>(AuthTests.Json);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body!.AccessToken);
        var orders = await client.GetAsync("/api/orders");

        Assert.Equal(HttpStatusCode.OK, orders.StatusCode);
    }

    [Fact]
    public async Task Wrong_secret_is_unauthorized()
    {
        var response = await _configured.CreateClient()
            .PostAsJsonAsync("/api/auth/test-login", new { secret = "not-the-right-code" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Empty_secret_is_unauthorized()
    {
        var response = await _configured.CreateClient()
            .PostAsJsonAsync("/api/auth/test-login", new { secret = "" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Endpoint_is_hidden_when_the_test_account_is_not_configured()
    {
        var response = await _unconfigured.CreateClient()
            .PostAsJsonAsync("/api/auth/test-login", new { secret = TestAccountApiFactory.Secret });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
