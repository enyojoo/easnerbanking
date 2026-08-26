/** Canonical PostHog event names shared across business and consumer apps. */
export const ANALYTICS_EVENTS = {
  // Auth
  signupPageViewed: "signup_page_viewed",
  signupCompleted: "signup_completed",
  loginCompleted: "login_completed",
  userSignedUp: "user_signed_up",
  userSignedIn: "user_signed_in",
  userSignedOut: "user_signed_out",
  signInFailed: "sign_in_failed",
  signInCancelled: "sign_in_cancelled",

  // Onboarding / activation
  onboardingStepViewed: "onboarding_step_viewed",
  onboardingCompleted: "onboarding_completed",
  onboardingBootstrapCompleted: "onboarding_bootstrap_completed",
  firstAccountReady: "first_account_ready",

  // KYB / KYC
  kybStarted: "kyb_started",
  kybStepCompleted: "kyb_step_completed",
  kybSubmitted: "kyb_submitted",
  kybApproved: "kyb_approved",
  kybRejected: "kyb_rejected",
  kybStatusCorrected: "kyb_status_corrected",
  kycStarted: "kyc_started",
  kycSubmitted: "kyc_submitted",
  kycCompleted: "kyc_completed",
  stripeConnectCompleted: "stripe_connect_completed",

  // Send / receive
  sendStarted: "send_started",
  sendQuoteViewed: "send_quote_viewed",
  sendSubmitted: "send_submitted",
  sendCompleted: "send_completed",
  sendFailed: "send_failed",
  receiveViewed: "receive_viewed",
  receiveDetailsCopied: "receive_details_copied",
  expressDepositStarted: "express_deposit_started",
  expressDepositCompleted: "express_deposit_completed",
  transactionStarted: "transaction_started",
  transactionCompleted: "transaction_completed",

  // Recipients
  recipientAdded: "recipient_added",
  recipientSelected: "recipient_selected",
  recipientEdited: "recipient_edited",

  // Invoices / collections
  invoiceDraftSaved: "invoice_draft_saved",
  invoiceIssued: "invoice_issued",
  invoiceSent: "invoice_sent",
  invoicePaid: "invoice_paid",
  paymentLinkCreated: "payment_link_created",
  checkoutSiteLiveEnabled: "checkout_site_live_enabled",
  checkoutStarted: "checkout_started",
  checkoutCompleted: "checkout_completed",

  // Payer (public checkout surfaces)
  payerInvoiceViewed: "payer_invoice_viewed",
  payerCheckoutStarted: "payer_checkout_started",
  payerPaymentSucceeded: "payer_payment_succeeded",
  payerPaymentFailed: "payer_payment_failed",
  payerStablecoinPaid: "payer_stablecoin_paid",
  payerLinkViewed: "payer_link_viewed",

  // Payroll
  payrollOpened: "payroll_opened",
  payrollRunCreated: "payroll_run_created",
  payrollRunSubmitted: "payroll_run_submitted",
  payrollRunExecuted: "payroll_run_executed",
  payrollRunFailed: "payroll_run_failed",
  payrollDeepLinkOpened: "payroll_deep_link_opened",

  // Cards / accounts
  cardTabViewed: "card_tab_viewed",
  currencyAccountOpened: "currency_account_opened",

  // Mobile-only
  pushOpened: "push_opened",
  deepLinkOpened: "deep_link_opened",
  pinSetupCompleted: "pin_setup_completed",
  appLocked: "app_locked",
  mobileColdStart: "mobile_cold_start",
  mobileTabSwitch: "mobile_tab_switch",

  // Generic
  featureUsed: "feature_used",
  errorOccurred: "error_occurred",
  supportLiveChatOpened: "support_live_chat_opened",
  emptyStateCtaClicked: "empty_state_cta_clicked",
} as const

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]
