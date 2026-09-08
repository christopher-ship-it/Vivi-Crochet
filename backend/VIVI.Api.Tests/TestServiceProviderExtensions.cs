using Microsoft.Extensions.DependencyInjection;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Email;

namespace VIVI.Api.Tests;

public static class TestServiceProviderExtensions
{
    public static FakeEmailService GetFakeEmailService(this ApiFactory factory)
    {
        var service = factory.Services.GetRequiredService<IEmailService>();
        return service as FakeEmailService
               ?? throw new InvalidOperationException("Expected FakeEmailService in Testing environment.");
    }
}
