/** Stable min-widths for invoice UI buttons so labels don't resize controls on state change. */
export const invoiceActionBtnClass = {
  view: "min-w-[9.75rem] justify-center",
  finalize: "min-w-[8.75rem] justify-center",
  email: "min-w-[11.5rem] justify-center",
  markSent: "min-w-[7.75rem] justify-center",
  download: "min-w-[10.25rem] justify-center",
  downloadReceipt: "min-w-[10.5rem] justify-center",
  flex: "flex-1 justify-center",
  import: "min-w-[8.5rem] justify-center",
  menuItem: "min-w-[11rem]",
} as const
