using System.Net;
using System.Net.Http.Json;
using VIVI.Api.DTOs.Customers;
using Xunit;

namespace VIVI.Api.Tests;

[Collection("Delivery")]
public sealed class PreferencesTests
{
    private readonly ApiFactory _factory;
    private static int _phones;

    public PreferencesTests(ApiFactory factory) => _factory = factory;

    private static string NextPhone() => (8300000000L + Interlocked.Increment(ref _phones)).ToString();

    private async Task<HttpClient> CustomerAsync()
        => await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextPhone());

    [Fact]
    public async Task New_customer_has_no_preferences()
    {
        var customer = await CustomerAsync();
        var profile = await customer.GetFromJsonAsync<CustomerProfileResponse>("/api/me/profile", AuthTests.Json);
        Assert.Null(profile!.LanguageCode);
        Assert.Null(profile.CountryCode);
    }

    [Theory]
    [InlineData("en", "IN")]
    [InlineData("en", "US")]
    [InlineData("ta", "IN")]
    [InlineData("hi", "US")]
    public async Task Language_and_country_are_saved_independently(string language, string country)
    {
        var customer = await CustomerAsync();
        var response = await customer.PatchAsJsonAsync("/api/me/preferences", new { languageCode = language, countryCode = country });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = await response.Content.ReadFromJsonAsync<CustomerProfileResponse>(AuthTests.Json);
        Assert.Equal(language, saved!.LanguageCode);
        Assert.Equal(country, saved.CountryCode);

        var profile = await customer.GetFromJsonAsync<CustomerProfileResponse>("/api/me/profile", AuthTests.Json);
        Assert.Equal(language, profile!.LanguageCode);
        Assert.Equal(country, profile.CountryCode);
    }

    [Fact]
    public async Task Changing_one_preference_leaves_the_other_alone()
    {
        var customer = await CustomerAsync();
        (await customer.PatchAsJsonAsync("/api/me/preferences", new { languageCode = "ta", countryCode = "IN" }))
            .EnsureSuccessStatusCode();

        var country = await customer.PatchAsJsonAsync("/api/me/preferences", new { countryCode = "US" });
        var afterCountry = await country.Content.ReadFromJsonAsync<CustomerProfileResponse>(AuthTests.Json);
        Assert.Equal("ta", afterCountry!.LanguageCode);
        Assert.Equal("US", afterCountry.CountryCode);

        var language = await customer.PatchAsJsonAsync("/api/me/preferences", new { languageCode = "hi" });
        var afterLanguage = await language.Content.ReadFromJsonAsync<CustomerProfileResponse>(AuthTests.Json);
        Assert.Equal("hi", afterLanguage!.LanguageCode);
        Assert.Equal("US", afterLanguage.CountryCode);
    }

    [Theory]
    [InlineData("fr", "IN")]
    [InlineData("english", "IN")]
    [InlineData("en", "India")]
    [InlineData("en", "USA")]
    [InlineData("en", "United States")]
    [InlineData("en", "GB")]
    public async Task Unsupported_values_are_rejected_and_nothing_is_saved(string language, string country)
    {
        var customer = await CustomerAsync();
        var response = await customer.PatchAsJsonAsync("/api/me/preferences", new { languageCode = language, countryCode = country });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var profile = await customer.GetFromJsonAsync<CustomerProfileResponse>("/api/me/profile", AuthTests.Json);
        Assert.Null(profile!.LanguageCode);
        Assert.Null(profile.CountryCode);
    }

    [Fact]
    public async Task Empty_request_is_rejected()
    {
        var customer = await CustomerAsync();
        var response = await customer.PatchAsJsonAsync("/api/me/preferences", new { });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Codes_are_normalised_to_canonical_case()
    {
        var customer = await CustomerAsync();
        var response = await customer.PatchAsJsonAsync("/api/me/preferences", new { languageCode = "EN", countryCode = "us" });
        var saved = await response.Content.ReadFromJsonAsync<CustomerProfileResponse>(AuthTests.Json);
        Assert.Equal("en", saved!.LanguageCode);
        Assert.Equal("US", saved.CountryCode);
    }

    [Fact]
    public async Task Anonymous_caller_cannot_save_preferences()
    {
        var response = await _factory.CreateClient()
            .PatchAsJsonAsync("/api/me/preferences", new { languageCode = "en", countryCode = "IN" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
