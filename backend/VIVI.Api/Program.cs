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
using VIVI.Api.Middleware;
using VIVI.Core.Entities;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Auth;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Configuration;
using VIVI.Infrastructure.Data;
using VIVI.Infrastructure.Email;
using VIVI.Infrastructure.Storage;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddApplicationInsightsTelemetry();
builder.Services.Configure<TelemetryConfiguration>(config =>
{
    if (string.IsNullOrWhiteSpace(config.ConnectionString))
        config.DisableTelemetry = true;
});

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.Configure<BlobStorageOptions>(builder.Configuration.GetSection(BlobStorageOptions.SectionName));
builder.Services.PostConfigure<BlobStorageOptions>(options =>
{
    if (string.IsNullOrWhiteSpace(options.DevBlobRoot))
        options.DevBlobRoot = Path.Combine(builder.Environment.ContentRootPath, "App_Data", "dev-blobs");
});
builder.Services.Configure<DatabaseOptions>(builder.Configuration.GetSection(DatabaseOptions.SectionName));
builder.Services.Configure<TwoFactorOptions>(builder.Configuration.GetSection(TwoFactorOptions.SectionName));
builder.Services.Configure<LiveStudioOptions>(builder.Configuration.GetSection(LiveStudioOptions.SectionName));
builder.Services.Configure<RazorpayOptions>(builder.Configuration.GetSection(RazorpayOptions.SectionName));
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
builder.Services.AddScoped<LiveCalendarService>();
builder.Services.AddScoped<LiveBookingService>();
builder.Services.AddScoped<OrderCheckoutService>();
builder.Services.AddScoped<PaymentFulfillmentService>();
builder.Services.AddScoped<ICourseAccessService, CourseAccessService>();
builder.Services.AddScoped<TransactionalEmailService>();
builder.Services.AddScoped<ExpiryReminderService>();
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
    });

builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
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
                    PermitLimit = 5,
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
            await LiveSchemaBootstrapper.EnsureAsync(db, CancellationToken.None);
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
