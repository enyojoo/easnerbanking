export { EmailNotificationService } from "./email-notification-service"
export { emailService } from "./email-service"
export type { TransactionEmailData, WelcomeEmailData, VerificationEmailData, TeamInviteEmailData, SecurityAlertEmailData } from "./email-types"
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
  EASNER_COMPANY_LEGAL_NAME,
  EASNER_COMPANY_ADDRESS,
} from "./email-theme"
