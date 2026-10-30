using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using VIVI.Api.Controllers;
using Xunit;

namespace VIVI.Api.Tests;

public sealed class BackendCheckTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private static readonly JsonSerializerOptions Json = AuthTests.Json;

    public BackendCheckTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Anonymous_callers_are_rejected()
    {
        var response = await _factory.CreateClient().GetAsync("/api/admin/backend-check");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Admin_sees_health_checks_and_counts_requests_by_route_template()
    {
        var client = _factory.CreateClient();
        AuthTests.WithToken(client, await AuthTests.LoginAsync(client));
        await client.GetAsync($"/api/courses/{Guid.NewGuid()}"); // 404, recorded under the template

        var result = await client.GetFromJsonAsync<BackendCheckResponse>("/api/admin/backend-check", Json);

        Assert.All(result!.Checks, c => Assert.True(c.Ok, c.Name));
        Assert.Contains(result.Routes, r => r.Route == "GET /api/courses/{id:guid}" && r.ClientErrors >= 1);
        Assert.DoesNotContain(result.Routes, r => r.Route.Contains(Guid.Empty.ToString()[..4] + "-"));
    }
}
