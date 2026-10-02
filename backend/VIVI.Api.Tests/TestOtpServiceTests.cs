using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Auth;
using VIVI.Infrastructure.Data;
using Xunit;

namespace VIVI.Api.Tests;

public sealed class TestOtpServiceTests
{
    private const string TestPhone = "9999999999";

    private sealed class RecordingOtp : IOtpService
    {
        public List<string> SentTo { get; } = new();
        public bool VerifyResult { get; set; }

        public Task<string> SendOtpAsync(string phone, CancellationToken cancellationToken = default)
        {
            SentTo.Add(phone);
            return Task.FromResult("real-session");
        }

        public Task<bool> VerifyOtpAsync(string providerSessionId, string code, CancellationToken cancellationToken = default) =>
            Task.FromResult(VerifyResult);
    }

    private static TestOtpService Create(RecordingOtp inner, bool enabled = true, string phone = TestPhone) =>
        new(inner, new TestAccountSettings { Enabled = enabled, Phone = phone });

    [Fact]
    public async Task TestPhoneGetsTheFixedCodeWithoutSendingAnSms()
    {
        var inner = new RecordingOtp();
        var otp = Create(inner);

        var session = await otp.SendOtpAsync(TestPhone);

        Assert.Empty(inner.SentTo);
        Assert.True(await otp.VerifyOtpAsync(session, "123456"));
        Assert.False(await otp.VerifyOtpAsync(session, "654321"));
    }

    [Fact]
    public async Task OtherPhonesStillUseTheRealProvider()
    {
        var inner = new RecordingOtp { VerifyResult = true };
        var otp = Create(inner);

        var session = await otp.SendOtpAsync("9876543210");

        Assert.Equal("real-session", session);
        Assert.Single(inner.SentTo);
        Assert.True(await otp.VerifyOtpAsync(session, "000000"));
    }

    [Fact]
    public async Task FixedCodeIsRejectedForARealSession()
    {
        var inner = new RecordingOtp { VerifyResult = false };
        var otp = Create(inner);

        Assert.False(await otp.VerifyOtpAsync("real-session", "123456"));
    }

    [Fact]
    public async Task DisablingTheTestAccountRemovesTheShortcut()
    {
        var inner = new RecordingOtp { VerifyResult = false };
        var otp = Create(inner, enabled: false);

        var session = await otp.SendOtpAsync(TestPhone);

        Assert.Single(inner.SentTo);
        Assert.False(await otp.VerifyOtpAsync(TestOtpService.SessionId, "123456"));
    }

    [Fact]
    public async Task PhoneIsMatchedAfterNormalising()
    {
        var inner = new RecordingOtp();
        var otp = Create(inner);

        var session = await otp.SendOtpAsync("+91 99999 99999");

        Assert.Equal(TestOtpService.SessionId, session);
        Assert.Empty(inner.SentTo);
    }
}
