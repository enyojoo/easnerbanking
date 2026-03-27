"use client"

import { useState, useEffect } from "react"
import { officeDataStore } from "@/lib/office-data-store"
import { useAuth } from "@/lib/auth-context"

export function useOfficeData() {
  const { user, isAdmin } = useAuth()
  const initialData = officeDataStore.getData()
  const [data, setData] = useState<any>(initialData)
  // Only treat as loading when there is no renderable snapshot yet (stale cached data still renders).
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    if (isAdmin && user) {
      const initializeData = async () => {
        if (!mounted) return

        try {
          const existing = officeDataStore.getData()
          const hasData = Boolean(existing)
          // Only show loading when we don't have fresh data (prevents flicker)
          if (!hasData) {
            setLoading(true)
          }
          setError(null)
          await officeDataStore.initializeDirect()
          if (mounted) {
            const newData = officeDataStore.getData()
            if (newData) {
              setData(newData)
            }
            setLoading(false)
          }
        } catch (err) {
          console.error("Failed to initialize office data:", err)
          if (mounted) {
            const existingData = officeDataStore.getData()
            if (existingData) {
              setData(existingData)
              setError(null)
            } else {
              setError("Failed to load office data")
            }
            setLoading(false)
          }
        }
      }

      initializeData()
    } else {
      setLoading(false)
    }

    const unsubscribe = officeDataStore.subscribe(() => {
      if (mounted) {
        const newData = officeDataStore.getData()
        if (newData) {
          setData((prevData: any) => {
            if (prevData?.lastUpdated === newData.lastUpdated) {
              return prevData
            }
            return newData
          })
          setLoading((prevLoading) => prevLoading && newData ? false : prevLoading)
          setError(null)
        }
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [isAdmin, user])

  return { data, loading, error }
}
