using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.ApplicationInsights.Extensibility;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Resend;
using VIVI.Api.DTOs;
using VIVI.Api.Middleware;
using VIVI.Core.Entities;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Auth;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Configuration;
using VIVI.Infrastructure.Data;
using VIVI.Api.Jobs;
using VIVI.Infrastructure.Email;
using VIVI.Infrastructure.Push;
using VIVI.Infrastructure.Storage;
using VIVI.Infrastructure.Transcoding;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddApplicationInsightsTelemetry();
builder.Services.Configure<TelemetryConfiguration>(config =>
{
    if (string.IsNullOrWhiteSpace(config.ConnectionString))
        config.DisableTelemetry = true;
});

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.Configure<BlobStorageOptions>(builder.Configuration.GetSection(BlobStorageOptions.SectionName));
builder.Services.Configure<FfmpegOptions>(builder.Configuration.GetSection(FfmpegOptions.SectionName));
builder.Services.PostConfigure<BlobStorageOptions>(options =>
{
    if (string.IsNullOrWhiteSpace(options.DevBlobRoot))
        options.DevBlobRoot = Path.Combine(builder.Environment.ContentRootPath, "App_Data", "dev-blobs");
});
builder.Services.Configure<DatabaseOptions>(builder.Configuration.GetSection(DatabaseOptions.SectionName));
builder.Services.Configure<TwoFactorOptions>(builder.Configuration.GetSection(TwoFactorOptions.SectionName));
builder.Services.Configure<LiveStudioOptions>(builder.Configuration.GetSection(LiveStudioOptions.SectionName));
builder.Services.Configure<RazorpayOptions>(builder.Configuration.GetSection(RazorpayOptions.SectionName));
builder.Services.Configure<PushOptions>(opts =>
{
    var section = builder.Configuration.GetSection(PushOptions.SectionName);
    opts.JobSecret = section["JobSecret"] ?? string.Empty;
    var enabledRaw = section["Enabled"];
    if (bool.TryParse(enabledRaw, out var enabled))
    {
        opts.Enabled = enabled;
    }
    else if (!string.IsNullOrWhiteSpace(enabledRaw) && enabledRaw.Length > 8)
    {
        // Footgun: JobSecret pasted into Push__Enabled → bool bind throws on every push request.
        if (string.IsNullOrWhiteSpace(opts.JobSecret))
            opts.JobSecret = enabledRaw.Trim();
        opts.Enabled = true;
    }
    else
    {
        opts.Enabled = true;
    }
});
builder.Services.Configure<ResendOptions>(builder.Configuration.GetSection(ResendOptions.SectionName));

var jwt = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwt.SigningKey) || jwt.SigningKey.Length < 32)
{
    throw new InvalidOperationException(
        "Jwt:SigningKey is missing or shorter than 32 characters. Set Jwt__SigningKey (environment or user-secrets).");
}

builder.Services.AddDbContext<ViviDbContext>(options =>
{
    var useInMemory = builder.Environment.IsEnvironment("Testing")
                      || string.Equals(builder.Configuration["Database:Provider"], "InMemory", StringComparison.OrdinalIgnoreCase);

    if (useInMemory)
    {
        options.UseInMemoryDatabase(builder.Configuration["Database:Name"] ?? "ViviTests");
        return;
    }

    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
                           ?? throw new InvalidOperationException("ConnectionStrings:DefaultConnection is not set.");
    options.UseSqlServer(connectionString);
});

builder.Services.AddSingleton<IPasswordHasher<AdminUser>, PasswordHasher<AdminUser>>();
builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<CustomerAccountService>();
builder.Services.AddScoped<CustomerResolver>();
builder.Services.AddScoped<PricingService>();
builder.Services.AddScoped<LaunchOfferService>();
builder.Services.AddScoped<IDeliveryEstimateService, DeliveryEstimateService>();
builder.Services.AddScoped<InventoryService>();
builder.Services.AddScoped<AdminDataCleanupService>();
builder.Services.AddScoped<LiveCalendarService>();
builder.Services.AddScoped<LiveBookingService>();
builder.Services.AddScoped<OrderCheckoutService>();
builder.Services.AddScoped<PaymentFulfillmentService>();
builder.Services.AddScoped<ICourseAccessService, CourseAccessService>();
builder.Services.AddScoped<TransactionalEmailService>();
builder.Services.AddScoped<ExpiryReminderService>();
builder.Services.AddScoped<CustomerPushService>();
builder.Services.AddSingleton<FfmpegRunner>();
builder.Services.AddScoped<VideoTranscodeService>();
builder.Services.AddHttpClient<ExpoPushService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
    client.DefaultRequestHeaders.TryAddWithoutValidation("Accept", "application/json");
    client.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Encoding", "gzip, deflate");
});
if (!builder.Environment.IsEnvironment("Testing"))
{
    builder.Services.AddHostedService<WeeklyPushBackgroundService>();
    builder.Services.AddHostedService<ExpiryReminderBackgroundService>();
    builder.Services.AddHostedService<VideoTranscodeBackgroundService>();
}
builder.Services.AddSingleton(sp =>
{
    var options = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<RazorpayOptions>>().Value;
    return new RazorpayOptionsAccessor { KeyId = options.KeyId };
});

if (builder.Environment.IsEnvironment("Testing"))
{
    builder.Services.AddSingleton<IRazorpayPaymentGateway, FakeRazorpayPaymentGateway>();
    builder.Services.AddSingleton<IRazorpaySignatureVerifier, TestRazorpaySignatureVerifier>();
    builder.Services.AddSingleton<IEmailService, FakeEmailService>();
}
else
{
    builder.Services.AddSingleton<IRazorpaySignatureVerifier, RazorpaySignatureVerifier>();
    builder.Services.AddHttpClient<IRazorpayPaymentGateway, RazorpayPaymentGateway>(client =>
        client.Timeout = TimeSpan.FromSeconds(30));

    builder.Services.AddOptions();
    builder.Services.AddHttpClient<ResendClient>();
    builder.Services.Configure<ResendClientOptions>(options =>
    {
        var resend = builder.Configuration.GetSection(ResendOptions.SectionName).Get<ResendOptions>() ?? new ResendOptions();
        options.ApiToken = resend.ApiKey;
    });
    builder.Services.AddTransient<IResend, ResendClient>();
    builder.Services.AddSingleton<IEmailService, ResendEmailService>();
}

if (builder.Environment.IsEnvironment("Testing"))
    builder.Services.AddSingleton<IOtpService, FakeOtpService>();
else
    builder.Services.AddHttpClient<IOtpService, TwoFactorOtpService>(client => client.Timeout = TimeSpan.FromSeconds(30));

var blobOptions = builder.Configuration.GetSection(BlobStorageOptions.SectionName).Get<BlobStorageOptions>()
                  ?? new BlobStorageOptions();
if (string.Equals(blobOptions.Provider, "InMemory", StringComparison.OrdinalIgnoreCase))
    builder.Services.AddSingleton<IBlobStorageService, InMemoryBlobStorageService>();
else
    builder.Services.AddSingleton<IBlobStorageService, AzureBlobStorageService>();

builder.Services.AddScoped(sp =>
{
    var section = builder.Configuration.GetSection("Seed");
    var testAccount = section.GetSection("TestAccount");
    return new SeedSettings
    {
        AdminEmail = section["AdminEmail"] ?? "admin@vivicrochet.local",
        AdminPassword = section["AdminPassword"] ?? string.Empty,
        AdminName = section["AdminName"] ?? "Vivi Priya",
        TestAccount = new TestAccountSettings
        {
            Enabled = testAccount.GetValue("Enabled", false),
            Phone = testAccount["Phone"] ?? string.Empty,
            Name = testAccount["Name"] ?? "VIVI Test Account",
            AccessDays = testAccount.GetValue("AccessDays", 3650),
            LoginSecret = testAccount["LoginSecret"] ?? string.Empty
        }
    };
});
builder.Services.AddScoped<DatabaseSeeder>();

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    })
    .ConfigureApiBehaviorOptions(options =>
    {
        options.InvalidModelStateResponseFactory = context =>
        {
            var message = string.Join(
                " ",
                context.ModelState.Values
                    .SelectMany(v => v.Errors)
                    .Select(e => string.IsNullOrWhiteSpace(e.ErrorMessage) ? e.Exception?.Message : e.ErrorMessage)
                    .Where(m => !string.IsNullOrWhiteSpace(m)));

            if (string.IsNullOrWhiteSpace(message))
                message = "Please check your input and try again.";

            return new Microsoft.AspNetCore.Mvc.BadRequestObjectResult(
                new VIVI.Api.DTOs.ErrorResponse("VALIDATION_ERROR", message));
        };
    });

builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Keep JWT claim names as issued (sub / role) so role checks match customer tokens.
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
            RoleClaimType = System.Security.Claims.ClaimTypes.Role,
            NameClaimType = System.Security.Claims.ClaimTypes.NameIdentifier,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });
builder.Services.AddAuthorization();

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                     ?? ["http://localhost:5173"];
if (allowedOrigins.Length == 0)
    throw new InvalidOperationException("Cors:AllowedOrigins must include at least one admin origin.");

builder.Services.AddCors(options =>
{
    options.AddPolicy("vivi", policy =>
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod());
});

if (!builder.Environment.IsDevelopment() && !builder.Environment.IsEnvironment("Testing"))
{
    builder.Services.AddRateLimiter(options =>
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        options.AddPolicy("login", context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    // Register + login + OTP share this policy; keep headroom for real users.
                    PermitLimit = 30,
                    Window = TimeSpan.FromMinutes(15),
                    QueueLimit = 0
                }));
    });
}

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "VIVI Crochet API",
        Version = "v1",
        Description = "Admin and customer API for courses, videos, orders, payments, enrollments, and Azure Blob SAS uploads."
    });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT in the Authorization header. Example: Bearer {token}",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT"
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();
var isProduction = app.Environment.IsProduction();

app.UseMiddleware<ExceptionHandlingMiddleware>();

if (!app.Environment.IsEnvironment("Testing"))
    app.UseForwardedHeaders();

if (!app.Environment.IsEnvironment("Testing") && !isProduction)
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "VIVI Crochet API v1");
        options.DocumentTitle = "VIVI Crochet API";
    });
}

if (!app.Environment.IsEnvironment("Testing"))
{
    app.UseHttpsRedirection();
    if (isProduction)
        app.UseHsts();
}

app.UseCors("vivi");

if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing"))
    app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ViviDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    var dbOptions = app.Configuration.GetSection(DatabaseOptions.SectionName).Get<DatabaseOptions>()
                    ?? new DatabaseOptions();

    try
    {
        if (app.Environment.IsEnvironment("Testing"))
        {
            await db.Database.EnsureCreatedAsync();
        }
        else if (dbOptions.AutoMigrate)
        {
            await db.Database.MigrateAsync();
            logger.LogInformation("Database migrations applied (Database:AutoMigrate=true).");
        }
        else
        {
            logger.LogInformation(
                "Database:AutoMigrate is false. Run `dotnet ef database update` before starting the app in production.");
        }

        if (!app.Environment.IsEnvironment("Testing"))
        {
            // Must run first: EF Customer mapping expects these columns on every Customer load
            // (orders, customers, support, push). If missing → 500 "unexpected error".
            try
            {
                await db.Database.ExecuteSqlRawAsync(
                    """
                    IF COL_LENGTH('Customers', 'OnboardingPushesSentAt') IS NULL
                        ALTER TABLE [Customers] ADD [OnboardingPushesSentAt] datetime2 NULL;

                    IF COL_LENGTH('Customers', 'LastWeeklyPushAt') IS NULL
                        ALTER TABLE [Customers] ADD [LastWeeklyPushAt] datetime2 NULL;
                    """,
                    CancellationToken.None);

                // Widen phone separately: depends on dropping IX_Customers_PhoneNumber.
                await db.Database.ExecuteSqlRawAsync(
                    """
                    IF EXISTS (
                        SELECT 1 FROM sys.columns
                        WHERE object_id = OBJECT_ID(N'[Customers]')
                          AND name = N'PhoneNumber'
                          AND max_length < 40)
                    BEGIN
                        IF EXISTS (
                            SELECT 1 FROM sys.indexes
                            WHERE name = N'IX_Customers_PhoneNumber'
                              AND object_id = OBJECT_ID(N'[Customers]'))
                            DROP INDEX [IX_Customers_PhoneNumber] ON [Customers];

                        ALTER TABLE [Customers] ALTER COLUMN [PhoneNumber] nvarchar(20) NULL;

                        IF NOT EXISTS (
                            SELECT 1 FROM sys.indexes
                            WHERE name = N'IX_Customers_PhoneNumber'
                              AND object_id = OBJECT_ID(N'[Customers]'))
                            CREATE UNIQUE INDEX [IX_Customers_PhoneNumber]
                                ON [Customers] ([PhoneNumber])
                                WHERE [PhoneNumber] IS NOT NULL;
                    END
                    """,
                    CancellationToken.None);
                logger.LogInformation("Customer push/phone columns verified.");
            }
            catch (Exception customerSchemaEx)
            {
                logger.LogError(
                    customerSchemaEx,
                    "Failed to ensure Customer push columns. Admin orders/customers will 500 until fixed.");
            }

            await LiveSchemaBootstrapper.EnsureAsync(db, CancellationToken.None);
            try
            {
                await PushSchemaBootstrapper.EnsureAsync(db, CancellationToken.None);
                logger.LogInformation("Push notification schema verified.");
            }
            catch (Exception pushEx)
            {
                logger.LogError(pushEx, "Push schema bootstrap failed. /api/admin/push/reach will error until DevicePushTokens exists.");
            }

            try
            {
                await VideoTranscodeSchemaBootstrapper.EnsureAsync(db, CancellationToken.None);
                logger.LogInformation("Video transcode schema verified.");
            }
            catch (Exception videoEx)
            {
                logger.LogError(videoEx, "Video transcode schema bootstrap failed. Upload/publish may error until Videos columns exist.");
            }

            try
            {
                await ProductEssentialSchemaBootstrapper.EnsureAsync(db, CancellationToken.None, logger);
                logger.LogInformation("Product essential recommendation schema verified.");
            }
            catch (Exception essentialEx)
            {
                logger.LogError(essentialEx, "ProductEssentialLinks bootstrap failed. Cart recommendations will be empty until the table exists.");
            }

            try
            {
                await db.Database.ExecuteSqlRawAsync(
                    """
                    IF COL_LENGTH('Courses', 'SortOrder') IS NULL
                        ALTER TABLE [Courses] ADD [SortOrder] int NOT NULL
                            CONSTRAINT [DF_Courses_SortOrder] DEFAULT (0);

                    IF COL_LENGTH('Courses', 'Description') IS NULL
                        ALTER TABLE [Courses] ADD [Description] nvarchar(400) NULL;

                    IF NOT EXISTS (
                        SELECT 1 FROM sys.indexes
                        WHERE name = N'IX_Courses_CategoryId_SortOrder'
                          AND object_id = OBJECT_ID(N'[Courses]'))
                        CREATE INDEX [IX_Courses_CategoryId_SortOrder]
                            ON [Courses] ([CategoryId], [SortOrder]);
                    """,
                    CancellationToken.None);
                logger.LogInformation("Course SortOrder / Description columns verified.");
            }
            catch (Exception courseSortEx)
            {
                logger.LogError(courseSortEx, "Courses.SortOrder/Description bootstrap failed.");
            }

            try
            {
                await db.Database.ExecuteSqlRawAsync(
                    """
                    IF OBJECT_ID(N'[CourseBundleItems]', N'U') IS NULL
                    BEGIN
                        CREATE TABLE [CourseBundleItems] (
                            [Id] uniqueidentifier NOT NULL,
                            [BundleCourseId] uniqueidentifier NOT NULL,
                            [IncludedCourseId] uniqueidentifier NOT NULL,
                            [SortOrder] int NOT NULL,
                            [CreatedAt] datetime2 NOT NULL,
                            CONSTRAINT [PK_CourseBundleItems] PRIMARY KEY ([Id]),
                            CONSTRAINT [FK_CourseBundleItems_Courses_BundleCourseId]
                                FOREIGN KEY ([BundleCourseId]) REFERENCES [Courses] ([Id]) ON DELETE CASCADE,
                            CONSTRAINT [FK_CourseBundleItems_Courses_IncludedCourseId]
                                FOREIGN KEY ([IncludedCourseId]) REFERENCES [Courses] ([Id]) ON DELETE NO ACTION
                        );
                        CREATE UNIQUE INDEX [IX_CourseBundleItems_BundleCourseId_IncludedCourseId]
                            ON [CourseBundleItems] ([BundleCourseId], [IncludedCourseId]);
                        CREATE INDEX [IX_CourseBundleItems_BundleCourseId]
                            ON [CourseBundleItems] ([BundleCourseId]);
                    END

                    IF OBJECT_ID(N'[LaunchOfferCounters]', N'U') IS NULL
                    BEGIN
                        CREATE TABLE [LaunchOfferCounters] (
                            [Id] uniqueidentifier NOT NULL,
                            [CourseId] uniqueidentifier NOT NULL,
                            [LaunchLimit] int NOT NULL,
                            [LaunchPrice] int NOT NULL,
                            [RegularPriceAfterLaunch] int NOT NULL,
                            [Mrp] int NOT NULL,
                            [CompletedPurchaseCount] int NOT NULL,
                            [CreatedAt] datetime2 NOT NULL,
                            [UpdatedAt] datetime2 NOT NULL,
                            CONSTRAINT [PK_LaunchOfferCounters] PRIMARY KEY ([Id]),
                            CONSTRAINT [FK_LaunchOfferCounters_Courses_CourseId]
                                FOREIGN KEY ([CourseId]) REFERENCES [Courses] ([Id]) ON DELETE CASCADE
                        );
                        CREATE UNIQUE INDEX [IX_LaunchOfferCounters_CourseId]
                            ON [LaunchOfferCounters] ([CourseId]);
                    END
                    """,
                    CancellationToken.None);
                logger.LogInformation("Course bundle / launch-offer schema verified.");
            }
            catch (Exception bundleSchemaEx)
            {
                logger.LogError(bundleSchemaEx, "CourseBundleItems/LaunchOfferCounters bootstrap failed.");
            }

            await db.Database.ExecuteSqlRawAsync("""
                IF OBJECT_ID(N'[PasswordResetChallenges]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [PasswordResetChallenges] (
                        [Id] uniqueidentifier NOT NULL,
                        [Email] nvarchar(256) NOT NULL,
                        [CodeHash] nvarchar(64) NOT NULL,
                        [ExpiresAt] datetime2 NOT NULL,
                        [AttemptCount] int NOT NULL,
                        [VerifiedAt] datetime2 NULL,
                        [CreatedAt] datetime2 NOT NULL,
                        CONSTRAINT [PK_PasswordResetChallenges] PRIMARY KEY ([Id])
                    );
                    CREATE INDEX [IX_PasswordResetChallenges_Email] ON [PasswordResetChallenges] ([Email]);
                    CREATE INDEX [IX_PasswordResetChallenges_ExpiresAt] ON [PasswordResetChallenges] ([ExpiresAt]);
                END

                IF COL_LENGTH('Customers', 'EmailVerifiedAt') IS NULL
                    ALTER TABLE [Customers] ADD [EmailVerifiedAt] datetime2 NULL;

                IF OBJECT_ID(N'[EmailVerificationChallenges]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [EmailVerificationChallenges] (
                        [Id] uniqueidentifier NOT NULL,
                        [CustomerId] uniqueidentifier NOT NULL,
                        [Email] nvarchar(256) NOT NULL,
                        [CodeHash] nvarchar(64) NOT NULL,
                        [ExpiresAt] datetime2 NOT NULL,
                        [AttemptCount] int NOT NULL,
                        [VerifiedAt] datetime2 NULL,
                        [CreatedAt] datetime2 NOT NULL,
                        CONSTRAINT [PK_EmailVerificationChallenges] PRIMARY KEY ([Id]),
                        CONSTRAINT [FK_EmailVerificationChallenges_Customers_CustomerId]
                            FOREIGN KEY ([CustomerId]) REFERENCES [Customers] ([Id]) ON DELETE CASCADE
                    );
                    CREATE INDEX [IX_EmailVerificationChallenges_CustomerId]
                        ON [EmailVerificationChallenges] ([CustomerId]);
                    CREATE INDEX [IX_EmailVerificationChallenges_Email]
                        ON [EmailVerificationChallenges] ([Email]);
                    CREATE INDEX [IX_EmailVerificationChallenges_ExpiresAt]
                        ON [EmailVerificationChallenges] ([ExpiresAt]);
                END
                """);
            logger.LogInformation("Live Crochet Studio schema verified.");
        }

        if (dbOptions.AutoSeed)
            await scope.ServiceProvider.GetRequiredService<DatabaseSeeder>().SeedAsync();
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Database migrate/seed skipped or failed. Check ConnectionStrings__DefaultConnection.");
    }
}

app.Run();

public partial class Program;
