export { EmailNotificationService } from "./email-notification-service"
export { emailService } from "./email-service"
export type { TransactionEmailData, WelcomeEmailData, VerificationEmailData, TeamInviteEmailData, SecurityAlertEmailData } from "./email-types"
export type { EmailAudience } from "./email-audience"
export { getEmailAudienceProfile, resolveEmailAudienceFromData } from "./email-audience"
export {
  emailTemplatePreferenceCategory,
  shouldSendTemplatedEmail,
} from "./communication-email-guard"
