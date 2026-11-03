using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace VIVI.Api.Tests;

/// <summary>Notification pictures: only https links are sent to devices.</summary>
public sealed class PushPictureTests
{
    private static async Task<HttpClient> AdminAsync(ApiFactory factory)
    {
        var admin = factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        return admin;
    }

    [Fact]
    public async Task Notification_picture_must_be_an_https_link()
    {
        await using var factory = new ApiFactory();
        var admin = await AdminAsync(factory);

        var plain = await admin.PostAsJsonAsync("/api/admin/push/broadcast", new
        {
            title = "Diwali",
            body = "Learn crochet this Diwali.",
            screen = "/(tabs)/live",
            imageUrl = "http://example.com/diwali.jpg"
        });
        Assert.Equal(HttpStatusCode.BadRequest, plain.StatusCode);
    }
}
