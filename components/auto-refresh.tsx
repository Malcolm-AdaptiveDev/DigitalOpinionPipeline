'use client'

import { useEffect, useRef } from 'react'
import { useRouter }         from 'next/navigation'

export function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter()
  const timer  = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timer.current = setInterval(() => {
      router.refresh()
    }, intervalMs)

    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [router, intervalMs])

  return null
}
