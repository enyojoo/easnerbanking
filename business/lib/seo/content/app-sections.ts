import type { SeoPageContent } from "@/lib/seo/content/auth"

export const appSectionsSeo = {
  dashboard: {
    metadata: {
      title: "Dashboard | Easner Business Banking",
      description: "See balances and recent activity at a glance, including sends, deposits, and invoice payments across accounts – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Dashboard",
      subhead: "Balances and recent activity at a glance.",
      altText: "Easner Business dashboard",
    },
  },
  accounts: {
    metadata: {
      title: "Accounts | Easner Business Banking",
      description: "Hold balances and add money in USD, EUR, or stablecoins from multi-currency accounts in Easner Business – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Accounts",
      subhead: "Hold balances and add money in USD, EUR, or stablecoins.",
      altText: "Easner Business accounts",
    },
  },
  send: {
    metadata: {
      title: "Send | Easner Business Banking",
      description: "Send money from your balance to a saved payee with clear transfer and payout status tracking in Easner Business – secure enough for growing companies.",
    },
    hero: {
      h1: "Send Money",
      subhead: "Transfer from your balance to a payee.",
      altText: "Send money with Easner Business",
    },
  },
  sendConfirm: {
    metadata: {
      title: "Confirm Send | Easner Business Banking",
      description: "Check amount and recipient before you send, then confirm transfer details and complete your payout safely – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Confirm Send",
      subhead: "Review amount and recipient before you send.",
      altText: "Confirm a transfer",
    },
  },
  sendStatus: {
    metadata: {
      title: "Send Status | Easner Business Banking",
      description: "Track your transfer status in real time as sends and payouts progress from your Easner Business accounts – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Send Status",
      subhead: "Track your transfer progress.",
      altText: "Transfer status",
    },
  },
  sendMomoSetup: {
    metadata: {
      title: "Mobile Money Setup | Easner Business Banking",
      description: "Enter the number and network you'll pay from to set up mobile money details for payouts in Easner Business – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Mobile Money",
      subhead: "Enter the number and network you'll pay from.",
      altText: "Mobile money setup",
    },
  },
  invoices: {
    metadata: {
      title: "Invoices | Easner Business Banking",
      description: "Create invoices and track what customers owe you with billing and collections tools in Easner Business – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Invoices",
      subhead: "Create invoices and track what customers owe you.",
      altText: "Easner Business invoices",
    },
  },
  invoicesCreate: {
    metadata: {
      title: "Create Invoice | Easner Business Banking",
      description: "Bill a customer and choose how they can pay using line items, due dates, and flexible payment options here – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Create Invoice",
      subhead: "Bill a customer and choose how they can pay.",
      altText: "Create an invoice",
    },
  },
  invoicesImport: {
    metadata: {
      title: "Import Invoices | Easner Business Banking",
      description: "Upload a CSV to create draft invoices, import billing data, and finish setup in your invoicing workspace – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Import Invoices",
      subhead: "Upload a CSV to create draft invoices.",
      altText: "Import invoices",
    },
  },
  invoiceDetail: {
    metadata: {
      title: "Invoice Detail | Easner Business Banking",
      description: "Review invoice details, payment status, and customer actions to manage collections across Easner Business – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Invoice",
      subhead: "Review details and payment status.",
      altText: "Invoice detail",
    },
  },
  transactions: {
    metadata: {
      title: "Transactions | Easner Business Banking",
      description: "Review money in and out of your accounts by filtering sends, deposits, and invoice payments in history – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Transactions",
      subhead: "Review money in and out of your accounts.",
      altText: "Easner Business transactions",
    },
  },
  transactionDetail: {
    metadata: {
      title: "Transaction | Easner Business Banking",
      description: "See details for this transfer or deposit, including amount, status, and counterparties in your history – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Transaction",
      subhead: "Details for this transfer or deposit.",
      altText: "Transaction details",
    },
  },
  cards: {
    metadata: {
      title: "Cards | Easner Business Banking",
      description: "Spend from your balance with business cards and review spend for the selected period in Easner Business – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Cards",
      subhead: "Spend from your balance with business cards.",
      altText: "Easner Business cards",
    },
  },
  terminal: {
    metadata: {
      title: "Terminal | Easner Business Banking",
      description: "Take in-person stablecoin payments at your counter, charge customers, and confirm receipt with Terminal – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Terminal",
      subhead: "Take in-person stablecoin payments at your counter.",
      altText: "Easner Business terminal",
    },
  },
  qrPay: {
    metadata: {
      title: "QR Pay | Easner Business Banking",
      description: "Accept in-person payments with QR placards and manage stablecoin collections in your Easner Business workspace – built for modern finance teams and operators.",
    },
    hero: {
      h1: "QR Pay",
      subhead: "Accept in-person payments with QR placards.",
      altText: "Easner Business QR Pay",
    },
  },
  links: {
    metadata: {
      title: "Payment Links | Easner Business Banking",
      description: "Create and share payment links for card, bank, and stablecoin collections in Easner Business – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Payment links",
      subhead: "Share a link and collect payment without an invoice.",
      altText: "Easner Business payment links",
    },
  },
  linksCreate: {
    metadata: {
      title: "Create Placard | Easner Business Banking",
      description: "Set up a stablecoin placard for in-person collections in Easner Business – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Create Placard",
      subhead: "Set up a placard for in-person payments.",
      altText: "Create a payment link placard",
    },
  },
  checkout: {
    metadata: {
      title: "Website checkout | Easner Business Banking",
      description: "Connect your website with Easner Checkout – API keys, embed snippet, webhooks, and test mode in Easner Business.",
    },
    hero: {
      h1: "Website checkout",
      subhead: "Add card and bank payments to your site.",
      altText: "Easner Business website checkout",
    },
  },
  developers: {
    metadata: {
      title: "Developers | Easner Business Banking",
      description: "Connect Easner to your apps with APIs and webhooks, manage keys, monitor logs, and integrate payment workflows – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Developers",
      subhead: "Connect Easner to your apps with APIs and webhooks.",
      altText: "Easner Business developer tools",
    },
  },
  settings: {
    metadata: {
      title: "Settings | Easner Business Banking",
      description: "Manage your account, team, and billing, including profile, verification, and invoicing defaults in settings – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Settings",
      subhead: "Manage your account, team, and billing.",
      altText: "Easner Business settings",
    },
  },
  payroll: {
    metadata: {
      title: "Payroll | Easner Business Banking",
      description: "Pay your team on schedules you control while managing people, runs, and payout readiness in Payroll today – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Payroll",
      subhead: "Pay your team on schedules you control.",
      altText: "Easner Business payroll",
    },
  },
  payrollPeople: {
    metadata: {
      title: "Payroll People | Easner Business Banking",
      description: "Manage who you pay, view pay history, and check payout readiness for each person in your Payroll directory – built for modern finance teams and operators.",
    },
    hero: {
      h1: "People",
      subhead: "Manage who you pay and review payout readiness.",
      altText: "Payroll people",
    },
  },
  payrollPeopleNew: {
    metadata: {
      title: "Add Person | Easner Business Banking",
      description: "Add someone to payroll by capturing pay details and payout readiness for upcoming Easner Business runs – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Add Person",
      subhead: "Add someone to your payroll directory.",
      altText: "Add a payroll person",
    },
  },
  payrollPeopleImport: {
    metadata: {
      title: "Import People | Easner Business Banking",
      description: "Import people into payroll, upload team details, and prepare payout readiness for upcoming payroll runs – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Import People",
      subhead: "Upload team details into payroll.",
      altText: "Import payroll people",
    },
  },
  payrollPersonDetail: {
    metadata: {
      title: "Person Detail | Easner Business Banking",
      description: "View pay history and payout readiness while managing an individual's payroll details in Easner Business – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Person",
      subhead: "View pay history and payout readiness.",
      altText: "Payroll person detail",
    },
  },
  payrollPersonEdit: {
    metadata: {
      title: "Edit Person | Easner Business Banking",
      description: "Update payroll person details, edit pay information, and adjust payout readiness for each team member – designed for operators who move money globally.",
    },
    hero: {
      h1: "Edit Person",
      subhead: "Update pay details and payout readiness.",
      altText: "Edit payroll person",
    },
  },
  payrollSchedules: {
    metadata: {
      title: "Payroll Schedules | Easner Business Banking",
      description: "Manage who is paid on each schedule and review recurring payroll schedules across Easner Business Payroll – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Schedules",
      subhead: "Manage who is paid on each schedule.",
      altText: "Payroll schedules",
    },
  },
  payrollSchedulesNew: {
    metadata: {
      title: "New Schedule | Easner Business Banking",
      description: "Create a payroll schedule that defines who is paid and when for recurring team payouts in Easner Business – built for modern finance teams and operators.",
    },
    hero: {
      h1: "New Schedule",
      subhead: "Define who is paid and when.",
      altText: "Create a payroll schedule",
    },
  },
  payrollScheduleDetail: {
    metadata: {
      title: "Schedule Detail | Easner Business Banking",
      description: "Manage who is paid on this schedule and review recipients and timing for recurring payroll in Easner Business – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Schedule",
      subhead: "Manage who is paid on this schedule.",
      altText: "Payroll schedule detail",
    },
  },
  payrollScheduleEdit: {
    metadata: {
      title: "Edit Schedule | Easner Business Banking",
      description: "Update this payroll schedule by changing recipients and timing for recurring team payouts in Easner Business – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Edit Schedule",
      subhead: "Update recipients and timing.",
      altText: "Edit payroll schedule",
    },
  },
  payrollRuns: {
    metadata: {
      title: "Payroll Runs | Easner Business Banking",
      description: "Review payroll runs and payout status to track completed and upcoming team payments in Easner Business – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Runs",
      subhead: "Review payroll runs and payout status.",
      altText: "Payroll runs",
    },
  },
  payrollRunsNew: {
    metadata: {
      title: "New Run | Easner Business Banking",
      description: "Start a new payroll run, select people, confirm amounts, and pay your team from Easner Business Payroll – built for modern finance teams and operators.",
    },
    hero: {
      h1: "New Run",
      subhead: "Select people and confirm amounts.",
      altText: "Start a payroll run",
    },
  },
  payrollRunDetail: {
    metadata: {
      title: "Run Detail | Easner Business Banking",
      description: "Review this payroll run to check amounts, recipients, and payout status before you finalize in Easner Business – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Payroll Run",
      subhead: "Review amounts, recipients, and status.",
      altText: "Payroll run detail",
    },
  },
  payrollSettings: {
    metadata: {
      title: "Payroll Settings | Easner Business Banking",
      description: "Configure payroll defaults, set payout preferences, and define readiness rules for your team in Payroll – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Payroll Settings",
      subhead: "Configure payroll defaults and payout preferences.",
      altText: "Payroll settings",
    },
  },
  pay: {
    metadata: {
      title: "Pay | Easner Business Banking",
      description: "Charge customers and collect payments at the counter by running terminal sessions from Easner Business Pay – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Pay",
      subhead: "Charge customers and collect at the counter.",
      altText: "Easner Business Pay",
    },
  },
  payAsset: {
    metadata: {
      title: "Select Asset | Easner Business Banking",
      description: "Choose the asset for this charge by picking a currency or stablecoin before you start a Pay Terminal session – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Select Asset",
      subhead: "Choose the asset for this charge.",
      altText: "Select payment asset",
    },
  },
  payCharge: {
    metadata: {
      title: "Charge Session | Easner Business Banking",
      description: "Collect payment for this charge session and monitor status until the customer completes payment in Pay – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Charge",
      subhead: "Collect payment for this session.",
      altText: "Payment charge session",
    },
  },
  invoicePreview: {
    metadata: {
      title: "Invoice Preview | Easner Business Banking",
      description: "Preview how this invoice appears to customers and review layout plus payment options before you send it – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Invoice Preview",
      subhead: "Preview how this invoice appears to customers.",
      altText: "Invoice preview",
    },
  },
} as const satisfies Record<string, SeoPageContent>
