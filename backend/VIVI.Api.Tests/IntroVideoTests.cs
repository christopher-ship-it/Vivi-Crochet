using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using VIVI.Api.DTOs.Admin;
using VIVI.Infrastructure.Data;
using VIVI.Infrastructure.Transcoding;
using Xunit;

namespace VIVI.Api.Tests;

[Collection("CatalogPricing")]
public sealed class IntroVideoTests
{
    private readonly ApiFactory _factory;

    public IntroVideoTests(ApiFactory factory)
    {
        _factory = factory;
        _ = factory.CreateClient();
    }

    private async Task<HttpClient> AdminAsync()
    {
        var client = _factory.CreateClient();
        return AuthTests.WithToken(client, await AuthTests.LoginAsync(client));
    }

    private async Task ResetAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        db.IntroVideos.RemoveRange(await db.IntroVideos.ToListAsync());
        await db.SaveChangesAsync();
    }

    private async Task RunCompressionAsync()
    {
        // The compression step skips ffmpeg (there is no real video here) when it runs in the Testing environment.
        var previous = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Testing");
        try
        {
            await using var scope = _factory.Services.CreateAsyncScope();
            var transcode = scope.ServiceProvider.GetRequiredService<VideoTranscodeService>();
            while (await transcode.ProcessNextAsync(CancellationToken.None))
            {
                // Drain everything queued, including videos left by other tests.
            }
        }
        finally
        {
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", previous);
        }
    }

    private async Task<AdminIntroVideoResponse> UploadAsync(HttpClient admin, string fileName = "intro.mp4")
    {
        var ticket = await admin.PostAsJsonAsync("/api/admin/intro-video/upload-url", new
        {
            fileName,
            contentType = "video/mp4",
            fileSizeBytes = 5_000_000
        });
        ticket.EnsureSuccessStatusCode();
        var url = (await ticket.Content.ReadFromJsonAsync<IntroVideoUploadUrlResponse>(AuthTests.Json))!;
        Assert.StartsWith("intro/", url.BlobPath);

        var done = await admin.PostAsJsonAsync("/api/admin/intro-video/upload-complete", new
        {
            blobPath = url.BlobPath,
            fileName,
            contentType = "video/mp4",
            fileSizeBytes = 5_000_000
        });
        done.EnsureSuccessStatusCode();
        return (await done.Content.ReadFromJsonAsync<AdminIntroVideoResponse>(AuthTests.Json))!;
    }

    private async Task<IntroVideoResponse> PublicAsync()
        => (await _factory.CreateClient().GetFromJsonAsync<IntroVideoResponse>("/api/intro-video", AuthTests.Json))!;

    [Fact]
    public async Task App_sees_no_video_until_one_is_uploaded_and_compressed()
    {
        await ResetAsync();
        var admin = await AdminAsync();
        Assert.False((await PublicAsync()).Available);

        var queued = await UploadAsync(admin);
        Assert.Equal("Queued", queued.Status);
        Assert.False((await PublicAsync()).Available);

        await RunCompressionAsync();
        var ready = await admin.GetFromJsonAsync<AdminIntroVideoResponse>("/api/admin/intro-video", AuthTests.Json);
        Assert.Equal("Ready", ready!.Status);
        Assert.True(ready.HasVideo);
        Assert.NotNull(ready.PreviewUrl);

        var app = await PublicAsync();
        Assert.True(app.Available);
        Assert.False(string.IsNullOrWhiteSpace(app.Url));
        Assert.Equal(1, app.Version);
    }

    [Fact]
    public async Task Replacing_the_video_keeps_the_old_one_until_the_new_one_is_ready()
    {
        await ResetAsync();
        var admin = await AdminAsync();
        await UploadAsync(admin);
        await RunCompressionAsync();
        Assert.Equal(1, (await PublicAsync()).Version);

        await UploadAsync(admin, "intro-v2.mp4");
        var during = await PublicAsync();
        Assert.True(during.Available);
        Assert.Equal(1, during.Version);

        await RunCompressionAsync();
        Assert.Equal(2, (await PublicAsync()).Version);
    }

    [Fact]
    public async Task Turning_it_off_hides_it_from_the_app_and_back_on_shows_it_again()
    {
        await ResetAsync();
        var admin = await AdminAsync();
        await UploadAsync(admin);
        await RunCompressionAsync();

        (await admin.PutAsJsonAsync("/api/admin/intro-video/settings", new { isEnabled = false })).EnsureSuccessStatusCode();
        Assert.False((await PublicAsync()).Available);

        (await admin.PutAsJsonAsync("/api/admin/intro-video/settings", new { isEnabled = true })).EnsureSuccessStatusCode();
        Assert.True((await PublicAsync()).Available);
    }

    [Fact]
    public async Task Deleting_removes_it_from_the_app()
    {
        await ResetAsync();
        var admin = await AdminAsync();
        await UploadAsync(admin);
        await RunCompressionAsync();

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync("/api/admin/intro-video")).StatusCode);
        Assert.False((await PublicAsync()).Available);
        Assert.False((await admin.GetFromJsonAsync<AdminIntroVideoResponse>("/api/admin/intro-video", AuthTests.Json))!.HasVideo);
    }

    [Fact]
    public async Task Rejects_files_that_are_not_videos_and_needs_an_admin_login()
    {
        var admin = await AdminAsync();
        var bad = await admin.PostAsJsonAsync("/api/admin/intro-video/upload-url", new
        {
            fileName = "notes.pdf",
            contentType = "application/pdf",
            fileSizeBytes = 1000
        });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);

        var anonymous = await _factory.CreateClient().GetAsync("/api/admin/intro-video");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
    }
}
