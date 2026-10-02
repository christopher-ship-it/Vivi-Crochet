using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using VIVI.Api.DTOs.Courses;
using VIVI.Api.DTOs.Offers;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

/// <summary>Courses inside a bundle read in learning order, whatever order the admin ticked them in.</summary>
public sealed class BundleOrderTests
{
    private static readonly string[] LearningOrder = ["Foundation Stitches", "Signature Stitches", "Master Stitch Series"];

    /// <summary>Saves the bundle in the order an admin might tick the boxes: Foundation, Master, Signature.</summary>
    private static async Task<HttpClient> ClientWithBundleSavedOutOfOrderAsync(ApiFactory factory)
    {
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
            var items = await db.CourseBundleItems
                .Where(b => b.BundleCourseId == DatabaseSeeder.Catalog.BundleId)
                .ToListAsync();
            items.Single(b => b.IncludedCourseId == DatabaseSeeder.Catalog.FoundationId).SortOrder = 0;
            items.Single(b => b.IncludedCourseId == DatabaseSeeder.Catalog.MasterId).SortOrder = 1;
            items.Single(b => b.IncludedCourseId == DatabaseSeeder.Catalog.SignatureId).SortOrder = 2;
            await db.SaveChangesAsync();
        }

        return factory.CreateClient();
    }

    [Fact]
    public async Task The_offer_card_lists_foundation_then_signature_then_master()
    {
        await using var factory = new ApiFactory();
        var client = await ClientWithBundleSavedOutOfOrderAsync(factory);

        var offer = await client.GetFromJsonAsync<FoundingMembershipOfferResponse>(
            "/api/offers/founding-membership", AuthTests.Json);

        Assert.Equal(LearningOrder, offer!.IncludedCourses.Select(c => c.Name).ToArray());
    }

    [Fact]
    public async Task The_bundle_course_lists_foundation_then_signature_then_master()
    {
        await using var factory = new ApiFactory();
        var client = await ClientWithBundleSavedOutOfOrderAsync(factory);

        var bundle = await client.GetFromJsonAsync<CourseResponse>(
            $"/api/courses/{DatabaseSeeder.Catalog.BundleId}", AuthTests.Json);

        Assert.Equal(LearningOrder, bundle!.IncludedCourses!.Select(c => c.Name).ToArray());
    }
}
