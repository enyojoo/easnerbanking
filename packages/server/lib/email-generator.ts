// Email template generator — Easner design system
//
// Palette: Graphite (#0F1110) + Ivory (#F6F3EB) + Primary (#007ACC),
// hover (#0062A3), dark-mode links/CTA (#3AA6F8).
// Typography: system sans for body, Georgia serif fallback for the
// display title so email clients render an editorial headline without
// requiring a webfont.

export function generateBaseEmailTemplate(
  title: string,
  subtitle: string,
  content: string,
  ctaButton?: { text: string; url: string }
): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Easner</title>
    <style>
        /* Reset styles */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #1C201E;
            background-color: #F8F6F0;
        }

        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #FFFFFF;
            border-radius: 16px;
            overflow: hidden;
            border: 1px solid #E9E4D8;
        }

        .email-header {
            background: #FFFFFF;
            padding: 48px 32px 32px 32px;
            text-align: center;
            border-bottom: 1px solid #E9E4D8;
        }

        .logo {
            max-width: 120px;
            height: auto;
            margin: 0 auto 24px auto;
            display: block;
        }

        .email-title {
            color: #0F1110;
            font-family: 'Playfair Display', Georgia, 'Times New Roman', serif;
            font-size: 28px;
            font-weight: 600;
            letter-spacing: -0.01em;
            line-height: 1.2;
            margin-bottom: 8px;
        }

        .email-subtitle {
            color: #6F756F;
            font-size: 15px;
            font-weight: 400;
        }

        .email-body {
            padding: 40px 32px;
        }

        .welcome-text {
            font-size: 17px;
            color: #0F1110;
            margin-bottom: 20px;
            font-weight: 600;
        }

        .confirmation-text {
            font-size: 15px;
            color: #3D403D;
            margin-bottom: 24px;
            line-height: 1.7;
        }

        .cta-button {
            display: inline-block;
            background: #007ACC;
            color: #F6F3EB !important;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 999px;
            font-weight: 600;
            font-size: 15px;
            text-align: center;
            margin: 20px 0;
            letter-spacing: 0.01em;
        }

        .cta-button:hover {
            background: #0062A3;
        }

        .security-note {
            background-color: #F8F6F0;
            border: 1px solid #E9E4D8;
            border-left: 3px solid #007ACC;
            padding: 20px 22px;
            margin: 28px 0;
            border-radius: 0 12px 12px 0;
        }

        .security-note h3 {
            color: #0F1110;
            font-size: 15px;
            margin-bottom: 6px;
            font-weight: 600;
            letter-spacing: 0.02em;
            text-transform: uppercase;
        }

        .security-note p {
            color: #3D403D;
            font-size: 15px;
            margin: 0;
        }

        .email-footer {
            background-color: #FFFFFF;
            padding: 28px 32px 32px 32px;
            text-align: center;
            border-top: 1px solid #E9E4D8;
        }

        .footer-text {
            color: #6F756F;
            font-size: 13px;
            margin-bottom: 14px;
        }

        .footer-links {
            margin: 14px 0;
        }

        .footer-links a {
            color: #007ACC;
            text-decoration: none;
            margin: 0 12px;
            font-size: 13px;
            font-weight: 500;
        }

        .footer-links a:hover {
            text-decoration: underline;
        }

        .company-info {
            color: #8A8F8A;
            font-size: 11px;
            line-height: 1.6;
            margin-top: 18px;
        }

        .transaction-details {
            background-color: #F8F6F0;
            border: 1px solid #E9E4D8;
            border-radius: 12px;
            padding: 22px;
            margin: 24px 0;
        }

        .transaction-details h3 {
            color: #0F1110;
            font-size: 13px;
            margin-bottom: 14px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .detail-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #EFECE2;
            font-size: 14px;
        }

        .detail-row:last-child {
            border-bottom: none;
        }

        .detail-label {
            color: #6F756F;
            font-weight: 500;
            font-size: 13px;
        }

        .detail-value {
            color: #0F1110;
            font-weight: 600;
            font-size: 14px;
            font-variant-numeric: tabular-nums;
        }

        .status-badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .status-pending {
            background-color: #FAF1DB;
            color: #8A6221;
        }

        .status-processing {
            background-color: #EFECE2;
            color: #3D403D;
        }

        .status-completed {
            background-color: #E6F4EC;
            color: #0A6E4C;
        }

        .status-failed {
            background-color: #F4E5E5;
            color: #5F2424;
        }

        .status-cancelled {
            background-color: #EFECE2;
            color: #6F756F;
        }

        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
            body {
                background-color: #0A0B0A;
                color: #E5E1D5;
            }

            .email-container {
                background-color: #151817;
                border-color: #262926;
            }

            .email-header {
                background: #151817;
                border-bottom-color: #262926;
            }

            .email-title {
                color: #F6F3EB;
            }

            .email-subtitle {
                color: #8A8F8A;
            }

            .welcome-text {
                color: #F6F3EB;
            }

            .confirmation-text {
                color: #D5D1C5;
            }

            .security-note {
                background-color: #1C201E;
                border-color: #262926;
                border-left-color: #3AA6F8;
            }

            .security-note h3 {
                color: #F6F3EB;
            }

            .security-note p {
                color: #D5D1C5;
            }

            .email-footer {
                background-color: #151817;
                border-top-color: #262926;
            }

            .footer-text {
                color: #8A8F8A;
            }

            .footer-links a {
                color: #3AA6F8;
            }

            .company-info {
                color: #6F756F;
            }

            .transaction-details {
                background-color: #1C201E;
                border-color: #262926;
            }

            .transaction-details h3 {
                color: #F6F3EB;
            }

            .detail-row {
                border-bottom-color: #262926;
            }

            .detail-label {
                color: #8A8F8A;
            }

            .detail-value {
                color: #F6F3EB;
            }

            .cta-button {
                background: #3AA6F8;
                color: #F6F3EB !important;
            }

            .cta-button:hover {
                background: #2B8FDC;
            }
        }

        /* Mobile responsiveness */
        @media only screen and (max-width: 600px) {
            .email-container {
                margin: 0;
                border-radius: 0;
                border-left: none;
                border-right: none;
            }

            .email-header {
                padding: 36px 24px 28px 24px;
            }

            .email-title {
                font-size: 24px;
            }

            .email-body {
                padding: 32px 24px;
            }

            .welcome-text {
                font-size: 16px;
            }

            .confirmation-text {
                font-size: 15px;
            }

            .cta-button {
                display: block;
                width: 100%;
                padding: 16px 20px;
                font-size: 15px;
            }

            .email-footer {
                padding: 24px 20px;
            }

            .footer-links a {
                display: block;
                margin: 10px 0;
            }

            .detail-row {
                flex-direction: column;
                align-items: flex-start;
                gap: 2px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="email-header">
            <img src="https://seeqjiebmrnolcyydewj.supabase.co/storage/v1/object/public/brand/Easner%20Logo.png" alt="Easner Logo" class="logo">
            <h1 class="email-title">${title}</h1>
            ${subtitle ? `<p class="email-subtitle">${subtitle}</p>` : ''}
        </div>

        <!-- Body -->
        <div class="email-body">
            ${content}

            ${ctaButton ? `
            <div style="text-align: center;">
                <a href="${ctaButton.url}" class="cta-button">${ctaButton.text}</a>
            </div>
            ` : ''}
        </div>

        <!-- Footer -->
        <div class="email-footer">
            <p class="footer-text">
                Need help? We're here for you.
            </p>

            <div class="footer-links">
                <a href="mailto:support@easner.com">Contact Support</a>
            </div>

            <p class="company-info">
                © 2025 Easner, Inc. All rights reserved.<br>
                28 Geary St Ste 650, San Francisco, CA 94108<br>
                You received this email because you have an Easner account.
            </p>
        </div>
    </div>
</body>
</html>
  `
}

export function generateTransactionDetails(data: any): string {
  return `
    <div class="transaction-details">
      <h3>Transaction Details</h3>
      <div class="detail-row">
        <span class="detail-label">Transaction ID</span>
        <span class="detail-value">${data.transactionId}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Recipient</span>
        <span class="detail-value">${data.recipientName}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Amount</span>
        <span class="detail-value">${data.sendAmount} ${data.sendCurrency}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Receiving</span>
        <span class="detail-value">${data.receiveAmount} ${data.receiveCurrency}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Rate used</span>
        <span class="detail-value">1 ${data.sendCurrency} = ${data.exchangeRate} ${data.receiveCurrency}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Fee</span>
        <span class="detail-value">${data.fee} ${data.sendCurrency}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <span class="detail-value">
          <span class="status-badge status-${data.status}">${data.status}</span>
        </span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Date</span>
        <span class="detail-value">${new Date(data.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  `
}

export function generateFooter(): string {
  return `
    <p class="footer-text">
      Need help? We're here for you.
    </p>

    <div class="footer-links">
      <a href="mailto:support@easner.com">Contact Support</a>
    </div>

    <p class="company-info">
      © 2025 Easner, Inc. All rights reserved.<br>
      28 Geary St Ste 650, San Francisco, CA 94108<br>
      You received this email because you have an Easner account.
    </p>
  `
}
