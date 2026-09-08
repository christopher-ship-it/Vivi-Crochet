using System.Net;
using Xunit;
using System.Net.Http.Json;
using System.Text.Json;
using VIVI.Api.DTOs.Courses;
using VIVI.Core.Enums;

namespace VIVI.Api.Tests;

public sealed class CourseTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public CourseTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Admin_can_create_a_draft_course()
    {
        var client = _factory.CreateClient();
        AuthTests.WithToken(client, await AuthTests.LoginAsync(client));

        var response = await client.PostAsJsonAsync("/api/courses", new
        {
            name = "Basic Crochet",
            type = "DigitalCourse",
            level = "Beginner",
            about = "Start from zero",
            price = 299,
            mrp = 399,
            accessDays = 30,
            renewalPercentage = 50,
            languages = "Tamil,English"
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var course = await response.Content.ReadFromJsonAsync<CourseResponse>(Json);
        Assert.Equal("Basic Crochet", course!.Name);
        Assert.Equal(CourseStatus.Draft, course.Status);
    }

    [Fact]
    public async Task Anonymous_list_hides_draft_courses()
    {
        var admin = _factory.CreateClient();
        var token = await AuthTests.LoginAsync(admin);
        AuthTests.WithToken(admin, token);

        var created = await admin.PostAsJsonAsync("/api/courses", new { name = "Hidden Draft", price = 100 });
        created.EnsureSuccessStatusCode();

        var anonymous = _factory.CreateClient();
        var list = await anonymous.GetFromJsonAsync<List<CourseResponse>>("/api/courses", Json);
        Assert.DoesNotContain(list!, c => c.Name == "Hidden Draft");
    }

    [Fact]
    public async Task Publishing_a_course_without_videos_fails()
    {
        var client = _factory.CreateClient();
        var token = await AuthTests.LoginAsync(client);
        AuthTests.WithToken(client, token);

        var created = await client.PostAsJsonAsync("/api/courses", new { name = "Empty Course", price = 100 });
        var course = await created.Content.ReadFromJsonAsync<CourseResponse>(Json);

        var publish = await client.PostAsync($"/api/courses/{course!.Id}/publish", null);
        Assert.Equal(HttpStatusCode.Conflict, publish.StatusCode);
    }

    [Fact]
    public async Task Publishing_a_course_with_a_video_makes_it_visible()
    {
        var client = _factory.CreateClient();
        var token = await AuthTests.LoginAsync(client);
        AuthTests.WithToken(client, token);

        var course = await (await client.PostAsJsonAsync("/api/courses", new { name = "Visible Course", price = 299 }))
            .Content.ReadFromJsonAsync<CourseResponse>(Json);

        var upload = await client.PostAsJsonAsync("/api/videos/upload-url", new
        {
            courseId = course!.Id,
            fileName = "lesson-1.mp4",
            contentType = "video/mp4",
            fileSizeBytes = 1_024_000
        });
        upload.EnsureSuccessStatusCode();

        var publish = await client.PostAsync($"/api/courses/{course.Id}/publish", null);
        publish.EnsureSuccessStatusCode();

        var anonymous = _factory.CreateClient();
        var list = await anonymous.GetFromJsonAsync<List<CourseResponse>>("/api/courses", Json);
        Assert.Contains(list!, c => c.Id == course.Id && c.Status == CourseStatus.Published);
    }

    private static readonly JsonSerializerOptions Json = AuthTests.Json;
}
