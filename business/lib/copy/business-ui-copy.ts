/** Central customer-facing copy for business app pages and sections. */

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
  paymentMethods: "Choose how this customer can pay.",
  summary: "Review total before you send.",
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
  verifyPending: "Complete business verification.",
  verifyComplete: "Verified",
  verifyRejected: "Rejected",
  verifyReview: "In review",
  fundAfterVerification: "Available after verification",
  fundPending: "Add money to start sending.",
  fundComplete: "Balance received",
  payrollPending: "Add who you pay and how they get paid.",
  payrollReceivingPending: "Confirm receiving methods for your people.",
} as const

export const BANNER_COPY = {
  verification:
    "Complete verification to unlock payments and accounts.",
  invoiceProfileTitle: "Finish your business profile to create invoices.",
} as const

export const DEVELOPER_TOOL_COPY = {
  apiReference: "Browse endpoints and examples.",
  sdks: "Install official client libraries.",
  webhooks: "Receive real-time event notifications.",
  events: "Monitor API events and activity.",
  logs: "Monitor API activity and debug issues.",
  apiKeys: "Create and rotate API keys.",
} as const

export const AUTH_COPY = {
  signup: "Create your Easner Business account.",
  join: "Accept your team invitation.",
  joinInvalid: "This invitation link is invalid or incomplete.",
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
  registeredAddress: "Street address for invoices and statements.",
  publicInfo: "Add contact details shown to customers.",
  complianceTiers: "Start Tier 1 verification to unlock banking.",
  teamMembers: "Invite teammates and manage access.",
  recipients: "Add payees to send money faster.",
  customers: "Add contacts before you create invoices.",
  customerInvoices: "Open or create invoices for this contact.",
  customerSummary: "Review billing history with this customer.",
  communicationPrefs: "Choose which emails you receive.",
  invoiceEmailDelivery: "Confirm where customer invoice replies go.",
  invoicePaymentDefaults: "Choose payment options on new invoices.",
  invoiceNotifications: "Get notified when customers view or pay.",
  invoiceBranding: "Customize how invoices look to customers.",
} as const

export const VERIFICATION_SECTION_COPY = {
  complianceTiers: "Start Tier 1 verification to unlock banking.",
  approvedProvisioning:
    "Verification approved. Your deposit details are being set up and usually appear on Accounts within a few minutes.",
  accountsProvisioning:
    "Setting up your accounts and deposit details. This usually completes within a few minutes.",
  verificationOnHold:
    "Verification is on hold. Review the note below or contact support if you need help.",
} as const
