/**
 * Text/select-style controls on settings cards: matches SelectTrigger surface
 * (transparent on card, light shadow, dark mode inset fill).
 */
export const SETTINGS_CONTROL_SURFACE =
  "shadow-xs bg-transparent dark:bg-input/30" as const

/** Standard single-line control height on settings cards (matches combobox/select triggers). */
export const SETTINGS_FIELD_HEIGHT_CLASS = "h-10" as const

/** Shared select trigger surface + height (add width utilities as needed). */
export const SETTINGS_SELECT_TRIGGER_BASE =
  `${SETTINGS_FIELD_HEIGHT_CLASS} data-[size=default]:h-10 ${SETTINGS_CONTROL_SURFACE}` as const

/** Single-line `<Input>` on settings cards. */
export const SETTINGS_INPUT_CLASS =
  `${SETTINGS_CONTROL_SURFACE} ${SETTINGS_FIELD_HEIGHT_CLASS}` as const

/** Full-width `<SelectTrigger>` on settings cards. */
export const SETTINGS_SELECT_TRIGGER_CLASS = `${SETTINGS_SELECT_TRIGGER_BASE} w-full` as const

/** Popover combobox / read-only country-style triggers on settings cards. */
export const SETTINGS_COMBOBOX_TRIGGER_CLASS =
  `${SETTINGS_FIELD_HEIGHT_CLASS} w-full justify-between font-normal px-3 ${SETTINGS_CONTROL_SURFACE}` as const
