/** Central customer-facing copy for business app pages and sections. */

import { VERIFICATION_STATUS_COPY } from "@easner/shared"

export const PAGE_COPY = {
  settings: {
    hero: "Manage your account, team, and billing.",
  },
  dashboard: {
    title: "Dashboard",
    intro: "See balances and recent activity at a glance.",
    balanceHelper: "Combined total across all currency accounts.",
    recentActivity: "Latest sends, deposits, and invoice payments.",
  },
  accounts: {
    title: "Accounts",
    intro: "Hold balances and add money in USD, EUR, or stablecoins.",
  },
  send: {
    title: "Send money",
    intro: "Send money from your balance to a saved payee.",
    confirmIntro: "Check amount and recipient before you send.",
    momoIntro: "Enter the number and network you'll pay from.",
  },
  invoices: {
    title: "Invoices",
    intro: "Create invoices and track what customers owe you.",
    createIntro: "Bill a customer and choose how they can pay.",
    editIntro: "Update amounts, due date, or payment options.",
    blockedIntro: "Finish your business profile before you can invoice.",
    importIntro: "Upload a CSV to create draft invoices.",
    payInBlocked: "Complete verification to show payment instructions here.",
  },
  transactions: {
    title: "Transactions",
    intro: "Review money in and out of your accounts.",
    detailIntro: "Details for this transfer or deposit.",
  },
  cards: {
    title: "Cards",
    intro: "Spend from your balance with business cards.",
    transactionsSection: "Review card spend for the selected period.",
  },
  terminal: {
    title: "Terminal",
    intro: "Take in-person stablecoin payments at your counter.",
  },
  qrPay: {
    title: "QR Pay",
    intro: "Accept in-person payments with QR placards.",
    createTitle: "Create Placard",
    createIntro: "Set up a placard for in-person stablecoin payments.",
  },
  developers: {
    title: "Developer Tools",
    intro: "Connect Easner to your apps with APIs and webhooks.",
  },
} as const

export const INVOICE_CREATE_SECTION_COPY = {
  customer: "Choose who you're billing.",
  details: "Set currency, due date, and reference.",
  items: "Add line items and amounts.",
  summary: "Review total before you send.",
  easetagHint: "Add a business handle for shorter invoice links.",
  saving: "Saving…",
  saved: "Saved",
  issue: "Create",
  issueAndEmail: "Send",
  saveDraft: "Draft",
  saveChanges: "Save",
} as const

export const INVOICE_ACTION_COPY = {
  issue: "Create",
  issueAndEmail: "Send",
  issuing: "Creating…",
  emailCustomer: "Email invoice",
  emailAgain: "Email again",
  emailInvoice: "Email invoice",
  emailReceipt: "Email receipt",
  sending: "Sending…",
  preview: "Preview",
  share: "Share",
  copyCustomerLink: "Copy customer link",
  copyPreviewLink: "Copy preview link",
  openPreview: "Open preview",
  downloadPdf: "Download PDF",
  changeStatus: "Change status",
  markSent: "Mark as sent",
  markPastDue: "Mark past due",
  markPaid: "Mark as paid",
  markUnpaid: "Revert to unpaid",
  reopenUnpaid: "Reopen as unpaid",
  voidInvoice: "Void invoice",
} as const

export const INVOICE_TOAST_COPY = {
  issued: "Invoice issued",
  sentTo: (email: string) => `Invoice sent to ${email}`,
  receiptSentTo: (email: string) => `Receipt sent to ${email}`,
  issueFailed: "Could not issue invoice",
  emailFailed: "Could not send email",
  receiptEmailFailed: "Could not send receipt",
  customerLinkCopied: "Link copied",
  previewLinkCopied: "Preview link copied",
  issueBeforeEmail: "Issue this invoice before emailing",
  noCustomerEmail: "Invoice has no customer email",
  markedSent: "Invoice marked as sent",
  markedPastDue: "Invoice marked past due",
  markedPaid: "Invoice marked as paid",
  revertedUnpaid: "Invoice reverted to unpaid",
  reopenedUnpaid: "Invoice reopened as unpaid",
  voided: "Invoice voided",
  statusUpdated: "Invoice status updated",
  archived: "Invoice archived",
  restored: "Invoice restored",
  deleted: "Invoice deleted",
  duplicated: "Invoice duplicated",
  duplicateFailed: "Could not duplicate invoice",
} as const

export const INVOICE_STATUS_COPY = {
  draft: {
    label: "Draft",
    helper: "Not shared with your customer yet. Issue when ready.",
    nextAction: "Issue this invoice or email it when ready.",
  },
  unpaid: {
    label: "Unpaid",
    helper: "Issued and awaiting payment. Email your customer when ready.",
    nextAction: "Email your customer so they can view and pay.",
  },
  sent: {
    label: "Sent",
    helper: "Your customer has been emailed this invoice.",
    nextAction: "Track views and payment, or send a reminder.",
  },
  past_due: {
    label: "Past due",
    helper: "Payment is overdue. Follow up with your customer.",
    nextAction: "Email again or mark as paid if you were paid elsewhere.",
  },
  paid: {
    label: "Paid",
    helper: "This invoice is paid in full.",
    nextAction: null,
  },
  void: {
    label: "Void",
    helper: "This invoice is canceled and no longer payable.",
    nextAction: null,
  },
} as const

export const INVOICE_SHARE_COPY = {
  customerLink: "Customer link",
  previewLink: "Preview link",
  customerLinkHintUnpaid: "Share this link so your customer can view and pay this invoice.",
  customerLinkHintSent: "Your customer can view and pay using this link.",
  customerLinkHintPaid: "Your customer can view this invoice and download the receipt.",
  customerLinkHintVoid: "Link shows this invoice as void to your customer.",
  customerLinkHintDefault: "Share this link so your customer can view this invoice.",
  previewHint: "See how your customer sees this invoice.",
  draftPreviewHint:
    "Issue this invoice to get a customer link. Use preview to see how your customer will see it.",
  customerLinkDisabledDraft: "Issue this invoice to share a customer link.",
  lastViewed: "Last viewed",
  lastEmailed: "Last emailed",
  neverViewed: "Not viewed yet",
  neverEmailed: "Not emailed yet",
} as const

export const INVOICE_BANNER_COPY = {
  fieldsLocked:
    "This invoice has been shared with your customer. Customer, currency, and line amounts are locked. Void and reissue to change amounts.",
  onlinePaymentsIncomplete:
    "Online payments are enabled but not fully set up. Finish setup in Verification to let customers pay online.",
  onlinePaymentsCta: "Go to Verification",
  bankTransferIncomplete:
    "Bank transfer details need Tier 2 verification before they appear on invoices.",
  stablecoinIncomplete: "Add a stablecoin wallet in Accounts to show deposit addresses on invoices.",
} as const

export const INVOICE_LIST_COPY = {
  outstanding: "Outstanding",
  overdue: "Overdue",
  paidThisMonth: "Paid this month",
  mixedCurrencies: "Mixed currencies — totals shown in your base currency where possible.",
  emptyAll: "No invoices yet — create one to get started.",
  emptyDraft: "No drafts — create an invoice to get started.",
  emptyUnpaid: "No unpaid invoices.",
  emptySent: "No sent invoices.",
  emptyPastDue: "No past-due invoices.",
  emptyPaid: "No paid invoices yet.",
  emptyArchived: "No archived invoices.",
  emptySearch: "Try adjusting your search terms.",
  createCta: "Create invoice",
} as const

export const INVOICE_SETTINGS_COPY = {
  bankTransfer: "Bank transfer",
  bankTransferHelp: "Show bank transfer details when available",
  stablecoin: "Stablecoin",
  stablecoinHelp: "Show wallet deposit address when available",
  onlinePayments: "Online payments",
  onlinePaymentsHelp: "Let customers pay invoices online by card or bank",
  defaultPaymentOption: "Default payment option",
  includePaymentOnPdf: "Include payment link on PDF",
  includePaymentOnPdfHelp:
    "Adds a link to the live invoice page where customers choose how to pay",
  includePaymentInEmail: "Include payment instructions in invoice emails",
  includePaymentInEmailHelp:
    "Tells customers they can pay via the invoice link (online, bank, or stablecoin)",
  replyTo: "Reply-To",
  replyToHelp: "Replies to invoice emails go to this address.",
  replyToMissing: "Add a support email in Business settings",
  notifyOnView: "Email when customer views invoice",
  notifyOnViewHelp: "Sent once on first customer view",
  notifyOnPaid: "Email when an invoice is paid",
  notifyOnPaidHelp: "Sent to your Reply-To address when a customer pays or you mark an invoice paid",
  sendReceipt: "Email receipt to customer when invoice is paid",
  remindersTitle: "Payment reminders",
  remindersIntro: "Automatically email customers about upcoming and overdue invoices.",
  dueDateReminder: "Remind on due date",
  dueDateReminderHelp: "Send a reminder the day the invoice is due.",
  overdueReminder: "Remind when overdue",
  overdueReminderHelp: "Send a reminder about 7 days after the due date.",
} as const

export const INVOICE_CUSTOMER_VIEW_COPY = {
  previewBannerTitle: "Preview",
  previewBannerBody: "This is how your customer sees this invoice.",
  notAvailableYet: "This invoice isn't available yet.",
  notFound: "This invoice may have been removed or the link is incorrect.",
  payOnlineUnavailable: "Online payment isn't available right now. Try bank transfer or contact the business.",
  signInPreviewTitle: "Sign in to preview",
  signInPreviewBody: "This preview link is only available to signed-in members of your business.",
  paymentRefundedPrefix: "Your payment was refunded on",
} as const

export const INVOICE_ACTIVITY_COPY = {
  created: "Invoice was created",
  issued: "Invoice was issued",
  sent: "Invoice was emailed to customer",
  viewed: "Invoice viewed by customer",
  paid: "Invoice was marked as paid",
  unpaid: "Invoice was issued",
  void: "Invoice was voided",
  past_due: "Invoice was marked past due",
  draft: "Invoice was reverted to draft",
  reminderDueToday: "Due-date reminder sent",
  reminderOverdue: "Overdue reminder sent",
  reminderSent: "Payment reminder sent",
  refunded: "Online payment was refunded",
} as const

export const INVOICE_STRIPE_SETTLEMENT_COPY = {
  paymentReceived: "Payment received",
  clearing: "Clearing",
  available: "Available",
  refunded: "Refunded",
  failed: "Failed",
} as const

export const INVOICE_IMPORT_SECTION_COPY = {
  upload: "Match columns to customer, amount, and due date.",
} as const

export const QR_PAY_CREATE_SECTION_COPY = {
  placard: "Choose what customers pay with.",
  payout: "Choose where settlement is sent.",
} as const

export const PAYROLL_TAB_COPY = {
  overview: "Pay your team and see what needs attention.",
  people: "Add employees and contractors you pay.",
  runs: "Create and approve payroll before money moves.",
  schedules: "Set up recurring paydays for your team.",
  settings: "Configure payroll defaults for your organization.",
} as const

export const PAYROLL_SUBPAGE_COPY = {
  personDetail: "View pay history and payout readiness.",
  scheduleDetail: "Manage who is paid on each schedule.",
} as const

export const ONBOARDING_STEP_COPY = {
  businessPending: "Add company details in Settings.",
  businessComplete: "Business profile complete",
  mfaPending: "Add an authenticator app.",
  mfaComplete: "2FA enabled",
  verifyPending: "Complete business verification.",
  verifyComplete: VERIFICATION_STATUS_COPY.verified,
  verifyRejected: VERIFICATION_STATUS_COPY.actionNeeded,
  verifyReview: VERIFICATION_STATUS_COPY.inReview,
  fundAfterVerification: "Available after verification",
  fundPending: "Add money to start sending.",
  fundComplete: "Balance received",
  payrollPending: "Add who you pay and how they get paid.",
  payrollReceivingPending: "Confirm receiving methods for your people.",
} as const

export const BANNER_COPY = {
  verification:
    "Complete verification to unlock payments and accounts.",
  verificationInProgress:
    "Finish verification to unlock payments and accounts.",
  verificationInReview:
    "Verification is in progress. This usually completes within 1–3 days.",
  verificationActionNeeded:
    "Verification needs your attention. Review the status in settings.",
  invoiceProfileTitle: "Finish your business profile to create invoices.",
} as const

/** Short link label on the dashboard / pay verification banner. */
export const BANNER_CTA_COPY = {
  begin: "Begin",
  continue: "Continue",
  status: "Status",
  retry: "Retry",
} as const

export type VerificationBannerOpts = {
  /** Hosted KYB started (in progress or Grid customer exists) but Tier 1 not complete. */
  started?: boolean
  /** False when the signed-in user cannot start hosted verification (non-owner). */
  canManage?: boolean
}

function normalizeVerificationBannerStatus(status: string | null | undefined): string {
  return String(status ?? "").toLowerCase().trim()
}

function verificationBannerIsInReview(status: string): boolean {
  return (
    status === "pending" ||
    status === "in_review" ||
    status === "under_review" ||
    status.includes("review")
  )
}

export function verificationBannerStarted(
  status: string | null | undefined,
  gridCustomerId: string | null | undefined,
): boolean {
  return (
    normalizeVerificationBannerStatus(status) === "in_progress" || Boolean(gridCustomerId?.trim())
  )
}

export function verificationBannerCopy(status: string | null | undefined): string {
  const s = normalizeVerificationBannerStatus(status)
  if (s === "in_progress") {
    return BANNER_COPY.verificationInProgress
  }
  if (verificationBannerIsInReview(s)) {
    return BANNER_COPY.verificationInReview
  }
  if (s === "rejected" || s === "hold") {
    return BANNER_COPY.verificationActionNeeded
  }
  return BANNER_COPY.verification
}

export function verificationBannerCta(
  status: string | null | undefined,
  opts?: VerificationBannerOpts,
): string {
  if (opts?.canManage === false) {
    return BANNER_CTA_COPY.status
  }

  const s = normalizeVerificationBannerStatus(status)
  if (s === "rejected") {
    return BANNER_CTA_COPY.retry
  }
  if (s === "hold") {
    return BANNER_CTA_COPY.continue
  }
  if (s === "in_progress" || opts?.started) {
    return BANNER_CTA_COPY.continue
  }
  if (verificationBannerIsInReview(s)) {
    return BANNER_CTA_COPY.status
  }
  return BANNER_CTA_COPY.begin
}

export const DEVELOPER_TOOL_COPY = {
  apiReference: "Browse endpoints and examples.",
  sdks: "Install official client libraries.",
  webhooks: "Receive real-time event notifications.",
  events: "Monitor API events and activity.",
  logs: "Monitor API activity and debug issues.",
  apiKeys: "Create and rotate API keys.",
} as const

export const AUTH_COPY = {
  join: "Accept your team invitation.",
  joinInvalid: "This invitation link is invalid or incomplete.",
  joinEmailHint: "Continue with the email address that received this invitation.",
} as const

export const SETTINGS_TAB_COPY = {
  personal: { title: "Personal", intro: "Manage your profile and keep your account secure." },
  business: { title: "Business", intro: "Set up your company for invoices and banking." },
  verification: { title: "Verification", intro: "Complete verification to unlock payments and accounts." },
  team: { title: "Team", intro: "Control who can access your organization." },
  recipients: { title: "Recipients", intro: "Keep payee details ready for transfers." },
  customers: { title: "Customers", intro: "Manage who you bill and track invoices." },
  communication: { title: "Communication", intro: "Control product and security emails from Easner." },
  invoicing: { title: "Invoicing", intro: "Configure how you send invoices and get paid." },
} as const

export const SETTINGS_CARD_COPY = {
  personalInfo: "Update how you appear on this account.",
  security: "Protect your sign-in and lock the app.",
  businessInfo: "Set up how your company appears on invoices.",
  legalEntity: "Confirm where your business is registered.",
  registeredAddress: "Legal address from business verification (read-only).",
  businessAddress: "Street address for invoices and statements.",
  publicInfo: "Add contact details shown to customers.",
  complianceTiers: "Start Tier 1 verification to unlock banking.",
  teamMembers: "Invite teammates and manage access.",
  recipients: "Add payees to send money faster.",
  customers: "Add contacts before you create invoices.",
  customerInvoices: "Open or create invoices for this contact.",
  customerSummary: "Review billing history with this customer.",
  communicationPrefs: "Choose which emails you receive.",
  invoicePaymentDefaults: "Choose payment options on new invoices.",
  invoiceNotifications: "Get notified when customers view or pay.",
} as const

export const VERIFICATION_SECTION_COPY = {
  complianceTiers: "Start Tier 1 verification to unlock banking.",
  accountsProvisioning:
    "Setting up your accounts and deposit details. This usually completes within a few minutes.",
  verificationOnHold:
    "We need a bit more information. Review the note below, then continue verification to provide it.",
  onlinePaymentsTier1Required:
    "Complete Global banking verification before you can verify for online payments.",
} as const
