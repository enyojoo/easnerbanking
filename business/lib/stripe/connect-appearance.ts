/**
 * Stripe Connect embedded component appearance aligned with Easner business UI.
 * @see https://docs.stripe.com/connect/embedded-appearance-options
 *
 * Connect components cannot be restyled with CSS – only these appearance variables apply.
 */
export function easnerStripeConnectAppearance() {
  const primary = "#0080cc"
  const background = "#faf9f6"
  const text = "#121518"
  const textSecondary = "#5c6369"
  const danger = "#7a2e2e"
  const border = "#d4cfc4"
  const fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"

  return {
    overlays: "none" as const,
    variables: {
      colorPrimary: primary,
      colorBackground: background,
      colorText: text,
      colorSecondaryText: textSecondary,
      colorDanger: danger,
      fontFamily,
      fontSizeBase: "15px",
      borderRadius: "12px",
      spacingUnit: "4px",
      colorBorder: border,
      formBackgroundColor: background,
      formHighlightColorBorder: primary,
      formAccentColor: primary,
      formPlaceholderTextColor: textSecondary,
      formBorderRadius: "8px",
      buttonBorderRadius: "8px",
      buttonPrimaryColorBackground: primary,
      buttonPrimaryColorBorder: primary,
      buttonPrimaryColorText: "#ffffff",
      buttonSecondaryColorBackground: "#ebe8e2",
      buttonSecondaryColorBorder: border,
      buttonSecondaryColorText: text,
      actionPrimaryColorText: primary,
      offsetBackgroundColor: "#f5f3ef",
      badgeNeutralColorBackground: "#ebe8e2",
      badgeNeutralColorText: textSecondary,
      badgeNeutralColorBorder: border,
      badgeSuccessColorBackground: "#d4edda",
      badgeSuccessColorText: "#0d6832",
      badgeSuccessColorBorder: "#b4dfc4",
      badgeWarningColorBackground: "#fef3cd",
      badgeWarningColorText: "#856404",
      badgeWarningColorBorder: "#f5da80",
      badgeDangerColorBackground: "#f8e8e8",
      badgeDangerColorText: danger,
      badgeDangerColorBorder: "#e8c4c4",
      // Easner UI uses sentence case, not Stripe's default uppercase headings/labels.
      buttonLabelTextTransform: "none",
      headingSmTextTransform: "none",
      headingMdTextTransform: "none",
      headingLgTextTransform: "none",
      headingXlTextTransform: "none",
      labelMdTextTransform: "none",
      labelSmTextTransform: "none",
      actionPrimaryTextTransform: "none",
      actionSecondaryTextTransform: "none",
    },
  }
}
