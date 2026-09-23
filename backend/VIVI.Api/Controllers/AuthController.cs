using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using VIVI.Api.DTOs.Auth;
using VIVI.Api.Mapping;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Exceptions;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Auth;
using VIVI.Infrastructure.Configuration;
using VIVI.Infrastructure.Data;
using VIVI.Infrastructure.Email.Templates;
using VIVI.Infrastructure.Push;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly IPasswordHasher<AdminUser> _passwordHasher;
    private readonly IJwtTokenService _jwt;
    private readonly IWebHostEnvironment _env;
    private readonly IOtpService _otp;
    private readonly CustomerAccountService _customers;
    private readonly TwoFactorOptions _twoFactor;
    private readonly TestAccountSettings _testAccount;
    private readonly IEmailService _email;
    private readonly ILogger<AuthController> _logger;
    private readonly bool _allowDevCustomerLogin;

    /// <summary>Fixed reset code used in Testing so AuthTests can confirm without reading email.</summary>
    public const string TestPasswordResetCode = "123456";

    public AuthController(
        ViviDbContext db,
        IPasswordHasher<AdminUser> passwordHasher,
        IJwtTokenService jwt,
        IWebHostEnvironment env,
        IOtpService otp,
        CustomerAccountService customers,
        IOptions<TwoFactorOptions> twoFactor,
        SeedSettings seed,
        IEmailService email,
        ILogger<AuthController> logger,
        IConfiguration config)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _jwt = jwt;
        _env = env;
        _otp = otp;
        _customers = customers;
        _twoFactor = twoFactor.Value;
        _testAccount = seed.TestAccount;
        _email = email;
        _logger = logger;
        _allowDevCustomerLogin = env.IsDevelopment()
            || config.GetValue<bool>("Auth:AllowDevCustomerLogin");
    }

    /// <summary>Admin email/password login. Returns a JWT that includes user id, email, and role.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await _db.AdminUsers.SingleOrDefaultAsync(u => u.Email == email, cancellationToken);

        if (user is null || !user.IsActive)
            throw ViviException.Unauthorized("INVALID_CREDENTIALS", "Email or password is incorrect.");

        if (user.Role is not (UserRole.Admin or UserRole.Staff))
            throw ViviException.Unauthorized("INVALID_CREDENTIALS", "Email or password is incorrect.");

        var verification = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
            throw ViviException.Unauthorized("INVALID_CREDENTIALS", "Email or password is incorrect.");

        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        var token = _jwt.CreateAccessToken(user);
        return Ok(new LoginResponse
        {
            AccessToken = token.AccessToken,
            ExpiresAt = token.ExpiresAtUtc,
            User = user.ToDto()
        });
    }

    /// <summary>
    /// Temporary customer sign-in for the mobile app until phone OTP ships.
    /// Enabled in Development, or when Auth:AllowDevCustomerLogin is true.
    /// </summary>
    [HttpPost("dev/customer-login")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<LoginResponse>> DevCustomerLogin(
        [FromBody] DevCustomerLoginRequest request,
        CancellationToken cancellationToken)
    {
        if (!_allowDevCustomerLogin)
            throw ViviException.NotFound("NOT_FOUND", "Endpoint is not available.");

        var phone = request.Phone.Trim();
        var user = await _customers.GetOrCreateAsync(
            phone,
            string.IsNullOrWhiteSpace(request.Name) ? null : request.Name.Trim(),
            cancellationToken);

        var token = _jwt.CreateAccessToken(user);
        return Ok(new LoginResponse
        {
            AccessToken = token.AccessToken,
            ExpiresAt = token.ExpiresAtUtc,
            User = user.ToDto()
        });
    }

    /// <summary>
    /// Signs in the complimentary test account with a shared secret instead of an OTP.
    /// Available only when Seed:TestAccount is enabled with a phone and a secret of at
    /// least <see cref="TestAccountSettings.MinimumSecretLength"/> characters.
    /// </summary>
    [HttpPost("test-login")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<LoginResponse>> TestAccountLogin(
        [FromBody] TestAccountLoginRequest request,
        CancellationToken cancellationToken)
    {
        if (!_testAccount.Enabled
            || string.IsNullOrWhiteSpace(_testAccount.Phone)
            || !_testAccount.HasUsableSecret)
            throw ViviException.NotFound("NOT_FOUND", "Endpoint is not available.");

        if (!SecretsMatch(request.Secret, _testAccount.LoginSecret))
        {
            _logger.LogWarning("Rejected test-account sign-in with an incorrect secret.");
            throw ViviException.Unauthorized("INVALID_TEST_CODE", "That test access code is incorrect.");
        }

        string phone;
        try
        {
            phone = CustomerAccountService.NormalizePhone(_testAccount.Phone);
        }
        catch (ArgumentException)
        {
            throw ViviException.NotFound("NOT_FOUND", "Endpoint is not available.");
        }

        var user = await _customers.GetOrCreateAsync(phone, _testAccount.Name, cancellationToken);
        _logger.LogInformation("Test account {Email} signed in via shared secret.", user.Email);

        var token = _jwt.CreateAccessToken(user);
        return Ok(new LoginResponse
        {
            AccessToken = token.AccessToken,
            ExpiresAt = token.ExpiresAtUtc,
            User = user.ToDto()
        });
    }

    /// <summary>Compares secrets in fixed time, hashing first so the length is not observable.</summary>
    private static bool SecretsMatch(string? provided, string expected)
    {
        var providedHash = SHA256.HashData(Encoding.UTF8.GetBytes(provided?.Trim() ?? string.Empty));
        var expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(expected.Trim()));
        return CryptographicOperations.FixedTimeEquals(providedHash, expectedHash);
    }

    /// <summary>Sends a phone OTP via 2Factor for shopping checkout / account sign-in.</summary>
    [HttpPost("mobile/otp/request")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [ProducesResponseType(typeof(OtpRequestResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<OtpRequestResponse>> RequestMobileOtp(
        [FromBody] OtpRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Phone))
            throw new ViviException("INVALID_PHONE", "Phone must be a 10-digit Indian mobile number.");

        string phone;
        try
        {
            phone = CustomerAccountService.NormalizePhone(request.Phone.Trim());
        }
        catch (ArgumentException)
        {
            throw new ViviException("INVALID_PHONE", "Phone must be a 10-digit Indian mobile number.");
        }

        var providerSessionId = await _otp.SendOtpAsync(phone, cancellationToken);
        var now = DateTime.UtcNow;
        var expiresAt = now.AddMinutes(_twoFactor.OtpExpiryMinutes);

        var challenge = new OtpChallenge
        {
            Id = Guid.NewGuid(),
            Phone = phone,
            ProviderSessionId = providerSessionId,
            ExpiresAt = expiresAt,
            AttemptCount = 0,
            CreatedAt = now
        };

        _db.OtpChallenges.Add(challenge);
        await _db.SaveChangesAsync(cancellationToken);

        return Ok(new OtpRequestResponse
        {
            ChallengeId = challenge.Id,
            ExpiresInSeconds = (int)(expiresAt - now).TotalSeconds
        });
    }

    /// <summary>Verifies phone OTP and issues a customer JWT.</summary>
    [HttpPost("mobile/otp/verify")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<LoginResponse>> VerifyMobileOtp(
        [FromBody] OtpVerifyRequest request,
        CancellationToken cancellationToken)
    {
        var challenge = await _db.OtpChallenges
            .SingleOrDefaultAsync(c => c.Id == request.ChallengeId, cancellationToken)
            ?? throw new ViviException("INVALID_CHALLENGE", "OTP session not found. Request a new code.");

        if (challenge.VerifiedAt.HasValue)
            throw new ViviException("CHALLENGE_USED", "This OTP was already used. Request a new code.");

        if (challenge.ExpiresAt <= DateTime.UtcNow)
            throw ViviException.Unauthorized("EXPIRED_CHALLENGE", "OTP expired. Request a new code.");

        if (challenge.AttemptCount >= _twoFactor.MaxAttempts)
            throw ViviException.Unauthorized("TOO_MANY_ATTEMPTS", "Too many attempts. Request a new code.");

        challenge.AttemptCount++;
        var matched = await _otp.VerifyOtpAsync(challenge.ProviderSessionId, request.Code.Trim(), cancellationToken);
        if (!matched)
        {
            await _db.SaveChangesAsync(cancellationToken);
            throw new ViviException("INVALID_CODE", "That code is incorrect. Try again.");
        }

        challenge.VerifiedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        var user = await _customers.GetOrCreateAsync(
            challenge.Phone,
            request.Name,
            cancellationToken,
            request.Age,
            request.State,
            request.City);
        var customer = await _db.Customers.SingleAsync(c => c.UserId == user.Id, cancellationToken);
        var requiresProfileSetup =
            CustomerAccountService.IsPlaceholderName(customer.FullName)
            || customer.Age is null or <= 0
            || string.IsNullOrWhiteSpace(customer.State)
            || string.IsNullOrWhiteSpace(customer.City);
        var token = _jwt.CreateAccessToken(user);
        return Ok(new LoginResponse
        {
            AccessToken = token.AccessToken,
            ExpiresAt = token.ExpiresAtUtc,
            User = user.ToDto(),
            RequiresProfileSetup = requiresProfileSetup,
            IsNewCustomer = CustomerPushService.IsNewCustomer(customer, DateTime.UtcNow)
        });
    }

    /// <summary>Registers an international customer with email + password.</summary>
    [HttpPost("mobile/email/register")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<LoginResponse>> RegisterCustomerEmail(
        [FromBody] CustomerEmailRegisterRequest request,
        CancellationToken cancellationToken)
    {
        var user = await _customers.RegisterWithEmailAsync(
            request.Email,
            request.Password,
            request.Age,
            request.Country,
            request.Name,
            cancellationToken);

        var customer = await _db.Customers.SingleAsync(c => c.UserId == user.Id, cancellationToken);
        var token = _jwt.CreateAccessToken(user);
        return Ok(new LoginResponse
        {
            AccessToken = token.AccessToken,
            ExpiresAt = token.ExpiresAtUtc,
            User = user.ToDto(),
            IsNewCustomer = CustomerPushService.IsNewCustomer(customer, DateTime.UtcNow)
        });
    }

    /// <summary>Signs in an international customer with email + password.</summary>
    [HttpPost("mobile/email/login")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<LoginResponse>> LoginCustomerEmail(
        [FromBody] CustomerEmailLoginRequest request,
        CancellationToken cancellationToken)
    {
        var user = await _customers.LoginWithEmailAsync(request.Email, request.Password, cancellationToken);
        var token = _jwt.CreateAccessToken(user);
        return Ok(new LoginResponse
        {
            AccessToken = token.AccessToken,
            ExpiresAt = token.ExpiresAtUtc,
            User = user.ToDto(),
            IsNewCustomer = false
        });
    }

    /// <summary>
    /// Outside-India password reset step 1: email a 6-digit code.
    /// Always returns success-shaped response to avoid account enumeration.
    /// </summary>
    [HttpPost("mobile/email/password-reset/request")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [ProducesResponseType(typeof(CustomerPasswordResetRequestResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<CustomerPasswordResetRequestResponse>> RequestCustomerPasswordReset(
        [FromBody] CustomerPasswordResetRequest request,
        CancellationToken cancellationToken)
    {
        var email = CustomerAccountService.NormalizeEmail(request.Email);
        var expiryMinutes = Math.Max(5, _twoFactor.OtpExpiryMinutes);
        var now = DateTime.UtcNow;
        var expiresAt = now.AddMinutes(expiryMinutes);
        var message = "If an account exists for that email, we sent a reset code.";

        var user = await _db.AdminUsers.SingleOrDefaultAsync(u => u.Email == email, cancellationToken);
        var customer = user is null
            ? null
            : await _db.Customers.SingleOrDefaultAsync(c => c.UserId == user.Id, cancellationToken);

        var canReset = user is { IsActive: true, Role: UserRole.Customer }
            && customer is { IsActive: true, AuthMethod: CustomerAuthMethod.EmailPassword };

        if (!canReset)
        {
            return Ok(new CustomerPasswordResetRequestResponse
            {
                ExpiresInSeconds = expiryMinutes * 60,
                Message = message
            });
        }

        var code = _env.IsEnvironment("Testing")
            ? TestPasswordResetCode
            : RandomNumberGenerator.GetInt32(100000, 1000000).ToString();

        var challenge = new PasswordResetChallenge
        {
            Id = Guid.NewGuid(),
            Email = email,
            CodeHash = HashResetCode(code),
            ExpiresAt = expiresAt,
            AttemptCount = 0,
            CreatedAt = now
        };
        _db.PasswordResetChallenges.Add(challenge);
        await _db.SaveChangesAsync(cancellationToken);

        if (!_email.IsConfigured)
        {
            _logger.LogWarning("Password reset requested for {Email} but email is not configured.", email);
            return Ok(new CustomerPasswordResetRequestResponse
            {
                ExpiresInSeconds = expiryMinutes * 60,
                Message = message
            });
        }

        var rendered = PasswordResetEmail.Render(code, expiryMinutes);
        var send = await _email.SendAsync(
            new EmailSendRequest(email, rendered.Subject, rendered.Html, rendered.Text),
            cancellationToken);

        if (!send.Success)
            _logger.LogWarning("Password reset email failed for {Email}: {Error}", email, send.Error);

        return Ok(new CustomerPasswordResetRequestResponse
        {
            ExpiresInSeconds = expiryMinutes * 60,
            Message = message
        });
    }

    /// <summary>Outside-India password reset step 2: verify email code and set a new password.</summary>
    [HttpPost("mobile/email/password-reset/confirm")]
    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ConfirmCustomerPasswordReset(
        [FromBody] CustomerPasswordResetConfirmRequest request,
        CancellationToken cancellationToken)
    {
        var email = CustomerAccountService.NormalizeEmail(request.Email);
        var code = request.Code.Trim();
        var now = DateTime.UtcNow;

        var challenge = await _db.PasswordResetChallenges
            .Where(c => c.Email == email && c.VerifiedAt == null)
            .OrderByDescending(c => c.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new ViviException("INVALID_CHALLENGE", "Reset code not found. Request a new code.");

        if (challenge.ExpiresAt <= now)
            throw ViviException.Unauthorized("EXPIRED_CHALLENGE", "Reset code expired. Request a new code.");

        if (challenge.AttemptCount >= _twoFactor.MaxAttempts)
            throw ViviException.Unauthorized("TOO_MANY_ATTEMPTS", "Too many attempts. Request a new code.");

        challenge.AttemptCount++;
        var matched = FixedTimeEqualsHex(challenge.CodeHash, HashResetCode(code));
        if (!matched)
        {
            await _db.SaveChangesAsync(cancellationToken);
            throw new ViviException("INVALID_CODE", "That code is incorrect. Try again.");
        }

        challenge.VerifiedAt = now;
        await _db.SaveChangesAsync(cancellationToken);
        await _customers.ResetPasswordWithEmailAsync(email, request.NewPassword, cancellationToken);
        return NoContent();
    }

    private static string HashResetCode(string code) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(code.Trim())));

    private static bool FixedTimeEqualsHex(string storedHex, string providedHex)
    {
        try
        {
            var stored = Convert.FromHexString(storedHex);
            var provided = Convert.FromHexString(providedHex);
            return stored.Length == provided.Length
                && CryptographicOperations.FixedTimeEquals(stored, provided);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
