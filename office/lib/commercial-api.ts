import { officeFetch } from "@/lib/api-client"
import type {
  CommercialMetrics,
  LimitPolicy,
  PricingPlan,
  PricingRule,
  PromoRule,
  RolloutControl,
  UserSubscription,
  PricingEngineHealth,
  ProviderFeeSchedule,
  CreateProviderFeeSchedulePayload,
} from "@/lib/types/commercial"

async function asJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || "Request failed")
  }
  return data
}

export const commercialApi = {
  async listPlans(): Promise<PricingPlan[]> {
    const res = await officeFetch("/api/admin/commercial/plans")
    const data = await asJson<{ plans?: PricingPlan[] }>(res)
    return data.plans ?? []
  },
  async createPlan(payload: {
    code: string
    name: string
    planType?: string
    isActive?: boolean
    metadata?: Record<string, unknown>
  }): Promise<PricingPlan> {
    const res = await officeFetch("/api/admin/commercial/plans", {
      method: "POST",
      body: JSON.stringify(payload),
    })
    const data = await asJson<{ plan: PricingPlan }>(res)
    return data.plan
  },
  async listRules(): Promise<PricingRule[]> {
    const res = await officeFetch("/api/admin/commercial/rules")
    const data = await asJson<{ rules?: PricingRule[] }>(res)
    return data.rules ?? []
  },
  async createRule(payload: Record<string, unknown>): Promise<PricingRule> {
    const res = await officeFetch("/api/admin/commercial/rules", {
      method: "POST",
      body: JSON.stringify(payload),
    })
    const data = await asJson<{ rule: PricingRule }>(res)
    return data.rule
  },
  async listLimits(): Promise<LimitPolicy[]> {
    const res = await officeFetch("/api/admin/commercial/limits")
    const data = await asJson<{ limits?: LimitPolicy[] }>(res)
    return data.limits ?? []
  },
  async createLimit(payload: Record<string, unknown>): Promise<LimitPolicy> {
    const res = await officeFetch("/api/admin/commercial/limits", {
      method: "POST",
      body: JSON.stringify(payload),
    })
    const data = await asJson<{ policy: LimitPolicy }>(res)
    return data.policy
  },
  async listSubscriptions(): Promise<UserSubscription[]> {
    const res = await officeFetch("/api/admin/commercial/subscriptions")
    const data = await asJson<{ subscriptions?: UserSubscription[] }>(res)
    return data.subscriptions ?? []
  },
  async createSubscription(payload: {
    userId: string
    businessId?: string
    planId: string
    scope?: string
    startsAt?: string
    endsAt?: string | null
    freePayoutsPerPeriod?: number
    fxMarkupDiscountBps?: number
    prioritySupport?: boolean
    rateLockSeconds?: number
    batchPayoutAccess?: boolean
    apiAccess?: boolean
    approvalWorkflowsEnabled?: boolean
  }): Promise<UserSubscription> {
    const res = await officeFetch("/api/admin/commercial/subscriptions", {
      method: "POST",
      body: JSON.stringify(payload),
    })
    const data = await asJson<{ subscription: UserSubscription }>(res)
    return data.subscription
  },
  async getMetrics(): Promise<CommercialMetrics> {
    const res = await officeFetch("/api/admin/commercial/metrics")
    return asJson<CommercialMetrics>(res)
  },
  async replayFailedWebhooks(limit = 25): Promise<{ ok: boolean; replayed: number; failed: number }> {
    const res = await officeFetch("/api/admin/webhooks/replay-failed", {
      method: "POST",
      body: JSON.stringify({ limit }),
    })
    return asJson<{ ok: boolean; replayed: number; failed: number }>(res)
  },
  async listPromoRules(): Promise<PromoRule[]> {
    const res = await officeFetch("/api/admin/commercial/promo")
    const data = await asJson<{ promos?: PromoRule[] }>(res)
    return data.promos ?? []
  },
  async createPromoRule(payload: Record<string, unknown>): Promise<PromoRule> {
    const res = await officeFetch("/api/admin/commercial/promo", {
      method: "POST",
      body: JSON.stringify(payload),
    })
    const data = await asJson<{ promo: PromoRule }>(res)
    return data.promo
  },
  async listRolloutControls(): Promise<RolloutControl[]> {
    const res = await officeFetch("/api/admin/commercial/rollout")
    const data = await asJson<{ controls?: RolloutControl[] }>(res)
    return data.controls ?? []
  },
  async createRolloutControl(payload: Record<string, unknown>): Promise<RolloutControl> {
    const res = await officeFetch("/api/admin/commercial/rollout", {
      method: "POST",
      body: JSON.stringify(payload),
    })
    const data = await asJson<{ control: RolloutControl }>(res)
    return data.control
  },
  async getPricingEngineHealth(): Promise<PricingEngineHealth> {
    const res = await officeFetch("/api/admin/commercial/pricing-engine-health")
    return asJson<PricingEngineHealth>(res)
  },
  async listProviderFeeSchedules(): Promise<ProviderFeeSchedule[]> {
    const res = await officeFetch("/api/admin/commercial/provider-fees")
    const data = await asJson<{ schedules?: ProviderFeeSchedule[] }>(res)
    return data.schedules ?? []
  },
  async createProviderFeeSchedule(payload: CreateProviderFeeSchedulePayload): Promise<ProviderFeeSchedule> {
    const res = await officeFetch("/api/admin/commercial/provider-fees", {
      method: "POST",
      body: JSON.stringify(payload),
    })
    const data = await asJson<{ schedule: ProviderFeeSchedule }>(res)
    return data.schedule
  },
  async setProviderFeeScheduleActive(id: string, isActive: boolean): Promise<ProviderFeeSchedule> {
    const res = await officeFetch("/api/admin/commercial/provider-fees", {
      method: "PATCH",
      body: JSON.stringify({ id, is_active: isActive }),
    })
    const data = await asJson<{ schedule: ProviderFeeSchedule }>(res)
    return data.schedule
  },
}
