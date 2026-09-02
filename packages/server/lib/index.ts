export { EmailNotificationService } from "./email-notification-service"
export { emailService } from "./email-service"
export type {
  TransactionEmailData,
  WelcomeEmailData,
  VerificationEmailData,
  OnlinePaymentsEmailData,
  TeamInviteEmailData,
  SecurityAlertEmailData,
  AccountRestrictionEmailData,
  AccountRestrictionOpsEmailData,
  WalletSendVelocityOpsEmailData,
} from "./email-types"
export type { EmailAudience } from "./email-audience"
export { getEmailAudienceProfile, resolveEmailAudienceFromData } from "./email-audience"
export {
  emailTemplatePreferenceCategory,
  shouldSendTemplatedEmail,
} from "./communication-email-guard"
export {
  generateSupabaseAuthEmailHtml,
  generateAuthOtpBlock,
  generateEmailLogoMarkup,
  generateBaseEmailTemplate,
  generateTransactionDetailsTable,
  type SupabaseAuthEmailVariant,
  type TransactionDetailRow,
} from "./email-generator"
export {
  customerGreetingParagraphHtml,
  easnerUserGreetingParagraphHtml,
  formatCustomerGreetingPlain,
  formatEasnerUserGreetingHtml,
  formatEasnerUserGreetingPlain,
} from "./email-greeting"
export {
  EASNER_COMPANY_LEGAL_NAME,
  EASNER_COMPANY_ADDRESS,
  EASNER_CONTACT_URL,
} from "./email-theme"
