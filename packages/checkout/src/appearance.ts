/** Frozen Easner Stripe Elements appearance. Merchants cannot override this in v1. */
export const EASNER_ELEMENTS_APPEARANCE = {
  theme: "stripe",
  inputs: "spaced",
  labels: "above",
  variables: {
    colorPrimary: "#0080cc",
    colorBackground: "#faf9f6",
    colorText: "#121518",
    colorDanger: "#7a2e2e",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    fontSizeBase: "15px",
    borderRadius: "24px",
    buttonBorderRadius: "9999px",
    buttonExpressCheckoutBorderRadius: "9999px",
    spacingUnit: "4px",
  },
  rules: {
    ".AccordionItem": {
      borderRadius: "24px",
      borderColor: "hsl(40 27% 82%)",
      boxShadow: "none",
    },
    ".Block": {
      borderRadius: "24px",
      borderColor: "hsl(40 27% 82%)",
    },
    ".PickerItem": {
      borderRadius: "24px",
    },
    ".Dropdown": {
      borderRadius: "24px",
    },
    ".Input": {
      borderRadius: "9999px",
      borderColor: "hsl(40 27% 82%)",
    },
    ".Tab": {
      borderRadius: "9999px",
    },
    ".Label": {
      fontWeight: "500",
    },
  },
} as const
