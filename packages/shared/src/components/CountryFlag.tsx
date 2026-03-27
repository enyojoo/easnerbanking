import { IconEurope } from "nucleo-flags"
import type { IconProps } from "nucleo-flags"
import { cn } from "../utils/cn"
import { countryFlagIconByIso } from "./country-flag-icons"

export type CountryFlagProps = IconProps & {
  /** ISO 3166-1 alpha-2 */
  code: string
}

export function CountryFlag({ code, size = 24, className, title, ...rest }: CountryFlagProps) {
  const upper = code.trim().toUpperCase()
  const Icon = countryFlagIconByIso[upper]
  if (!Icon) {
    return (
      <span
        className={cn("inline-block shrink-0 rounded-sm bg-muted", className)}
        style={{
          width: typeof size === "number" ? size : Number.parseInt(String(size), 10) || 24,
          height: typeof size === "number" ? Math.round(size * 0.75) : Math.round((Number.parseInt(String(size), 10) || 24) * 0.75),
        }}
        title={title ?? upper}
        role="img"
        aria-label={title ?? upper}
      />
    )
  }
  return (
    <Icon
      size={size}
      className={cn("shrink-0 overflow-hidden rounded-sm", className)}
      title={title}
      {...rest}
    />
  )
}

/** ISO 4217 → primary country (alpha-2) for flag display */
const currencyToCountryCode: Record<string, string> = {
  AED: "AE",
  AFN: "AF",
  ALL: "AL",
  AMD: "AM",
  ANG: "CW",
  AOA: "AO",
  ARS: "AR",
  AUD: "AU",
  AWG: "AW",
  AZN: "AZ",
  BAM: "BA",
  BBD: "BB",
  BDT: "BD",
  BGN: "BG",
  BHD: "BH",
  BIF: "BI",
  BMD: "BM",
  BND: "BN",
  BOB: "BO",
  BRL: "BR",
  BSD: "BS",
  BWP: "BW",
  BYN: "BY",
  BZD: "BZ",
  CAD: "CA",
  CDF: "CD",
  CHF: "CH",
  CLP: "CL",
  CNY: "CN",
  COP: "CO",
  CRC: "CR",
  CUP: "CU",
  CVE: "CV",
  CZK: "CZ",
  DJF: "DJ",
  DKK: "DK",
  DOP: "DO",
  DZD: "DZ",
  EGP: "EG",
  ETB: "ET",
  FJD: "FJ",
  FKP: "FK",
  GBP: "GB",
  GEL: "GE",
  GHS: "GH",
  GIP: "GI",
  GMD: "GM",
  GNF: "GN",
  GTQ: "GT",
  GYD: "GY",
  HKD: "HK",
  HNL: "HN",
  HTG: "HT",
  HUF: "HU",
  IDR: "ID",
  ILS: "IL",
  INR: "IN",
  IQD: "IQ",
  IRR: "IR",
  ISK: "IS",
  JMD: "JM",
  JOD: "JO",
  JPY: "JP",
  KES: "KE",
  KGS: "KG",
  KHR: "KH",
  KMF: "KM",
  KRW: "KR",
  KWD: "KW",
  KYD: "KY",
  KZT: "KZ",
  LAK: "LA",
  LBP: "LB",
  LKR: "LK",
  LRD: "LR",
  LSL: "LS",
  LYD: "LY",
  MAD: "MA",
  MDL: "MD",
  MGA: "MG",
  MKD: "MK",
  MMK: "MM",
  MNT: "MN",
  MOP: "MO",
  MRU: "MR",
  MUR: "MU",
  MVR: "MV",
  MWK: "MW",
  MXN: "MX",
  MYR: "MY",
  MZN: "MZ",
  NAD: "NA",
  NGN: "NG",
  NIO: "NI",
  NOK: "NO",
  NPR: "NP",
  NZD: "NZ",
  OMR: "OM",
  PAB: "PA",
  PEN: "PE",
  PGK: "PG",
  PHP: "PH",
  PKR: "PK",
  PLN: "PL",
  PYG: "PY",
  QAR: "QA",
  RON: "RO",
  RSD: "RS",
  RUB: "RU",
  RWF: "RW",
  SAR: "SA",
  SBD: "SB",
  SCR: "SC",
  SDG: "SD",
  SEK: "SE",
  SGD: "SG",
  SHP: "SH",
  SLE: "SL",
  SOS: "SO",
  SRD: "SR",
  SSP: "SS",
  STN: "ST",
  SVC: "SV",
  SYP: "SY",
  SZL: "SZ",
  THB: "TH",
  TJS: "TJ",
  TMT: "TM",
  TND: "TN",
  TOP: "TO",
  TRY: "TR",
  TTD: "TT",
  TWD: "TW",
  TZS: "TZ",
  UAH: "UA",
  UGX: "UG",
  USD: "US",
  UYU: "UY",
  UZS: "UZ",
  VES: "VE",
  VND: "VN",
  VUV: "VU",
  WST: "WS",
  XAF: "CM",
  XCD: "AG",
  XOF: "SN",
  XPF: "PF",
  YER: "YE",
  ZAR: "ZA",
  ZMW: "ZM",
  ZWG: "ZW",
}

export type CurrencyFlagProps = Omit<IconProps, "ref"> & {
  currency: string
  /** When set, used if currency is not mapped to a nucleo flag */
  fallbackSvg?: string | null
}

export function CurrencyFlag({ currency, size = 24, className, fallbackSvg, title, ...rest }: CurrencyFlagProps) {
  const code = currency.trim().toUpperCase()
  if (code === "EUR") {
    return (
      <IconEurope
        size={size}
        className={cn("shrink-0 overflow-hidden rounded-sm", className)}
        title={title ?? "EUR"}
        {...rest}
      />
    )
  }
  const iso = currencyToCountryCode[code]
  if (iso && countryFlagIconByIso[iso]) {
    return (
      <CountryFlag code={iso} size={size} className={className} title={title ?? code} {...rest} />
    )
  }
  if (fallbackSvg) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center [&_svg]:size-full", className)}
        style={{
          width: typeof size === "number" ? size : Number.parseInt(String(size), 10) || 24,
          height: typeof size === "number" ? Math.round(size * 0.75) : Math.round((Number.parseInt(String(size), 10) || 24) * 0.75),
        }}
        title={title ?? code}
        dangerouslySetInnerHTML={{ __html: fallbackSvg }}
      />
    )
  }
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-sm bg-muted text-[10px] font-medium text-muted-foreground", className)}
      style={{
        width: typeof size === "number" ? size : Number.parseInt(String(size), 10) || 24,
        height: typeof size === "number" ? Math.round(size * 0.75) : Math.round((Number.parseInt(String(size), 10) || 24) * 0.75),
      }}
      title={title ?? code}
    >
      {code.slice(0, 2)}
    </span>
  )
}
