using System.Net;
using System.Net.Http.Json;
using VIVI.Api.DTOs.Courses;
using VIVI.Api.DTOs.Videos;
using Xunit;

namespace VIVI.Api.Tests;

/// <summary>How far each customer has watched each lesson video.</summary>
public sealed class VideoProgressTests
{
    private static int _phones;

    private static string NextPhone() => $"75{Interlocked.Increment(ref _phones):D8}";

    private static async Task<(Guid CourseId, Guid VideoId)> CourseWithVideoAsync(ApiFactory factory)
    {
        var admin = factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var created = await admin.PostAsJsonAsync("/api/courses", new { name = $"Course {Guid.NewGuid():N}"[..20], price = 299 });
        created.EnsureSuccessStatusCode();
        var course = await created.Content.ReadFromJsonAsync<CourseResponse>(AuthTests.Json);

        var upload = await admin.PostAsJsonAsync("/api/videos/upload-url", new
        {
            courseId = course!.Id,
            fileName = "lesson-01.mp4",
            contentType = "video/mp4",
            fileSizeBytes = 2_000_000
        });
        upload.EnsureSuccessStatusCode();
        var body = await upload.Content.ReadFromJsonAsync<UploadUrlResponse>(AuthTests.Json);
        return (course.Id, body!.VideoId);
    }

    private static Task<HttpResponseMessage> SaveAsync(HttpClient customer, Guid videoId, int position, int duration) =>
        customer.PutAsJsonAsync($"/api/me/video-progress/{videoId}", new { positionSeconds = position, durationSeconds = duration });

    private static async Task<List<VideoProgressResponse>> ForCourseAsync(HttpClient customer, Guid courseId) =>
        (await customer.GetFromJsonAsync<List<VideoProgressResponse>>($"/api/me/courses/{courseId}/video-progress", AuthTests.Json))!;

    [Fact]
    public async Task A_new_customer_has_no_progress()
    {
        await using var factory = new ApiFactory();
        var (courseId, _) = await CourseWithVideoAsync(factory);
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());

        Assert.Empty(await ForCourseAsync(customer, courseId));
    }

    [Fact]
    public async Task Saving_records_the_position_and_updates_it_in_place()
    {
        await using var factory = new ApiFactory();
        var (courseId, videoId) = await CourseWithVideoAsync(factory);
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());

        (await SaveAsync(customer, videoId, 120, 600)).EnsureSuccessStatusCode();
        (await SaveAsync(customer, videoId, 300, 600)).EnsureSuccessStatusCode();

        var progress = Assert.Single(await ForCourseAsync(customer, courseId));
        Assert.Equal(videoId, progress.VideoId);
        Assert.Equal(300, progress.PositionSeconds);
        Assert.Equal(600, progress.DurationSeconds);
        Assert.Equal(50, progress.Percent);
        Assert.False(progress.IsCompleted);
    }

    [Fact]
    public async Task Reaching_the_end_completes_the_video_and_stays_completed()
    {
        await using var factory = new ApiFactory();
        var (courseId, videoId) = await CourseWithVideoAsync(factory);
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());

        (await SaveAsync(customer, videoId, 590, 600)).EnsureSuccessStatusCode(); // 98%
        var done = Assert.Single(await ForCourseAsync(customer, courseId));
        Assert.True(done.IsCompleted);
        Assert.Equal(100, done.Percent);

        // Rewatching from the start must not undo it.
        (await SaveAsync(customer, videoId, 5, 600)).EnsureSuccessStatusCode();
        var after = Assert.Single(await ForCourseAsync(customer, courseId));
        Assert.True(after.IsCompleted);
        Assert.Equal(100, after.Percent);
        Assert.Equal(5, after.PositionSeconds);
    }

    [Fact]
    public async Task A_position_past_the_end_is_clamped_to_the_length()
    {
        await using var factory = new ApiFactory();
        var (courseId, videoId) = await CourseWithVideoAsync(factory);
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());

        (await SaveAsync(customer, videoId, 9999, 600)).EnsureSuccessStatusCode();

        var progress = Assert.Single(await ForCourseAsync(customer, courseId));
        Assert.Equal(600, progress.PositionSeconds);
    }

    [Fact]
    public async Task Each_customer_only_sees_their_own_progress()
    {
        await using var factory = new ApiFactory();
        var (courseId, videoId) = await CourseWithVideoAsync(factory);
        var first = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());
        var second = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());

        (await SaveAsync(first, videoId, 200, 600)).EnsureSuccessStatusCode();

        Assert.Single(await ForCourseAsync(first, courseId));
        Assert.Empty(await ForCourseAsync(second, courseId));
    }

    [Theory]
    [InlineData(-1, 600)]
    [InlineData(10, 0)]
    [InlineData(10, -5)]
    [InlineData(10, 90000)]
    public async Task Impossible_numbers_are_rejected(int position, int duration)
    {
        await using var factory = new ApiFactory();
        var (_, videoId) = await CourseWithVideoAsync(factory);
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());

        var response = await SaveAsync(customer, videoId, position, duration);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_unknown_video_is_not_found()
    {
        await using var factory = new ApiFactory();
        var customer = await AuthTests.LoginCustomerAsync(factory.CreateClient(), NextPhone());

        var response = await SaveAsync(customer, Guid.NewGuid(), 10, 600);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Signing_in_is_required()
    {
        await using var factory = new ApiFactory();
        var (courseId, videoId) = await CourseWithVideoAsync(factory);
        var anonymous = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await SaveAsync(anonymous, videoId, 10, 600)).StatusCode);
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await anonymous.GetAsync($"/api/me/courses/{courseId}/video-progress")).StatusCode);
    }
}
