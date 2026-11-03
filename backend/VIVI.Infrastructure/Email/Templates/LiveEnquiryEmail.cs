using System.Net;
using VIVI.Core.Entities;

namespace VIVI.Infrastructure.Email.Templates;

/// <summary>Class plan for an enquiry the student paid for outside the app.</summary>
public static class LiveEnquiryEmail
{
    public static (string Subject, string Html, string Text) Render(
        LiveEnquiry enquiry,
        IReadOnlyList<string> learn,
        IReadOnlyList<string> projects)
    {
        var dates = $"{enquiry.StartDate:dd MMM yyyy} – {enquiry.EndDate:dd MMM yyyy}";
        var price = EmailLayout.FormatInr(enquiry.Price);
        var learnHtml = string.Join("", learn.Select(l => $"<li>{WebUtility.HtmlEncode(l)}</li>"));
        var projectsHtml = string.Join(", ", projects.Select(WebUtility.HtmlEncode));
        var body = $"""
<p>Hi {WebUtility.HtmlEncode(enquiry.Name)},</p>
<p>Thank you for choosing VIVI Crochet live classes. Your place is confirmed. Here is your class plan.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;font-size:14px;">
  <tr><td><strong>Course</strong></td><td align="right">{WebUtility.HtmlEncode(enquiry.CourseName)}</td></tr>
  <tr><td><strong>Circle</strong></td><td align="right">{WebUtility.HtmlEncode(enquiry.SlotName)}</td></tr>
  <tr><td><strong>Class time</strong></td><td align="right">{WebUtility.HtmlEncode(enquiry.SlotHours)}</td></tr>
  <tr><td><strong>Starts</strong></td><td align="right">Week {enquiry.WeekNumber}</td></tr>
  <tr><td><strong>Dates</strong></td><td align="right">{WebUtility.HtmlEncode(dates)}</td></tr>
  <tr><td><strong>Amount paid</strong></td><td align="right">{price}</td></tr>
  <tr><td><strong>Payment reference</strong></td><td align="right">{WebUtility.HtmlEncode(enquiry.PaymentReference)}</td></tr>
</table>
<p style="margin:16px 0 4px 0;"><strong>What you will learn</strong></p>
<ul style="margin:0 0 12px 18px;padding:0;">{learnHtml}</ul>
<p style="margin:0 0 16px 0;"><strong>Projects you will make:</strong> {projectsHtml}</p>
<p style="margin:0 0 16px 0;"><strong>Important:</strong> Sunday is always OFF. Class days are Monday–Friday, with Saturday used only as a replacement when a weekday is missed.</p>
<p style="margin:0;">See you in the Live Crochet Studio.</p>
""";

        var learnText = string.Join("\n", learn.Select(l => $"- {l}"));
        var text = $"""
Hi {enquiry.Name},

Thank you for choosing VIVI Crochet live classes. Your place is confirmed. Here is your class plan.

Course: {enquiry.CourseName}
Circle: {enquiry.SlotName}
Class time: {enquiry.SlotHours}
Starts: Week {enquiry.WeekNumber}
Dates: {dates}
Amount paid: {price}
Payment reference: {enquiry.PaymentReference}

What you will learn:
{learnText}

Projects you will make: {string.Join(", ", projects)}

Sunday is always OFF. Class days are Monday–Friday, with Saturday used only as a replacement when a weekday is missed.

See you in the Live Crochet Studio.
""";

        return ($"Your VIVI Crochet live class plan · {enquiry.CourseName}",
            EmailLayout.Wrap("Your live class plan", body),
            text);
    }
}
