"use client"

import { useEffect, useState } from "react"
import { ensureBusinessOperationalAddressCountriesRegistered } from "@/lib/address/register-lib-address-countries"

/** Load lib-address country metadata so invoice readiness can use real field rules. */
export function useBusinessOperationalAddressReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void ensureBusinessOperationalAddressCountriesRegistered().finally(() => setReady(true))
  }, [])
  return ready
}
