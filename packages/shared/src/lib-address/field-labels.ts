const STATE_LABELS: Record<string, string> = {
  state: "State",
  province: "Province",
  area: "Area",
  county: "County",
  department: "Department",
  district: "District",
  do_si: "Province",
  emirate: "Emirate",
  island: "Island",
  oblast: "Oblast",
  parish: "Parish",
  prefecture: "Prefecture",
  region: "Region",
}

const POSTAL_LABELS: Record<string, string> = {
  zip: "ZIP Code",
  postal: "Postcode",
  pin: "PIN",
  eircode: "Eircode",
}

export function subdivisionLabelFromType(type: string | undefined): string {
  if (!type) return "State / Province"
  return STATE_LABELS[type] ?? "State / Province"
}

export function postalLabelFromType(type: string | undefined): string {
  if (!type) return "Postal code"
  return POSTAL_LABELS[type] ?? "Postal code"
}
