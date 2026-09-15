/** Normalize Yellow Card / corridor bank names to local logo asset keys. */
export function normalizeBankLogoKey(label: string): string | undefined {
  const p = String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
  if (!p) return undefined

  if (p.includes("standard chartered")) return "stanchart"
  if (p.includes("standard bank")) return "standardbank"
  if (p.includes("african banking corporation") || p === "abc bank") return "abc"
  if (p.includes("commercial bank of africa")) return "ncba"
  if (p.includes("gulf african")) return "gulf"
  if (p.includes("bank of africa")) return "boa"
  if (/\bafrican bank\b/.test(p)) return "africanbank"
  if (p.includes("first national") || /\bfnb\b/.test(p)) return "fnb"
  if (p.includes("first atlantic")) return "firstatlantic"
  if (p.includes("first city") || p.includes("fcmb") || p === "fcmb") return "fcmb"
  if (p.includes("first bank") || p.includes("firstbank") || p.includes("fbnbank")) return "firstbank"
  if (p.includes("guaranty trust") || p.includes("gt bank") || p.includes("gtbank")) return "gtbank"
  if (p.includes("united bank") || /\buba\b/.test(p)) return "uba"
  if (p.includes("kenya commercial") || /\bkcb\b/.test(p)) return "kcb"
  if (p.includes("co-operative") || p.includes("cooperative") || p.includes("co operative")) return "coop"
  if (p.includes("investments and mortgages") || p.includes("i&m") || p.includes("i & m")) return "imbank"
  if (p.includes("national bank of kenya")) return "nbk"
  if (p.includes("k-rep") || p.includes("k rep") || p.includes("sidian")) return "sidian"
  if (p.includes("jamii bora") || p.includes("kingdom bank")) return "kingdom"
  if (p.includes("victoria commercial")) return "vcb"
  if (p.includes("consolidated bank of kenya")) return "conso"
  if (p.includes("consolidated bank ghana") || /\bcbg\b/.test(p)) return "cbg"
  if (p.includes("bank of baroda") || p.includes("baroda")) return "baroda"
  if (p.includes("bank of india")) return "bankofindia"
  if (p.includes("credit bank")) return "creditbank"
  if (p.includes("guardian bank") || p === "guardian bank") return "guardian"
  if (p.includes("paramount")) return "paramount"
  if (p.includes("middle east bank")) return "meb"
  if (p.includes("housing finance") || /\bhfc\b/.test(p)) return "hfc"
  if (p.includes("dubai bank") || p.includes("dib kenya") || p.includes("dib bank")) return "dib"
  if (p.includes("central bank of kenya")) return "cbk"
  if (p.includes("habib bank a.g") || p.includes("habib bank ag") || p.includes("hbz")) return "hbz"
  if (p.includes("habib bank")) return "hbl"
  if (p.includes("trans national") || p.includes("transnational") || p.includes("sbm bank")) return "sbm"
  if (p.includes("g money") || p.includes("gmoney") || p === "g-money") return "gmoney"
  if (p.includes("ghanapay")) return "ghanapay"
  if (p.includes("arb apex")) return "arbapex"
  if (p.includes("zeepay")) return "zeepay"
  if (p.includes("etranzact") || p.includes("pocketmoni")) return "etranzact"
  if (p.includes("sinapi")) return "sinapi"
  if (p.includes("affinity")) return "affinity"
  if (p.includes("services integrity")) return "sisl"
  if (p.includes("sasfin")) return "sasfin"
  if (p.includes("finbond")) return "finbond"
  if (p.includes("societe generale") || p.includes("société générale")) return "sg"
  if (p.includes("national investment")) return "nib"
  if (p.includes("access")) return "access"
  if (p.includes("zenith")) return "zenith"
  if (p.includes("stanbic")) return "stanbic"
  if (p.includes("ecobank")) return "ecobank"
  if (p.includes("absa") || p.includes("barclays")) return "absa"
  if (p.includes("equity")) return "equity"
  if (p.includes("capitec")) return "capitec"
  if (p.includes("nedbank")) return "nedbank"
  if (p.includes("fidelity")) return "fidelity"
  if (p.includes("opay")) return "opay"
  if (p.includes("palmpay")) return "palmpay"
  if (p.includes("kuda")) return "kuda"
  if (p.includes("moniepoint")) return "moniepoint"
  if (p.includes("ncba")) return "ncba"
  if (p.includes("gcb")) return "gcb"
  if (p.includes("cal bank") || p.startsWith("cal ")) return "cal"
  if (p.includes("wema")) return "wema"
  if (p.includes("sterling")) return "sterling"
  if (p.includes("union bank")) return "union"
  if (p.includes("polaris")) return "polaris"
  if (p.includes("jaiz")) return "jaiz"
  if (p.includes("citi")) return "citi"
  if (p.includes("investec")) return "investec"
  if (p.includes("discovery")) return "discovery"
  if (p.includes("tyme")) return "tyme"
  if (p.includes("old mutual")) return "oldmutual"
  if (p.includes("providus")) return "providus"
  if (p.includes("globus")) return "globus"
  if (p.includes("keystone")) return "keystone"
  if (p.includes("heritage")) return "heritage"
  if (p.includes("lotus")) return "lotus"
  if (p.includes("parallex")) return "parallex"
  if (p.includes("suntrust")) return "suntrust"
  if (p.includes("taj bank") || p === "taj bank") return "taj"
  if (p.includes("titan") && p.includes("paystack")) return "paystack"
  if (p.includes("titan")) return "titan"
  if (p.includes("premium") && p.includes("trust")) return "premiumtrust"
  if (p.includes("fairmoney")) return "fairmoney"
  if (p.includes("paga")) return "paga"
  if (p.includes("unity bank")) return "unity"
  if (p.includes("optimus")) return "optimus"
  if (p.includes("accion")) return "accion"
  if (p.includes("momo psb") || p.includes("mtn momo")) return "momopsb"
  if (p.includes("nomba")) return "nomba"
  if (p.includes("gomoney") || p === "go money") return "gomoney"
  if (p.includes("9japay") || p.includes("9ja pay")) return "ninejapay"
  if (p.includes("nownow") || p.includes("contec")) return "nownow"
  if (p.includes("mint") && p.includes("finex")) return "mintfinex"
  if (p.includes("alternative bank")) return "alternative"
  if (p.includes("bellbank") || p.includes("bell bank")) return "bellbank"
  if (p.includes("boost mfb") || p === "boost") return "boost"
  if (p.includes("bowen")) return "bowen"
  if (p.includes("net mfb")) return "netmfb"
  if (p.includes("nova mb") || p === "nova mb" || p.includes("nova merchant")) return "nova"
  if (p.includes("aku microfinance")) return "aku"
  if (p.includes("enterprise bank")) return "enterprise"
  if (p.includes("mainstreet")) return "mainstreet"
  if (p.includes("vfd")) return "vfd"
  if (p.includes("bidvest")) return "bidvest"
  if (p.includes("albaraka")) return "albaraka"
  if (p.includes("bank zero")) return "bankzero"
  if (p.includes("ubank") || p.includes("u bank")) return "ubank"
  if (p.includes("diamond trust") || p.includes("dtb")) return "dtb"
  if (p.includes("family bank")) return "familybank"
  if (p.includes("prime bank")) return "primebank"
  if (p.includes("agricultural development") || p.includes("adb bank") || p.startsWith("adb ")) return "adb"
  if (p.includes("republic bank")) return "republic"
  if (p.includes("universal merchant") || p.includes("umb ")) return "umb"
  if (p.includes("prudential")) return "prudential"
  if (p.includes("omni")) return "omni"
  return undefined
}

const BANK_LOGO_KEYS = new Set([
  "abc",
  "absa",
  "access",
  "accion",
  "adb",
  "affinity",
  "africanbank",
  "albaraka",
  "alternative",
  "arbapex",
  "bankofindia",
  "bankzero",
  "baroda",
  "bellbank",
  "bidvest",
  "boa",
  "bowen",
  "cal",
  "capitec",
  "cbg",
  "cbk",
  "citi",
  "conso",
  "coop",
  "creditbank",
  "dib",
  "discovery",
  "dtb",
  "ecobank",
  "equity",
  "etranzact",
  "fairmoney",
  "familybank",
  "fcmb",
  "fidelity",
  "finbond",
  "firstatlantic",
  "firstbank",
  "fnb",
  "gcb",
  "ghanapay",
  "globus",
  "gmoney",
  "gomoney",
  "gtbank",
  "guardian",
  "gulf",
  "hbl",
  "hbz",
  "heritage",
  "hfc",
  "imbank",
  "investec",
  "jaiz",
  "kcb",
  "keystone",
  "kingdom",
  "kuda",
  "lotus",
  "meb",
  "momopsb",
  "moniepoint",
  "nbk",
  "ncba",
  "nedbank",
  "netmfb",
  "nib",
  "ninejapay",
  "nomba",
  "nova",
  "oldmutual",
  "omni",
  "opay",
  "optimus",
  "paga",
  "palmpay",
  "parallex",
  "paramount",
  "paystack",
  "polaris",
  "premiumtrust",
  "primebank",
  "providus",
  "prudential",
  "republic",
  "sasfin",
  "sbm",
  "sg",
  "sidian",
  "sinapi",
  "sisl",
  "stanbic",
  "stanchart",
  "standardbank",
  "sterling",
  "suntrust",
  "taj",
  "titan",
  "tyme",
  "uba",
  "ubank",
  "umb",
  "union",
  "unity",
  "vcb",
  "vfd",
  "wema",
  "zeepay",
  "zenith",
])

export function hasBankLogo(label: string): boolean {
  const key = normalizeBankLogoKey(label)
  return Boolean(key && BANK_LOGO_KEYS.has(key))
}

export function getBankLogoPublicUrl(label: string): string | undefined {
  const key = normalizeBankLogoKey(label)
  if (!key || !BANK_LOGO_KEYS.has(key)) return undefined
  return `/banks/${key}.png`
}

export function listBankLogoPublicUrls(): string[] {
  return [...BANK_LOGO_KEYS].map((key) => `/banks/${key}.png`)
}

export { BANK_LOGO_KEYS }
