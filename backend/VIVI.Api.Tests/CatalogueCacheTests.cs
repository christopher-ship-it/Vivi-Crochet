using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

public sealed class CatalogueCacheTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public CatalogueCacheTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Public_reads_are_cached_until_a_write_and_responses_are_compressed()
    {
        var anon = _factory.CreateClient();
        var url = "/api/shop-settings";

        var first = await anon.GetStringAsync(url);

        // A change that bypasses the API (no write request) stays hidden while the entry is fresh.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
            db.ShopSettings.Add(new() { Id = Guid.NewGuid(), HandmadeEnabled = false, UpdatedAt = DateTime.UtcNow });
            await db.SaveChangesAsync();
        }
        Assert.Equal(first, await anon.GetStringAsync(url));

        // Any successful admin write clears it.
        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        (await admin.PutAsJsonAsync("/api/admin/shop-settings", new { deliveryNotice = "x" })).EnsureSuccessStatusCode();
        Assert.Contains("\"handmadeEnabled\":false", await anon.GetStringAsync(url));

        var request = new HttpRequestMessage(HttpMethod.Get, "/api/products");
        request.Headers.AcceptEncoding.ParseAdd("gzip");
        var response = await anon.SendAsync(request);
        Assert.Contains("gzip", response.Content.Headers.ContentEncoding);
    }
}
