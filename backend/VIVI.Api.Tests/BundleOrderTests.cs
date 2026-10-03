using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using VIVI.Api.DTOs.Courses;
using VIVI.Api.DTOs.Offers;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

/// <summary>Courses inside a bundle show in the order the admin saved on the Special Offers page.</summary>
public sealed class BundleOrderTests
{
    private static readonly string[] SavedOrder = ["Foundation Stitches", "Master Stitch Series", "Signature Stitches"];

    private static async Task SaveOrderAsync(ApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
        var items = await db.CourseBundleItems
            .Where(b => b.BundleCourseId == DatabaseSeeder.Catalog.BundleId)
            .ToListAsync();
        items.Single(b => b.IncludedCourseId == DatabaseSeeder.Catalog.FoundationId).SortOrder = 0;
        items.Single(b => b.IncludedCourseId == DatabaseSeeder.Catalog.MasterId).SortOrder = 1;
        items.Single(b => b.IncludedCourseId == DatabaseSeeder.Catalog.SignatureId).SortOrder = 2;
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task The_offer_card_follows_the_saved_order()
    {
        await using var factory = new ApiFactory();
        await SaveOrderAsync(factory);

        var offer = await factory.CreateClient().GetFromJsonAsync<FoundingMembershipOfferResponse>(
            "/api/offers/founding-membership", AuthTests.Json);

        Assert.Equal(SavedOrder, offer!.IncludedCourses.Select(c => c.Name).ToArray());
    }

    [Fact]
    public async Task The_bundle_course_follows_the_saved_order()
    {
        await using var factory = new ApiFactory();
        await SaveOrderAsync(factory);

        var bundle = await factory.CreateClient().GetFromJsonAsync<CourseResponse>(
            $"/api/courses/{DatabaseSeeder.Catalog.BundleId}", AuthTests.Json);

        Assert.Equal(SavedOrder, bundle!.IncludedCourses!.Select(c => c.Name).ToArray());
    }

    [Fact]
    public async Task Admin_can_reorder_included_courses_and_the_app_follows()
    {
        await using var factory = new ApiFactory();
        var admin = factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var current = (await admin.GetFromJsonAsync<List<AdminSpecialOfferResponse>>(
            "/api/admin/special-offers", AuthTests.Json))!.Single();

        var reversed = current.IncludedCourses.Select(c => c.Id).Reverse().ToList();
        var response = await admin.PutAsJsonAsync($"/api/admin/special-offers/{current.CourseId}", new AdminSpecialOfferRequest
        {
            OfferName = current.OfferName,
            IsActive = current.IsActive,
            LaunchPrice = current.LaunchPrice,
            LaunchLimit = current.LaunchLimit,
            RegularPriceAfterLaunch = current.RegularPriceAfterLaunch,
            Mrp = current.Mrp,
            AccessDurationDays = current.AccessDurationDays,
            ViralProjectCourseId = current.ViralProjectCourseId,
            IncludedCourseIds = reversed
        });
        response.EnsureSuccessStatusCode();

        var saved = await response.Content.ReadFromJsonAsync<AdminSpecialOfferResponse>(AuthTests.Json);
        Assert.Equal(reversed, saved!.IncludedCourses.Select(c => c.Id).ToList());

        var offer = await factory.CreateClient().GetFromJsonAsync<FoundingMembershipOfferResponse>(
            "/api/offers/founding-membership", AuthTests.Json);
        Assert.Equal(reversed, offer!.IncludedCourses.Select(c => c.Id).ToList());
    }

    [Fact]
    public async Task Reordering_rejects_a_list_that_adds_or_drops_courses()
    {
        await using var factory = new ApiFactory();
        var admin = factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));
        var current = (await admin.GetFromJsonAsync<List<AdminSpecialOfferResponse>>(
            "/api/admin/special-offers", AuthTests.Json))!.Single();

        var response = await admin.PutAsJsonAsync($"/api/admin/special-offers/{current.CourseId}", new AdminSpecialOfferRequest
        {
            OfferName = current.OfferName,
            IsActive = current.IsActive,
            LaunchPrice = current.LaunchPrice,
            LaunchLimit = current.LaunchLimit,
            RegularPriceAfterLaunch = current.RegularPriceAfterLaunch,
            Mrp = current.Mrp,
            AccessDurationDays = current.AccessDurationDays,
            IncludedCourseIds = current.IncludedCourses.Select(c => c.Id).Take(2).ToList()
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
