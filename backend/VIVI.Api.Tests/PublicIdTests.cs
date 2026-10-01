using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using VIVI.Api.DTOs.Customers;
using VIVI.Core;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

/// <summary>Customer IDs (VC-…) and founding-member IDs (VV-…).</summary>
public sealed class PublicIdTests : IClassFixture<ApiFactory>
{
    // No 0, O, 1, I or L: they get misread over the phone and in screenshots.
    private const string CustomerPattern = "^VC-[A-HJKMNP-Z2-9]{6}$";
    private const string MemberPattern = "^VV-[A-HJKMNP-Z]{4}-[0-9]{3}$";

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    private static long _phoneSeq = 7800000000;
    private readonly ApiFactory _factory;

    public PublicIdTests(ApiFactory factory) => _factory = factory;

    private static string NextPhone() => Interlocked.Increment(ref _phoneSeq).ToString();

    [Fact]
    public void Customer_code_has_the_agreed_shape_and_avoids_look_alike_characters()
    {
        for (var i = 0; i < 2000; i++)
            Assert.Matches(CustomerPattern, PublicIds.NewCustomerCode());
    }

    [Fact]
    public void Customer_codes_are_random_not_sequential()
    {
        var codes = Enumerable.Range(0, 1000).Select(_ => PublicIds.NewCustomerCode()).ToList();
        // A repeat among 1,000 draws from ~887 million is astronomically unlikely, so a low
        // distinct count would mean the generator is not random.
        Assert.True(codes.Distinct().Count() >= 995);
    }

    [Theory]
    [InlineData(1, "001")]
    [InlineData(7, "007")]
    [InlineData(100, "100")]
    public void Founding_member_code_ends_with_the_three_digit_member_number(int number, string suffix)
    {
        var code = PublicIds.NewMemberCode(number);
        Assert.Matches(MemberPattern, code);
        Assert.EndsWith("-" + suffix, code);
    }

    [Fact]
    public void Founding_member_code_rejects_a_zero_member_number() =>
        Assert.Throws<ArgumentOutOfRangeException>(() => PublicIds.NewMemberCode(0));

    [Theory]
    [InlineData(" vc-k7m2qx ", "VC-K7M2QX")]
    [InlineData("vv kqtd 007", "VVKQTD007")]
    public void Normalize_ignores_case_and_spaces(string typed, string expected) =>
        Assert.Equal(expected, PublicIds.Normalize(typed));

    [Fact]
    public async Task New_customers_get_distinct_codes_in_their_profile()
    {
        var a = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var b = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());

        var profileA = await a.GetFromJsonAsync<CustomerProfileResponse>("/api/me/profile", Json);
        var profileB = await b.GetFromJsonAsync<CustomerProfileResponse>("/api/me/profile", Json);

        Assert.Matches(CustomerPattern, profileA!.CustomerCode);
        Assert.Matches(CustomerPattern, profileB!.CustomerCode);
        Assert.NotEqual(profileA.CustomerCode, profileB.CustomerCode);
    }

    [Fact]
    public async Task A_customers_code_never_changes()
    {
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var first = await customer.GetFromJsonAsync<CustomerProfileResponse>("/api/me/profile", Json);
        var second = await customer.GetFromJsonAsync<CustomerProfileResponse>("/api/me/profile", Json);
        Assert.Equal(first!.CustomerCode, second!.CustomerCode);
    }

    [Fact]
    public async Task Admin_customer_list_shows_the_code_and_finds_it_however_it_is_typed()
    {
        var customer = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var code = (await customer.GetFromJsonAsync<CustomerProfileResponse>("/api/me/profile", Json))!.CustomerCode!;

        var admin = _factory.CreateClient();
        AuthTests.WithToken(admin, await AuthTests.LoginAsync(admin));

        var all = await admin.GetFromJsonAsync<List<AdminCustomerListItemResponse>>("/api/admin/customers", Json);
        Assert.Contains(all!, c => c.CustomerCode == code);

        var typed = code.ToLowerInvariant().Replace("-", " ");
        var found = await admin.GetFromJsonAsync<List<AdminCustomerListItemResponse>>(
            $"/api/admin/customers?q={Uri.EscapeDataString(typed)}",
            Json);
        Assert.Contains(found!, c => c.CustomerCode == code);
        Assert.All(found!, c => Assert.Contains(code.Replace("-", ""), (c.CustomerCode ?? "").Replace("-", "")));
    }

    [Fact]
    public async Task Backfill_gives_existing_customers_a_code_and_keeps_existing_ones()
    {
        var withCode = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var keepCode = (await withCode.GetFromJsonAsync<CustomerProfileResponse>("/api/me/profile", Json))!.CustomerCode!;
        var legacy = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());
        var legacyId = (await legacy.GetFromJsonAsync<CustomerProfileResponse>("/api/me/profile", Json))!.Id;

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();

        // Simulate a customer created before IDs existed.
        var row = await db.Customers.SingleAsync(c => c.Id == legacyId);
        row.CustomerCode = null;
        await db.SaveChangesAsync();
        Assert.Null((await db.Customers.AsNoTracking().SingleAsync(c => c.Id == legacyId)).CustomerCode);

        await PublicIdSchema.BackfillAsync(db, CancellationToken.None);

        var filled = await db.Customers.AsNoTracking().SingleAsync(c => c.Id == legacyId);
        Assert.Matches(CustomerPattern, filled.CustomerCode);
        Assert.Equal(keepCode, (await db.Customers.AsNoTracking().SingleAsync(c => c.CustomerCode == keepCode)).CustomerCode);
        Assert.Empty(await db.Customers.Where(c => c.CustomerCode == null).ToListAsync());

        // Running it again changes nothing.
        await PublicIdSchema.BackfillAsync(db, CancellationToken.None);
        Assert.Equal(filled.CustomerCode, (await db.Customers.AsNoTracking().SingleAsync(c => c.Id == legacyId)).CustomerCode);
    }
}
