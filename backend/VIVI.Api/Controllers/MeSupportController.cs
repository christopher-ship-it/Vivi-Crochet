using System.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VIVI.Api.DTOs.Support;
using VIVI.Api.Extensions;
using VIVI.Api.Mapping;
using VIVI.Core.Entities;
using VIVI.Core.Enums;
using VIVI.Core.Interfaces;
using VIVI.Infrastructure.Commerce;
using VIVI.Infrastructure.Data;

namespace VIVI.Api.Controllers;

[ApiController]
[Route("api/me/support-inquiries")]
[Authorize(Roles = nameof(UserRole.Customer))]
public sealed class MeSupportController : ControllerBase
{
    private readonly ViviDbContext _db;
    private readonly CustomerResolver _customers;
    private readonly IEmailService _email;
    private readonly IConfiguration _configuration;
    private readonly ILogger<MeSupportController> _logger;

    public MeSupportController(
        ViviDbContext db,
        CustomerResolver customers,
        IEmailService email,
        IConfiguration configuration,
        ILogger<MeSupportController> logger)
    {
        _db = db;
        _customers = customers;
        _email = email;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>Stores a one-shot support query from Contact us chat.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(SupportInquiryCreatedResponse), StatusCodes.Status201Created)]
    public async Task<ActionResult<SupportInquiryCreatedResponse>> Create(
        [FromBody] CreateSupportInquiryRequest request,
        CancellationToken cancellationToken)
    {
        var customer = await _customers.ResolveForUserAsync(User.GetUserId(), cancellationToken);
        var message = request.Message.Trim();
        var now = DateTime.UtcNow;

        var inquiry = new SupportInquiry
        {
            Id = Guid.NewGuid(),
            CustomerId = customer.Id,
            Message = message,
            CreatedAt = now,
            IsRead = false
        };

        _db.SupportInquiries.Add(inquiry);
        await _db.SaveChangesAsync(cancellationToken);

        await NotifySupportTeamAsync(customer, message, cancellationToken);

        return Created(string.Empty, new SupportInquiryCreatedResponse
        {
            Id = inquiry.Id,
            CreatedAt = inquiry.CreatedAt
        });
    }

    private async Task NotifySupportTeamAsync(Customer customer, string message, CancellationToken cancellationToken)
    {
        var inbox = _configuration["Support:InboxEmail"]?.Trim();
        if (string.IsNullOrWhiteSpace(inbox))
            inbox = _configuration["Seed:AdminEmail"]?.Trim();
        if (string.IsNullOrWhiteSpace(inbox))
            inbox = "support@vivicrochet01.com";

        var name = CommerceMapper.DisplayCustomerName(customer);
        var email = customer.Email?.Trim() ?? string.Empty;
        if (email.EndsWith("@vivicrochet.dev", StringComparison.OrdinalIgnoreCase))
            email = string.Empty;
        var phone = customer.PhoneNumber ?? string.Empty;

        var safeName = WebUtility.HtmlEncode(name);
        var safeMessage = WebUtility.HtmlEncode(message).Replace("\n", "<br/>", StringComparison.Ordinal);
        var contactLine = string.Join(
            " · ",
            new[] { phone, email }.Where(s => !string.IsNullOrWhiteSpace(s)));

        var subject = $"vivi support query from {name}";
        var html = $"""
            <p><strong>{safeName}</strong> sent a support query from the app.</p>
            <p>{WebUtility.HtmlEncode(contactLine)}</p>
            <blockquote style="border-left:3px solid #e8215b;padding-left:12px;margin:16px 0;color:#221a1e;">
              {safeMessage}
            </blockquote>
            <p style="color:#7a6d72;font-size:13px;">Open VIVI Admin → Support to mark it read.</p>
            """;
        var text = $"{name} ({contactLine})\n\n{message}\n";

        try
        {
            var result = await _email.SendAsync(
                new EmailSendRequest(inbox, subject, html, text),
                cancellationToken);
            if (!result.Success)
            {
                _logger.LogWarning(
                    "Support inquiry email to {Inbox} failed: {Error}",
                    inbox,
                    result.Error);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Support inquiry email to {Inbox} threw.", inbox);
        }
    }
}
