using System.Globalization;
using System.Net;
using System.Text;
using VIVI.Core.Entities;
using VIVI.Core.Enums;

namespace VIVI.Infrastructure.Email.Templates;

public static class EmailLayout
{
    public const string BrandPink = "#e8215b";
    public const string BrandInk = "#120e10";
    public const string BrandCream = "#fffaf9";

    public static string Wrap(string title, string bodyHtml) => $"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{WebUtility.HtmlEncode(title)}</title>
</head>
<body style="margin:0;padding:0;background:{BrandCream};font-family:Arial,Helvetica,sans-serif;color:{BrandInk};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{BrandCream};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:2px solid {BrandInk};">
          <tr>
            <td style="padding:24px 28px 8px 28px;">
              <p style="margin:0;font-size:11px;letter-spacing:2px;color:{BrandPink};font-weight:700;">VIVI CROCHET</p>
              <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.3;color:{BrandInk};">{WebUtility.HtmlEncode(title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px 28px;font-size:15px;line-height:1.6;color:{BrandInk};">
              {bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px 28px;border-top:2px solid {BrandInk};font-size:12px;color:#7a6d72;">
              Handmade with love · VIVI Crochet
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
""";

    public static string Button(string label, string href) =>
        $"""<p style="margin:24px 0 0 0;"><a href="{WebUtility.HtmlEncode(href)}" style="display:inline-block;background:{BrandPink};color:#ffffff;text-decoration:none;padding:12px 20px;border:2px solid {BrandInk};font-weight:700;">{WebUtility.HtmlEncode(label)}</a></p>""";

    public static string FormatInr(decimal amount) =>
        amount.ToString("C0", CultureInfo.GetCultureInfo("en-IN"));

    public static string FormatDate(DateTime utc) =>
        utc.ToString("dd MMM yyyy", CultureInfo.InvariantCulture);
}

public static class OrderConfirmationEmail
{
    public static (string Subject, string Html, string Text) Render(
        Customer customer,
        Order order,
        IReadOnlyList<OrderItem> items)
    {
        var pricing = OrderEmailPricing.FromOrder(order, items);
        var hasPhysical = items.Any(i => i.ItemType == OrderItemType.Product);
        var rows = new StringBuilder();
        foreach (var line in pricing.Items)
        {
            rows.Append("<tr>");
            rows.Append("<td style=\"padding:8px 0;border-bottom:1px solid #eee;vertical-align:top;\">");
            rows.Append(WebUtility.HtmlEncode(line.ProductName));
            if (line.HasOffer)
            {
                rows.Append("<br/><span style=\"font-size:12px;color:#7a6d72;text-decoration:line-through;\">");
                rows.Append(EmailLayout.FormatInr(line.OriginalLineTotal));
                rows.Append("</span> <span style=\"font-size:14px;font-weight:700;color:");
                rows.Append(EmailLayout.BrandPink);
                rows.Append(";\">");
                rows.Append(EmailLayout.FormatInr(line.PaidLineTotal));
                rows.Append("</span>");
            }
            rows.Append("</td>");
            rows.Append($"<td style=\"padding:8px 0;border-bottom:1px solid #eee;text-align:center;vertical-align:top;\">{line.Quantity}</td>");
            rows.Append($"<td style=\"padding:8px 0;border-bottom:1px solid #eee;text-align:right;vertical-align:top;font-weight:{(line.HasOffer ? "700" : "400")};\">{EmailLayout.FormatInr(line.PaidLineTotal)}</td>");
            rows.Append("</tr>");
        }

        var deliveryBlock = BuildDeliveryBlock(order, hasPhysical);

        var isBundle = items.Any(i => i.ItemType == OrderItemType.CourseBundle);
        var nextStep = hasPhysical
            ? "<p style=\"margin:16px 0 0 0;\"><strong>Your order has been placed</strong> at the delivery address below. Your pieces enter production next. We will email you if the delivery date changes.</p>"
            : isBundle
                ? "<p style=\"margin:16px 0 0 0;\"><strong>Order confirmed.</strong> Your All-Access Crochet Pass is active — open the VIVI app to start learning.</p>"
                : "<p style=\"margin:16px 0 0 0;\"><strong>Order confirmed.</strong> Your course access is activated — open the VIVI app to start learning.</p>";

        var title = hasPhysical ? "Order placed" : "Order confirmed";
        var subject = hasPhysical
            ? "Your VIVI Crochet order has been placed"
            : "Your VIVI Crochet order is confirmed";
        var intro = hasPhysical
            ? "Thank you — your VIVI Crochet product order has been placed."
            : "Thank you — your VIVI Crochet order is confirmed.";

        var savingsRow = pricing.TotalSavings > 0
            ? $"<tr><td>MRP savings</td><td align=\"right\">-{EmailLayout.FormatInr(pricing.TotalSavings)}</td></tr>"
            : string.Empty;

        var body = $"""
<p>Hi {WebUtility.HtmlEncode(customer.FullName)},</p>
<p>{intro}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;font-size:14px;">
  <tr><td><strong>Order number</strong></td><td align="right">{WebUtility.HtmlEncode(order.OrderNumber)}</td></tr>
  <tr><td><strong>Order date</strong></td><td align="right">{EmailLayout.FormatDate(order.ConfirmedAt ?? order.CreatedAt)}</td></tr>
  <tr><td><strong>Payment method</strong></td><td align="right">Online Payment</td></tr>
  <tr><td><strong>Payment status</strong></td><td align="right">Paid</td></tr>
</table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;font-size:14px;">
  <tr style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#7a6d72;">
    <th align="left" style="padding-bottom:8px;">Item</th>
    <th align="center" style="padding-bottom:8px;">Qty</th>
    <th align="right" style="padding-bottom:8px;">Total</th>
  </tr>
  {rows}
</table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 0 0;font-size:14px;">
  <tr><td>Subtotal</td><td align="right">{EmailLayout.FormatInr(pricing.SubtotalBeforeDiscount)}</td></tr>
  {savingsRow}
  <tr><td style="padding-top:8px;font-weight:700;">Total paid</td><td align="right" style="padding-top:8px;font-weight:700;color:{EmailLayout.BrandPink};">{EmailLayout.FormatInr(pricing.TotalPaid)}</td></tr>
</table>
{deliveryBlock}
{nextStep}
<p style="margin:16px 0 0 0;font-size:13px;color:#7a6d72;">Keep this email for your records — it has your order summary{(hasPhysical ? " and delivery address" : "")}.</p>
""";

        var textLines = new StringBuilder();
        textLines.AppendLine($"Hi {customer.FullName},");
        textLines.AppendLine();
        textLines.AppendLine(hasPhysical
            ? "Your VIVI Crochet product order has been placed."
            : "Your VIVI Crochet order is confirmed.");
        textLines.AppendLine();
        textLines.AppendLine($"Order number: {order.OrderNumber}");
        textLines.AppendLine($"Order date: {EmailLayout.FormatDate(order.ConfirmedAt ?? order.CreatedAt)}");
        textLines.AppendLine("Payment method: Online Payment");
        textLines.AppendLine();
        foreach (var line in pricing.Items)
        {
            if (line.HasOffer)
            {
                textLines.AppendLine(
                    $"{line.ProductName} x{line.Quantity}: {EmailLayout.FormatInr(line.OriginalLineTotal)} → {EmailLayout.FormatInr(line.PaidLineTotal)}");
            }
            else
            {
                textLines.AppendLine(
                    $"{line.ProductName} x{line.Quantity}: {EmailLayout.FormatInr(line.PaidLineTotal)}");
            }
        }
        textLines.AppendLine();
        textLines.AppendLine($"Subtotal: {EmailLayout.FormatInr(pricing.SubtotalBeforeDiscount)}");
        if (pricing.TotalSavings > 0)
            textLines.AppendLine($"MRP savings: -{EmailLayout.FormatInr(pricing.TotalSavings)}");
        textLines.AppendLine($"Total paid: {EmailLayout.FormatInr(pricing.TotalPaid)}");
        textLines.Append(BuildDeliveryText(order, hasPhysical));
        textLines.AppendLine(
            $"This email has your order summary{(hasPhysical ? " and delivery address" : "")} — keep it for your records.");
        textLines.AppendLine("Open the VIVI app to view your order and course access.");

        return (subject, EmailLayout.Wrap(title, body), textLines.ToString());
    }

    private static string BuildDeliveryBlock(Order order, bool hasPhysical)
    {
        if (!hasPhysical)
            return string.Empty;

        var address = FormatAddress(order);
        var expected = FormatExpectedDelivery(order);
        var phone = string.IsNullOrWhiteSpace(order.ShipPhone)
            ? string.Empty
            : $"<tr><td><strong>Delivery phone</strong></td><td align=\"right\">{WebUtility.HtmlEncode(order.ShipPhone)}</td></tr>";
        return $"""
<div style="margin:20px 0;padding:16px;border:2px solid {EmailLayout.BrandPink};background:#fff7fa;">
  <p style="margin:0 0 10px 0;font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:{EmailLayout.BrandPink};">Delivery address for this order</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;">
    <tr><td style="vertical-align:top;"><strong>Ship to</strong></td><td align="right">{address}</td></tr>
    {phone}
    <tr><td><strong>Expected delivery</strong></td><td align="right">{WebUtility.HtmlEncode(expected)}</td></tr>
  </table>
</div>
""";
    }

    private static string BuildDeliveryText(Order order, bool hasPhysical)
    {
        if (!hasPhysical)
            return string.Empty;
        var phoneLine = string.IsNullOrWhiteSpace(order.ShipPhone)
            ? string.Empty
            : $"\nDelivery phone: {order.ShipPhone}";
        return $"""

Delivery address for this order:
{PlainAddress(order)}{phoneLine}

Expected delivery: {FormatExpectedDelivery(order)}

""";
    }

    private static string FormatExpectedDelivery(Order order)
    {
        var from = (order.ManualDeliveryDateFrom ?? order.EstimatedDeliveryDateFrom)?.Date;
        var to = (order.ManualDeliveryDateTo ?? order.EstimatedDeliveryDateTo)?.Date;
        if (from is null || to is null)
            return "We will confirm shortly";
        if (from.Value == to.Value)
            return EmailLayout.FormatDate(from.Value);
        return $"{EmailLayout.FormatDate(from.Value)} – {EmailLayout.FormatDate(to.Value)}";
    }

    private static string FormatAddress(Order order)
    {
        var lines = new[]
        {
            WebUtility.HtmlEncode(order.ShipFullName ?? string.Empty),
            WebUtility.HtmlEncode(order.ShipAddressLine1 ?? string.Empty),
            WebUtility.HtmlEncode(order.ShipAddressLine2 ?? string.Empty),
            WebUtility.HtmlEncode(order.ShipLandmark ?? string.Empty),
            WebUtility.HtmlEncode($"{order.ShipCity} {order.ShipPinCode}".Trim()),
            WebUtility.HtmlEncode(order.ShipState ?? string.Empty),
            WebUtility.HtmlEncode(order.ShipCountry ?? "India")
        }.Where(l => !string.IsNullOrWhiteSpace(l) && l != string.Empty);
        return string.Join("<br/>", lines);
    }

    private static string PlainAddress(Order order)
        => string.Join("\n", new[]
        {
            order.ShipFullName,
            order.ShipAddressLine1,
            order.ShipAddressLine2,
            order.ShipLandmark,
            $"{order.ShipCity} {order.ShipPinCode}".Trim(),
            order.ShipState,
            order.ShipCountry ?? "India"
        }.Where(l => !string.IsNullOrWhiteSpace(l)));
}

public static class CourseAccessEmail
{
    public static (string Subject, string Html, string Text) Render(
        Customer customer,
        Course course,
        CourseEnrollment enrollment)
    {
        var body = $"""
<p>Hi {WebUtility.HtmlEncode(customer.FullName)},</p>
<p>Your course is ready to stream in the VIVI app.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;font-size:14px;">
  <tr><td><strong>Course</strong></td><td align="right">{WebUtility.HtmlEncode(course.Name)}</td></tr>
  <tr><td><strong>Purchase date</strong></td><td align="right">{EmailLayout.FormatDate(enrollment.PurchaseDate)}</td></tr>
  <tr><td><strong>Access starts</strong></td><td align="right">{EmailLayout.FormatDate(enrollment.AccessStartDate)}</td></tr>
  <tr><td><strong>Access until</strong></td><td align="right">{EmailLayout.FormatDate(enrollment.AccessExpiryDate)}</td></tr>
</table>
<p>Open the VIVI app → Learn &amp; Loop → your course → start watching your lessons.</p>
{EmailLayout.Button("Open VIVI Crochet", "vivi://learn")}
<p style="margin:16px 0 0 0;font-size:13px;color:#7a6d72;">If the button does not work, open the VIVI Crochet app on your phone and go to Learn.</p>
""";

        var text = $"""
Hi {customer.FullName},

Your VIVI Crochet course is ready: {course.Name}

Access until: {EmailLayout.FormatDate(enrollment.AccessExpiryDate)}

Open the VIVI app → Learn & Loop → your course.
""";

        return ("Your VIVI Crochet course is ready", EmailLayout.Wrap("Course access ready", body), text);
    }
}

public static class CourseExpiryReminderEmail
{
    public static (string Subject, string Html, string Text) Render(
        Customer customer,
        Course course,
        CourseEnrollment enrollment,
        bool showRenewalOffer,
        int renewalPercentage)
    {
        var daysLeft = Math.Max(0, (enrollment.AccessExpiryDate.Date - DateTime.UtcNow.Date).Days);
        var renewalBlock = showRenewalOffer
            ? $"""<p style="margin:16px 0 0 0;padding:12px;border:2px solid {EmailLayout.BrandInk};background:#fff6d6;">Renew now with a <strong>{renewalPercentage}%</strong> renewal offer before your access ends.</p>"""
            : "<p style=\"margin:16px 0 0 0;\">Renew in the VIVI app to keep learning without interruption.</p>";

        var body = $"""
<p>Hi {WebUtility.HtmlEncode(customer.FullName)},</p>
<p>Your access to <strong>{WebUtility.HtmlEncode(course.Name)}</strong> expires in <strong>{daysLeft} day{(daysLeft == 1 ? "" : "s")}</strong>.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;font-size:14px;">
  <tr><td><strong>Expiry date</strong></td><td align="right">{EmailLayout.FormatDate(enrollment.AccessExpiryDate)}</td></tr>
</table>
{renewalBlock}
{EmailLayout.Button("Renew in VIVI", "vivi://learn")}
""";

        var text = $"""
Hi {customer.FullName},

Your access to {course.Name} expires on {EmailLayout.FormatDate(enrollment.AccessExpiryDate)} ({daysLeft} days left).

Open the VIVI app to renew.
""";

        return ($"Your {course.Name} access expires in {daysLeft} days", EmailLayout.Wrap("Access expiring soon", body), text);
    }
}

public static class DeliveryDateUpdatedEmail
{
    public static (string Subject, string Html, string Text) Render(Customer customer, Order order)
    {
        var from = (order.ManualDeliveryDateFrom ?? order.EstimatedDeliveryDateFrom)?.Date;
        var to = (order.ManualDeliveryDateTo ?? order.EstimatedDeliveryDateTo)?.Date;
        var range = from is null || to is null
            ? "We will confirm shortly"
            : from.Value == to.Value
                ? EmailLayout.FormatDate(from.Value)
                : $"{EmailLayout.FormatDate(from.Value)} – {EmailLayout.FormatDate(to.Value)}";

        var reason = string.IsNullOrWhiteSpace(order.DeliveryDateOverrideReason)
            ? string.Empty
            : $"<p style=\"margin:16px 0 0 0;\">{WebUtility.HtmlEncode(order.DeliveryDateOverrideReason)}</p>";

        var body = $"""
<p>Hi {WebUtility.HtmlEncode(customer.FullName)},</p>
<p>The expected delivery date for your VIVI Crochet order has been updated.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;font-size:14px;">
  <tr><td><strong>Order number</strong></td><td align="right">{WebUtility.HtmlEncode(order.OrderNumber)}</td></tr>
  <tr><td><strong>Updated delivery</strong></td><td align="right">{WebUtility.HtmlEncode(range)}</td></tr>
</table>
{reason}
<p style="margin:16px 0 0 0;">Open the VIVI app to view your order.</p>
""";

        var text = $"""
Hi {customer.FullName},

The expected delivery date for order {order.OrderNumber} is now {range}.
{(string.IsNullOrWhiteSpace(order.DeliveryDateOverrideReason) ? "" : order.DeliveryDateOverrideReason + "\n")}
Open the VIVI app to view your order.
""";

        return (
            "Your VIVI Crochet delivery date has been updated",
            EmailLayout.Wrap("Delivery date updated", body),
            text);
    }
}

public static class LiveBookingConfirmationEmail
{
    public static (string Subject, string Html, string Text) Render(
        Customer customer,
        Order order,
        LiveBooking booking,
        LiveWeek week,
        string slotName)
    {
        var dates = $"{week.StartDate:dd MMM yyyy} – {week.EndDate:dd MMM yyyy}";
        var body = $"""
<p>Hi {WebUtility.HtmlEncode(customer.FullName)},</p>
<p>Your VIVI Crochet live booking is confirmed.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;font-size:14px;">
  <tr><td><strong>Booking reference</strong></td><td align="right">{WebUtility.HtmlEncode(order.OrderNumber)}</td></tr>
  <tr><td><strong>Circle</strong></td><td align="right">{WebUtility.HtmlEncode(slotName)}</td></tr>
  <tr><td><strong>Week</strong></td><td align="right">Week {week.WeekNumber}</td></tr>
  <tr><td><strong>Dates</strong></td><td align="right">{WebUtility.HtmlEncode(dates)}</td></tr>
  <tr><td><strong>Price</strong></td><td align="right">{EmailLayout.FormatInr(order.TotalAmount)}</td></tr>
  <tr><td><strong>Payment</strong></td><td align="right">Paid online</td></tr>
</table>
<p style="margin:16px 0 0 0;"><strong>Important:</strong> Sunday is always OFF. Class days are Monday–Friday, with Saturday used only when a weekday class is marked as a break.</p>
<p style="margin:16px 0 0 0;">See you in the Live Crochet Studio.</p>
""";

        var text = $"""
Hi {customer.FullName},

Your VIVI Crochet live booking is confirmed.

Booking reference: {order.OrderNumber}
Circle: {slotName}
Week: Week {week.WeekNumber}
Dates: {dates}
Price: {EmailLayout.FormatInr(order.TotalAmount)}
Payment: Paid online

Sunday is always OFF. Class days are Monday–Friday, with Saturday used only as a replacement when a weekday is on break.

See you in the Live Crochet Studio.
""";

        return (
            "Your VIVI Crochet live booking is confirmed",
            EmailLayout.Wrap("Live booking confirmed", body),
            text);
    }
}

public static class PasswordResetEmail
{
    public static (string Subject, string Html, string Text) Render(string code, int expiresMinutes)
    {
        var body = $"""
<p>We received a request to reset your VIVI Crochet password.</p>
<p style="margin:20px 0;font-size:28px;font-weight:800;letter-spacing:0.2em;color:{EmailLayout.BrandPink};">{WebUtility.HtmlEncode(code)}</p>
<p>Enter this code in the app to choose a new password. It expires in {expiresMinutes} minutes.</p>
<p style="margin:16px 0 0 0;color:#7a6d72;font-size:13px;">If you did not request this, you can ignore this email — your password will stay the same.</p>
""";

        var text = $"""
We received a request to reset your VIVI Crochet password.

Your reset code: {code}

Enter this code in the app to choose a new password. It expires in {expiresMinutes} minutes.

If you did not request this, you can ignore this email.
""";

        return (
            "Reset your VIVI Crochet password",
            EmailLayout.Wrap("Password reset", body),
            text);
    }
}

public static class EmailVerificationEmail
{
    public static (string Subject, string Html, string Text) Render(string code, int expiresMinutes)
    {
        var body = $"""
<p>Confirm this email for your VIVI Crochet account.</p>
<p style="margin:20px 0;font-size:28px;font-weight:800;letter-spacing:0.2em;color:{EmailLayout.BrandPink};">{WebUtility.HtmlEncode(code)}</p>
<p>Enter this code in the app to verify your email. It expires in {expiresMinutes} minutes.</p>
<p style="margin:16px 0 0 0;color:#7a6d72;font-size:13px;">If you did not request this, you can ignore this email.</p>
""";

        var text = $"""
Confirm this email for your VIVI Crochet account.

Your verification code: {code}

Enter this code in the app to verify your email. It expires in {expiresMinutes} minutes.

If you did not request this, you can ignore this email.
""";

        return (
            "Verify your VIVI Crochet email",
            EmailLayout.Wrap("Verify email", body),
            text);
    }
}

