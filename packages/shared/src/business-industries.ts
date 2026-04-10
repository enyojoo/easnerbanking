/**
 * Easner-only business industry catalog. Stored in `businesses.business_type` as stable `id` strings (not Noah / NAICS).
 */

export type BusinessIndustryItem = { id: string; label: string }

export type BusinessIndustryGroup = {
  id: string
  label: string
  industries: BusinessIndustryItem[]
}

export const BUSINESS_INDUSTRY_GROUPS: BusinessIndustryGroup[] = [
  {
    id: "technology_it",
    label: "Technology & IT",
    industries: [
      { id: "software_saas", label: "Software / SaaS" },
      { id: "it_cloud_services", label: "IT & cloud services" },
      { id: "cybersecurity", label: "Cybersecurity" },
      { id: "hardware_electronics", label: "Hardware & electronics" },
      { id: "telecoms", label: "Telecommunications" },
      { id: "ai_data_analytics", label: "AI & data analytics" },
      { id: "gaming_digital", label: "Gaming & digital media" },
      { id: "internet_marketplace", label: "Internet platforms & marketplaces" },
      { id: "semiconductor", label: "Semiconductor" },
      { id: "technology_consulting", label: "Technology consulting" },
    ],
  },
  {
    id: "professional_business",
    label: "Professional & business services",
    industries: [
      { id: "management_consulting", label: "Management consulting" },
      { id: "legal_services", label: "Legal services" },
      { id: "accounting_audit", label: "Accounting & audit" },
      { id: "architecture_engineering", label: "Architecture & engineering" },
      { id: "design_creative_services", label: "Design & creative services" },
      { id: "hr_recruitment", label: "HR & recruitment" },
      { id: "marketing_pr", label: "Marketing & PR agencies" },
      { id: "business_support", label: "Business support & outsourcing" },
      { id: "research_development", label: "Research & development services" },
    ],
  },
  {
    id: "retail_ecommerce",
    label: "Retail & e-commerce",
    industries: [
      { id: "retail_bricks", label: "Retail (brick & mortar)" },
      { id: "ecommerce", label: "E-commerce" },
      { id: "wholesale_trade", label: "Wholesale trade" },
      { id: "consumer_goods", label: "Consumer goods" },
      { id: "fashion_apparel", label: "Fashion & apparel" },
      { id: "luxury_goods", label: "Luxury goods" },
      { id: "automotive_dealer", label: "Automotive (dealers & retail)" },
    ],
  },
  {
    id: "finance_insurance",
    label: "Finance & insurance",
    industries: [
      { id: "banking_lending", label: "Banking & lending" },
      { id: "payments_fintech", label: "Payments & fintech" },
      { id: "investment_asset_mgmt", label: "Investment & asset management" },
      { id: "insurance", label: "Insurance" },
      { id: "crypto_digital_assets", label: "Crypto & digital assets" },
      { id: "accounting_fintech", label: "Accounting software & fintech tools" },
    ],
  },
  {
    id: "healthcare",
    label: "Healthcare & life sciences",
    industries: [
      { id: "hospitals_clinics", label: "Hospitals & clinics" },
      { id: "pharma_biotech", label: "Pharmaceuticals & biotech" },
      { id: "medical_devices", label: "Medical devices" },
      { id: "health_tech", label: "Health tech & telehealth" },
      { id: "dental_optical", label: "Dental & optical care" },
      { id: "mental_health", label: "Mental health services" },
      { id: "veterinary", label: "Veterinary services" },
    ],
  },
  {
    id: "real_estate_construction",
    label: "Real estate & construction",
    industries: [
      { id: "real_estate_development", label: "Real estate development" },
      { id: "property_management", label: "Property management" },
      { id: "construction", label: "Construction" },
      { id: "civil_engineering", label: "Civil engineering & infrastructure" },
      { id: "interiors_fitout", label: "Interiors & fit-out" },
    ],
  },
  {
    id: "hospitality_travel",
    label: "Hospitality, food & travel",
    industries: [
      { id: "hotels_accommodation", label: "Hotels & accommodation" },
      { id: "restaurants_food", label: "Restaurants & food service" },
      { id: "catering", label: "Catering" },
      { id: "travel_tourism", label: "Travel & tourism" },
      { id: "events_entertainment_venues", label: "Events & entertainment venues" },
      { id: "fitness_wellness", label: "Fitness & wellness" },
    ],
  },
  {
    id: "manufacturing_logistics",
    label: "Manufacturing & logistics",
    industries: [
      { id: "manufacturing_general", label: "Manufacturing (general)" },
      { id: "automotive_manufacturing", label: "Automotive manufacturing" },
      { id: "food_beverage_production", label: "Food & beverage production" },
      { id: "chemicals_materials", label: "Chemicals & materials" },
      { id: "logistics_freight", label: "Logistics & freight" },
      { id: "warehousing_3pl", label: "Warehousing & 3PL" },
      { id: "aviation_maritime", label: "Aviation & maritime services" },
    ],
  },
  {
    id: "media_marketing_entertainment",
    label: "Media, marketing & entertainment",
    industries: [
      { id: "advertising_media_buying", label: "Advertising & media buying" },
      { id: "broadcasting_streaming", label: "Film, TV & streaming" },
      { id: "publishing", label: "Publishing" },
      { id: "music_entertainment", label: "Music & live entertainment" },
      { id: "sports_recreation", label: "Sports & recreation" },
    ],
  },
  {
    id: "education_nonprofit",
    label: "Education & nonprofit",
    industries: [
      { id: "k12_education", label: "K–12 education" },
      { id: "higher_education", label: "Higher education" },
      { id: "vocational_training", label: "Vocational & professional training" },
      { id: "nonprofit_ngo", label: "Nonprofit & NGO" },
      { id: "associations_membership", label: "Associations & membership orgs" },
    ],
  },
  {
    id: "agriculture_energy",
    label: "Agriculture & energy",
    industries: [
      { id: "agriculture_farming", label: "Agriculture & farming" },
      { id: "food_processing", label: "Food processing" },
      { id: "forestry_mining", label: "Forestry & mining" },
      { id: "oil_gas_energy", label: "Oil, gas & energy" },
      { id: "renewables", label: "Renewable energy" },
      { id: "utilities", label: "Utilities" },
    ],
  },
  {
    id: "other",
    label: "Other",
    industries: [{ id: "other_not_mentioned", label: "Other / not mentioned" }],
  },
]

const INDUSTRY_BY_ID = new Map<string, BusinessIndustryItem & { groupLabel: string }>()

for (const g of BUSINESS_INDUSTRY_GROUPS) {
  for (const ind of g.industries) {
    INDUSTRY_BY_ID.set(ind.id, { ...ind, groupLabel: g.label })
  }
}

export function getAllIndustriesFlat(): (BusinessIndustryItem & { groupId: string; groupLabel: string })[] {
  const out: (BusinessIndustryItem & { groupId: string; groupLabel: string })[] = []
  for (const g of BUSINESS_INDUSTRY_GROUPS) {
    for (const ind of g.industries) {
      out.push({ ...ind, groupId: g.id, groupLabel: g.label })
    }
  }
  return out
}

export function getIndustryById(id: string | null | undefined): (BusinessIndustryItem & { groupLabel: string }) | null {
  if (!id || typeof id !== "string") return null
  return INDUSTRY_BY_ID.get(id.trim()) ?? null
}

export function isValidIndustryId(id: string | null | undefined): boolean {
  if (id == null || typeof id !== "string") return false
  const t = id.trim()
  if (!t) return false
  return INDUSTRY_BY_ID.has(t)
}

export function getIndustryLabelForProfileValue(value: string | null | undefined): string | null {
  const row = getIndustryById(value)
  return row?.label ?? null
}
