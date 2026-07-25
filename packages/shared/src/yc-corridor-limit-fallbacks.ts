import type { PayoutRail } from "./payout-corridor"

export type YcCorridorLimitFallback = {
  min?: number
  max?: number
}

/** Corridor key: `CC:CUR:rail` */
export function ycCorridorLimitKey(
  country: string,
  currency: string,
  rail: PayoutRail,
): string {
  return `${country.trim().toUpperCase()}:${currency.trim().toUpperCase()}:${rail}`
}

/**
 * YC send (withdraw) limits when channel JSON omits min/max.
 * Sourced from YC `/channels` sandbox sync + product floors for LATAM.
 */
export const YC_SEND_LIMITS_FALLBACK: Record<string, YcCorridorLimitFallback> = {
  "AR:ARS:bank_transfer": { min: 5000, max: 8_000_000 },
  "BF:XOF:mobile_money": { min: 500, max: 1_500_000 },
  "BJ:XOF:mobile_money": { min: 500, max: 1_500_000 },
  "BR:BRL:bank_transfer": { min: 50, max: 8_000_000 },
  "BW:BWP:bank_transfer": { min: 150, max: 1_000_000 },
  "BW:BWP:mobile_money": { min: 150, max: 9500 },
  "CD:CDF:bank_transfer": { min: 10_000 },
  "CI:XOF:bank_transfer": { min: 500 },
  "CI:XOF:mobile_money": { min: 500, max: 1_500_000 },
  "CM:XAF:bank_transfer": { min: 1000, max: 1_000_000 },
  "CM:XAF:mobile_money": { min: 1000 },
  "CG:XAF:bank_transfer": { min: 1000, max: 50_000_000 },
  "CO:COP:bank_transfer": { min: 20_000, max: 8_000_000 },
  "GH:GHS:mobile_money": { min: 20 },
  "KE:KES:bank_transfer": { min: 500, max: 999_999 },
  "KE:KES:mobile_money": { min: 150, max: 250_000 },
  "MW:MWK:bank_transfer": { min: 2000, max: 20_000_000 },
  "MW:MWK:mobile_money": { min: 2000, max: 40_000_000 },
  "MX:MXN:bank_transfer": { min: 100, max: 800_000 },
  "NG:NGN:bank_transfer": { min: 2000, max: 30_000_000 },
  "NG:NGN:mobile_money": { min: 2000, max: 30_000_000 },
  "PE:PEN:bank_transfer": { min: 20, max: 8_000_000 },
  "RW:RWF:bank_transfer": { min: 1500, max: 10_000_000 },
  "RW:RWF:mobile_money": { min: 1500, max: 10_000_000 },
  "SN:XOF:bank_transfer": { min: 6500 },
  "SN:XOF:mobile_money": { min: 500 },
  "TG:XOF:mobile_money": { min: 500 },
  "TZ:TZS:bank_transfer": { min: 2500, max: 150_000_000 },
  "TZ:TZS:mobile_money": { min: 2500, max: 10_000_000 },
  "UG:UGX:bank_transfer": { min: 15_000, max: 36_000_000 },
  "UG:UGX:mobile_money": { min: 15_000, max: 3_000_000 },
  "ZA:ZAR:bank_transfer": { min: 200, max: 500_000 },
  "ZM:ZMW:bank_transfer": { min: 100, max: 15_000_000 },
  "ZM:ZMW:mobile_money": { min: 100, max: 500_000 },
  /** Grid + major-currency corridors — channel JSON often omits limits */
  "AE:AED:bank_transfer": { min: 20 },
  "CA:CAD:bank_transfer": { min: 10 },
  "CN:CNY:bank_transfer": { min: 50 },
  "EG:EGP:bank_transfer": { min: 100 },
  "EG:EGP:mobile_money": { min: 100 },
  "GB:GBP:bank_transfer": { min: 10, max: 1_000_000 },
  "GH:GHS:bank_transfer": { min: 20, max: 500_000 },
  "ID:IDR:bank_transfer": { min: 10_000 },
  "IN:INR:bank_transfer": { min: 100 },
  "PH:PHP:bank_transfer": { min: 100 },
  "TH:THB:bank_transfer": { min: 50 },
  /** Major currencies — YC channel JSON often omits limits */
  "FR:EUR:bank_transfer": { min: 10 },
  "US:USD:bank_transfer": { min: 20 },
  "EC:USD:bank_transfer": { min: 20 },
  "KH:USD:bank_transfer": { min: 20 },
  "LK:USD:bank_transfer": { min: 20 },
  "LK:LKR:bank_transfer": { min: 500 },
}

/**
 * YC receive (deposit) limits when channel JSON omits min/max.
 */
export const YC_RECEIVE_LIMITS_FALLBACK: Record<string, YcCorridorLimitFallback> = {
  "AR:ARS:bank_transfer": { min: 5000, max: 8_000_000 },
  "BF:XOF:mobile_money": { min: 500, max: 1_500_000 },
  "BJ:XOF:mobile_money": { min: 500, max: 1_500_000 },
  "BR:BRL:bank_transfer": { min: 50, max: 8_000_000 },
  "BW:BWP:bank_transfer": { min: 150 },
  "BW:BWP:mobile_money": { min: 150, max: 9500 },
  "CD:CDF:bank_transfer": { min: 10_000 },
  "CD:CDF:mobile_money": { min: 10_000 },
  "CD:USD:bank_transfer": { min: 5.5 },
  "CI:XOF:bank_transfer": { min: 500 },
  "CI:XOF:mobile_money": { min: 500, max: 1_500_000 },
  "CM:XAF:bank_transfer": { min: 1000 },
  "CM:XAF:mobile_money": { min: 1000, max: 1_000_000 },
  "CG:XAF:bank_transfer": { min: 1000, max: 50_000_000 },
  "CO:COP:bank_transfer": { min: 20_000, max: 8_000_000 },
  "GA:XAF:bank_transfer": { min: 1000 },
  "GH:GHS:bank_transfer": { min: 20, max: 500_000 },
  "KE:KES:bank_transfer": { min: 300 },
  "KE:KES:mobile_money": { min: 150, max: 250_000 },
  "MW:MWK:bank_transfer": { min: 2000, max: 20_000_000 },
  "MW:MWK:mobile_money": { min: 2000, max: 40_000_000 },
  "MX:MXN:bank_transfer": { min: 100, max: 800_000 },
  "NG:NGN:bank_transfer": { min: 2500, max: 5_000_000 },
  "NG:NGN:mobile_money": { min: 2500, max: 30_000_000 },
  "PE:PEN:bank_transfer": { min: 20, max: 8_000_000 },
  "RW:RWF:bank_transfer": { min: 100, max: 10_000_000 },
  "RW:RWF:mobile_money": { min: 1500, max: 10_000_000 },
  "SN:XOF:bank_transfer": { min: 500 },
  "SN:XOF:mobile_money": { min: 500 },
  "TG:XOF:mobile_money": { min: 500 },
  "TZ:TZS:bank_transfer": { min: 2500, max: 150_000_000 },
  "TZ:TZS:mobile_money": { min: 2500, max: 10_000_000 },
  "UG:UGX:bank_transfer": { min: 15_000, max: 36_000_000 },
  "UG:UGX:mobile_money": { min: 15_000, max: 3_000_000 },
  "US:USD:bank_transfer": { min: 20 },
  "ZA:ZAR:bank_transfer": { min: 100, max: 500_000 },
  "ZM:ZMW:bank_transfer": { min: 100, max: 15_000_000 },
  "ZM:ZMW:mobile_money": { min: 100, max: 100_000 },
  /** Grid + major-currency corridors — channel JSON often omits limits */
  "AE:AED:bank_transfer": { min: 20 },
  "CA:CAD:bank_transfer": { min: 10 },
  "CN:CNY:bank_transfer": { min: 50 },
  "EG:EGP:bank_transfer": { min: 100 },
  "EG:EGP:mobile_money": { min: 100 },
  "GB:GBP:bank_transfer": { min: 10, max: 1_000_000 },
  "ID:IDR:bank_transfer": { min: 10_000 },
  "IN:INR:bank_transfer": { min: 100 },
  "PH:PHP:bank_transfer": { min: 100 },
  "TH:THB:bank_transfer": { min: 50 },
  /** Major currencies — YC channel JSON often omits limits */
  "FR:EUR:bank_transfer": { min: 10 },
  "EC:USD:bank_transfer": { min: 20 },
  "KH:USD:bank_transfer": { min: 20 },
  "LK:USD:bank_transfer": { min: 20 },
  "LK:LKR:bank_transfer": { min: 500 },
}
