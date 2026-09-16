export { EmailNotificationService } from "./email-notification-service"
export { emailService } from "./email-service"
export { sendMail } from "./mailer"
export { emailAnchorOpenTag, shouldSkipSesClickTracking } from "./email-anchor"
export type { SendMailInput } from "./mailer-types"
export type { EmailProvider } from "./email-provider"
export {
  EMAIL_PROVIDER_SETTING_KEY,
  isEmailProviderCredentialsConfigured,
  isSesCredentialsConfigured,
  isSendGridCredentialsConfigured,
  parseEmailProvider,
} from "./email-provider"
export { clearEmailProviderCache } from "./resolve-email-provider"
export {
  resolvePersonalFromEmail,
  resolvePersonalFromName,
  resolveInvoiceFromEmailAddress,
  resolveInvoiceFromName,
  resolveReceiptFromEmailAddress,
  resolveBusinessFromName,
  resolveEmailReplyTo,
} from "./email-from"
export type {
  TransactionEmailData,
  WelcomeEmailData,
  VerificationEmailData,
  VerificationCutoverEmailData,
  OnlinePaymentsEmailData,
  TeamInviteEmailData,
  SecurityAlertEmailData,
  AccountRestrictionEmailData,
  AccountRestrictionOpsEmailData,
  WalletSendVelocityOpsEmailData,
  SendEmailResult,
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
  EASNER_BIMI_LOGO_URL,
} from "./email-theme"
export {
  parseSesNotificationMessage,
  parseSnsEnvelope,
  verifySnsSignature,
} from "./ses-sns"
