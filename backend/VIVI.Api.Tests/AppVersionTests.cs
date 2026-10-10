using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace VIVI.Api.Tests;

[Collection("CatalogPricing")]
public sealed class AppVersionTests
{
    private readonly ApiFactory _factory;

    public AppVersionTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Version_endpoint_is_public_and_returns_store_url()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/app/version");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<Dictionary<string, string>>();
        Assert.NotNull(body);
        Assert.Contains("play.google.com", body!["storeUrl"]);
        Assert.True(body.ContainsKey("minVersion"));
    }
}
