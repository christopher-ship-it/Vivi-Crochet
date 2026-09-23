using System.Net;
using Xunit;
using System.Net.Http.Json;
using System.Text.Json;
using VIVI.Api.DTOs.Courses;
using VIVI.Api.DTOs.Videos;
using VIVI.Core.Enums;

namespace VIVI.Api.Tests;

public sealed class VideoTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public VideoTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Upload_url_creates_draft_and_sas()
    {
        var (client, courseId) = await AdminWithCourse();

        var response = await client.PostAsJsonAsync("/api/videos/upload-url", ValidUpload(courseId));
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadFromJsonAsync<UploadUrlResponse>(Json);
        Assert.False(string.IsNullOrWhiteSpace(body!.UploadUrl));
        Assert.Contains($"/videos/{body.VideoId:D}/original/", body.BlobPath);

        var video = await client.GetFromJsonAsync<VideoResponse>($"/api/videos/{body.VideoId}", Json);
        Assert.Equal(VideoStatus.Draft, video!.Status);
        Assert.False(video.UploadConfirmed);
    }

    [Fact]
    public async Task Invalid_file_type_is_rejected()
    {
        var (client, courseId) = await AdminWithCourse();

        var response = await client.PostAsJsonAsync("/api/videos/upload-url", new
        {
            courseId,
            fileName = "malware.exe",
            contentType = "application/octet-stream",
            fileSizeBytes = 1024
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.Contains("INVALID_FILE_TYPE", text);
    }

    [Fact]
    public async Task File_too_large_is_rejected()
    {
        var (client, courseId) = await AdminWithCourse();

        var response = await client.PostAsJsonAsync("/api/videos/upload-url", new
        {
            courseId,
            fileName = "huge.mp4",
            contentType = "video/mp4",
            fileSizeBytes = 3L * 1024 * 1024 * 1024
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.Contains("FILE_TOO_LARGE", text);
    }

    [Fact]
    public async Task Draft_video_cannot_be_streamed()
    {
        var (client, courseId) = await AdminWithCourse();
        var upload = await (await client.PostAsJsonAsync("/api/videos/upload-url", ValidUpload(courseId)))
            .Content.ReadFromJsonAsync<UploadUrlResponse>(Json);

        await client.PostAsync($"/api/videos/{upload!.VideoId}/upload-complete", null);

        // Learners (anonymous) must not stream drafts; admins may for duration detection.
        var anonymous = _factory.CreateClient();
        var stream = await anonymous.GetAsync($"/api/videos/{upload.VideoId}/stream-url");
        Assert.Equal(HttpStatusCode.Forbidden, stream.StatusCode);
    }

    [Fact]
    public async Task Upload_complete_marks_transcode_ready_in_tests()
    {
        var (client, courseId) = await AdminWithCourse();
        var upload = await (await client.PostAsJsonAsync("/api/videos/upload-url", ValidUpload(courseId)))
            .Content.ReadFromJsonAsync<UploadUrlResponse>(Json);

        var complete = await client.PostAsync($"/api/videos/{upload!.VideoId}/upload-complete", null);
        complete.EnsureSuccessStatusCode();

        var video = await client.GetFromJsonAsync<VideoResponse>($"/api/videos/{upload.VideoId}", Json);
        Assert.Equal(VideoTranscodeStatus.Ready, video!.TranscodeStatus);
        Assert.True(video.UploadConfirmed);
    }

    [Fact]
    public async Task Published_video_returns_stream_url()
    {
        var (client, courseId) = await AdminWithCourse();
        var upload = await (await client.PostAsJsonAsync("/api/videos/upload-url", ValidUpload(courseId)))
            .Content.ReadFromJsonAsync<UploadUrlResponse>(Json);

        var complete = await client.PostAsync($"/api/videos/{upload!.VideoId}/upload-complete", null);
        complete.EnsureSuccessStatusCode();

        var publish = await client.PostAsync($"/api/videos/{upload.VideoId}/publish", null);
        publish.EnsureSuccessStatusCode();

        var stream = await client.GetFromJsonAsync<StreamUrlResponse>($"/api/videos/{upload.VideoId}/stream-url", Json);
        Assert.Equal(upload.VideoId, stream!.VideoId);
        Assert.False(string.IsNullOrWhiteSpace(stream.StreamUrl));
        Assert.True(stream.ExpiresAt > DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task Admin_can_delete_video()
    {
        var (client, courseId) = await AdminWithCourse();
        var upload = await (await client.PostAsJsonAsync("/api/videos/upload-url", ValidUpload(courseId)))
            .Content.ReadFromJsonAsync<UploadUrlResponse>(Json);

        await client.PostAsync($"/api/videos/{upload!.VideoId}/upload-complete", null);

        var delete = await client.DeleteAsync($"/api/videos/{upload.VideoId}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);

        var get = await client.GetAsync($"/api/videos/{upload.VideoId}");
        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);

        var list = await client.GetFromJsonAsync<List<VideoResponse>>($"/api/videos?courseId={courseId}", Json);
        Assert.DoesNotContain(list!, v => v.Id == upload.VideoId);
    }

    [Fact]
    public async Task Anonymous_cannot_delete_video()
    {
        var (client, courseId) = await AdminWithCourse();
        var upload = await (await client.PostAsJsonAsync("/api/videos/upload-url", ValidUpload(courseId)))
            .Content.ReadFromJsonAsync<UploadUrlResponse>(Json);

        var anonymous = _factory.CreateClient();
        var delete = await anonymous.DeleteAsync($"/api/videos/{upload!.VideoId}");
        Assert.Equal(HttpStatusCode.Unauthorized, delete.StatusCode);
    }

    [Fact]
    public async Task Anonymous_cannot_see_draft_video()
    {
        var (client, courseId) = await AdminWithCourse();
        var upload = await (await client.PostAsJsonAsync("/api/videos/upload-url", ValidUpload(courseId)))
            .Content.ReadFromJsonAsync<UploadUrlResponse>(Json);

        var anonymous = _factory.CreateClient();
        var response = await anonymous.GetAsync($"/api/videos/{upload!.VideoId}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private async Task<(HttpClient Client, Guid CourseId)> AdminWithCourse()
    {
        var client = _factory.CreateClient();
        var token = await AuthTests.LoginAsync(client);
        AuthTests.WithToken(client, token);
        var created = await client.PostAsJsonAsync("/api/courses", new { name = $"Course {Guid.NewGuid():N}"[..20], price = 299 });
        created.EnsureSuccessStatusCode();
        var course = await created.Content.ReadFromJsonAsync<CourseResponse>(Json);
        return (client, course!.Id);
    }

    private static object ValidUpload(Guid courseId) => new
    {
        courseId,
        fileName = "lesson-01.mp4",
        contentType = "video/mp4",
        fileSizeBytes = 2_000_000
    };

    private static readonly JsonSerializerOptions Json = AuthTests.Json;
}
