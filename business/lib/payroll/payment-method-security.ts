export function maskPayrollMethodDetails(
  type: "bank" | "mobile_money" | "stablecoin",
  details: Record<string, string>,
): Record<string, string> {
  const tail = (value: string | undefined) => value ? `•••• ${value.replace(/\s/g, "").slice(-4)}` : "••••"
  if (type === "bank") {
    return {
      bankName: details.bankName || "Bank account",
      account: tail(details.accountNumber),
      countryCode: details.countryCode || "",
      currency: details.currency || "",
    }
  }
  if (type === "mobile_money") {
    return {
      provider: details.provider || "Mobile money",
      phone: tail(details.phoneNumber),
      countryCode: details.countryCode || "",
      currency: details.currency || "",
    }
  }
  return {
    network: details.network || "Stablecoin",
    wallet: tail(details.walletAddress),
    asset: details.asset || details.currency || "",
  }
}
