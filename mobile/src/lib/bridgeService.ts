import type { Session } from '@supabase/supabase-js'
import { getApiBaseUrl } from './apiClient'
import { getSessionReliable } from './authSession'

async function requireAuthSession(): Promise<Session> {
  const session = await getSessionReliable()
  if (!session?.access_token) throw new Error('Not authenticated')
  return session
}

function apiUrl(): string {
  return getApiBaseUrl()
}

const individualHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
  'X-Easner-Account-Scope': 'individual',
})

export type BridgeKycLink = {
  kyc_link?: string | null
  tos_link?: string | null
  kyc_status?: string
  customer_id?: string | null
}

export type BridgeSyncStatus = {
  kyc_status?: string
  provisioned?: boolean
  customer_id?: string | null
}

export type BridgeCutoverState = {
  required: boolean
  deadlineAt?: string | null
  emailSent?: boolean
}

export const bridgeService = {
  async getKycLink(fullName: string, email: string): Promise<BridgeKycLink> {
    const session = await requireAuthSession()
    const response = await fetch(`${apiUrl()}/api/bridge/kyc-links`, {
      method: 'POST',
      headers: individualHeaders(session.access_token),
      body: JSON.stringify({ full_name: fullName, email, type: 'individual' }),
    })
    const json = (await response.json().catch(() => ({}))) as BridgeKycLink & { error?: string }
    if (!response.ok) {
      throw new Error(json.error || 'Failed to start verification')
    }
    return json
  },

  async syncStatus(): Promise<BridgeSyncStatus> {
    const session = await requireAuthSession()
    const response = await fetch(`${apiUrl()}/api/bridge/sync-status`, {
      method: 'POST',
      headers: individualHeaders(session.access_token),
      body: JSON.stringify({}),
    })
    const json = (await response.json().catch(() => ({}))) as BridgeSyncStatus & { error?: string }
    if (!response.ok) {
      throw new Error(json.error || 'Failed to refresh verification')
    }
    return json
  },

  async ensureCutover(): Promise<BridgeCutoverState> {
    const session = await requireAuthSession()
    const response = await fetch(`${apiUrl()}/api/bridge/cutover`, {
      method: 'POST',
      headers: individualHeaders(session.access_token),
      body: JSON.stringify({}),
    })
    const json = (await response.json().catch(() => ({}))) as BridgeCutoverState
    if (!response.ok) return { required: false }
    return json
  },
}
