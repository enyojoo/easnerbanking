import type { BusinessPageMetadata } from "@/lib/seo/metadata"

export interface SeoPageContent {
  metadata: BusinessPageMetadata
  hero: {
    h1: string
    subhead: string
    altText: string
  }
}

export const authSeo = {
  login: {
    metadata: {
      title: "Sign In | Easner Business Banking",
      description: "Sign in to Easner Business to access multi-currency accounts, invoicing, cards, and global payouts from one place – designed for modern finance teams.",
      keywords: ["business banking login", "easner business", "sign in"],
    },
    hero: {
      h1: "Sign In",
      subhead: "Access your Easner Business account.",
      altText: "Sign in to Easner Business",
    },
  },
  signup: {
    metadata: {
      title: "Sign Up | Easner Business Banking",
      description: "Create your Easner Business account to open multi-currency balances, send invoices, and manage payouts – built for modern finance teams and operators.",
      keywords: ["business account signup", "easner business", "create account"],
    },
    hero: {
      h1: "Sign Up",
      subhead: "Open an Easner Business account.",
      altText: "Sign up for Easner Business",
    },
  },
  forgotPassword: {
    metadata: {
      title: "Forgot Password | Easner Business Banking",
      description: "Reset your Easner Business password by entering your email for a secure recovery link to your dashboard – built for modern finance teams and operators.",
      keywords: ["forgot password", "account recovery", "easner business"],
    },
    hero: {
      h1: "Forgot Password",
      subhead: "Get a secure link to reset your password.",
      altText: "Reset your Easner Business password",
    },
  },
  resetPassword: {
    metadata: {
      title: "Reset Password | Easner Business Banking",
      description: "Choose a new password for your Easner Business account and continue managing accounts, invoices, and payouts – built for modern finance teams and operators.",
      keywords: ["reset password", "new password", "easner business"],
    },
    hero: {
      h1: "Reset Password",
      subhead: "Choose a new password for your account.",
      altText: "Set a new Easner Business password",
    },
  },
  join: {
    metadata: {
      title: "Join Team | Easner Business Banking",
      description: "Accept your Easner Business team invitation and join your organization's workspace for accounts and payouts – built for modern finance teams and operators.",
      keywords: ["team invite", "join business", "easner business"],
    },
    hero: {
      h1: "Join Team",
      subhead: "Accept your invitation to an Easner Business workspace.",
      altText: "Join an Easner Business team",
    },
  },
  joinInvite: {
    metadata: {
      title: "Join Team | Easner Business Banking",
      description: "Accept your Easner Business team invitation and join your organization's workspace for accounts and payouts – built for modern finance teams and operators.",
      keywords: ["team invite", "join business", "easner business"],
    },
    hero: {
      h1: "Join Team",
      subhead: "Accept your invitation to an Easner Business workspace.",
      altText: "Join an Easner Business team",
    },
  },
  onboardingComplete: {
    metadata: {
      title: "Onboarding Complete | Easner Business Banking",
      description: "Your banking onboarding step is complete. Return to Easner Business to finish verification and unlock accounts – built for modern finance teams and operators.",
    },
    hero: {
      h1: "Onboarding Complete",
      subhead: "Return to Easner Business to continue setup.",
      altText: "Banking onboarding complete",
    },
  },
} as const satisfies Record<string, SeoPageContent>
