using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using VIVI.Api.DTOs.Auth;
using Xunit;

namespace VIVI.Api.Tests;

/// <summary>
/// International shipping must persist phones longer than 10 digits and postal
/// codes that are not Indian 6-digit PINs — the original SQL columns truncated
/// those values and returned SAVE_FAILED at checkout.
/// </summary>
[Collection("InternationalAddress")]
public sealed class InternationalAddressTests
{
    private readonly ApiFactory _factory;
    private static int _seq;

    public InternationalAddressTests(ApiFactory factory) => _factory = factory;

    public static IEnumerable<object[]> InternationalAddresses()
    {
        yield return
        [
            "United States",
            "12125550100",
            "New York",
            "NY",
            "10001",
            "350 5th Avenue"
        ];
        yield return
        [
            "United Kingdom",
            "447911123456",
            "London",
            "England",
            "SW1A 1AA",
            "10 Downing Street"
        ];
        yield return
        [
            "Australia",
            "61412345678",
            "Sydney",
            "NSW",
            "2000",
            "1 Macquarie Street"
        ];
        yield return
        [
            "United Arab Emirates",
            "971501234567",
            "Dubai",
            "Dubai",
            "00000",
            "Sheikh Zayed Road"
        ];
        yield return
        [
            "Canada",
            "14165550100",
            "Toronto",
            "ON",
            "M5V 2T6",
            "100 Queen St W"
        ];
        yield return
        [
            "Singapore",
            "6591234567",
            "Singapore",
            "Singapore",
            "018956",
            "1 Marina Boulevard"
        ];
        yield return
        [
            "Afghanistan",
            "93701234567",
            "Kabul",
            "Kabul",
            "1001",
            "Shar-e-Naw"
        ];
    }

    [Theory]
    [MemberData(nameof(InternationalAddresses))]
    public async Task Profile_saves_international_shipping_address(
        string country,
        string phone,
        string city,
        string state,
        string postal,
        string line1)
    {
        var client = await RegisterInternationalAsync(country);

        var response = await client.PutAsJsonAsync("/api/me/profile", new
        {
            fullName = "Intl Customer",
            shippingAddress = new
            {
                fullName = "Intl Customer",
                phoneNumber = phone,
                addressLine1 = line1,
                addressLine2 = "Apt 2",
                city,
                state,
                pinCode = postal,
                country,
                tag = "Home"
            }
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var profile = await response.Content.ReadFromJsonAsync<JsonElement>(AuthTests.Json);
        var saved = profile.GetProperty("shippingAddress");
        Assert.Equal(country, saved.GetProperty("country").GetString());
        Assert.Equal(phone, saved.GetProperty("phoneNumber").GetString());
        Assert.Equal(postal, saved.GetProperty("pinCode").GetString());
        Assert.Equal(city, saved.GetProperty("city").GetString());
        Assert.Equal(state, saved.GetProperty("state").GetString());
    }

    [Fact]
    public async Task India_shipping_address_still_saves()
    {
        var client = await AuthTests.LoginCustomerAsync(_factory.CreateClient(), NextIndiaPhone());

        var response = await client.PutAsJsonAsync("/api/me/profile", new
        {
            fullName = "Asha Kumar",
            shippingAddress = new
            {
                fullName = "Asha Kumar",
                phoneNumber = "9876500001",
                addressLine1 = "12 Race Course",
                city = "Coimbatore",
                state = "Tamil Nadu",
                pinCode = "641001",
                country = "India",
                tag = "Home"
            }
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var profile = await response.Content.ReadFromJsonAsync<JsonElement>(AuthTests.Json);
        var saved = profile.GetProperty("shippingAddress");
        Assert.Equal("India", saved.GetProperty("country").GetString());
        Assert.Equal("641001", saved.GetProperty("pinCode").GetString());
        Assert.Equal("9876500001", saved.GetProperty("phoneNumber").GetString());
    }

    [Fact]
    public async Task International_accepts_alphanumeric_postal_codes()
    {
        var client = await RegisterInternationalAsync("United Kingdom");
        var ok = await client.PutAsJsonAsync("/api/me/profile", new
        {
            fullName = "UK Customer",
            shippingAddress = new
            {
                fullName = "UK Customer",
                phoneNumber = "447911123456",
                addressLine1 = "221B Baker Street",
                city = "London",
                state = "England",
                pinCode = "NW1 6XE",
                country = "United Kingdom"
            }
        });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
    }

    private async Task<HttpClient> RegisterInternationalAsync(string country)
    {
        var client = _factory.CreateClient();
        var email = $"intl.{NextSeq()}.{Guid.NewGuid():N}@example.com";
        var register = await client.PostAsJsonAsync("/api/auth/mobile/email/register", new
        {
            email,
            password = "SecurePass1",
            age = 30,
            country
        });
        register.EnsureSuccessStatusCode();
        var body = await register.Content.ReadFromJsonAsync<LoginResponse>(AuthTests.Json);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", body!.AccessToken);
        return client;
    }

    private static int NextSeq() => Interlocked.Increment(ref _seq);

    private static string NextIndiaPhone() => (8300000000L + NextSeq()).ToString();
}

[CollectionDefinition("InternationalAddress", DisableParallelization = true)]
public sealed class InternationalAddressCollection : ICollectionFixture<ApiFactory>;
