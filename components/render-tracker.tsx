'use client'

import { useEffect, useRef, type ReactNode } from 'react'

export interface RenderRecord {
  id: string
  phase: 'mount' | 'update'
  // actualDuration is intentionally absent: React's <Profiler> onRender is a
  // no-op in standard react-dom production builds. This tracker records render
  // COUNT and timestamp only; per-render duration requires react-dom/profiler,
  // which is excluded to avoid perturbing the measured artifact (see §3.3).
  timestamp: number
}

// Expose records on window so Playwright can read them via page.evaluate()
function getRecords(): RenderRecord[] {
  if (typeof window === 'undefined') return []
  const w = window as Window & { __renderRecords?: RenderRecord[] }
  w.__renderRecords ??= []
  return w.__renderRecords
}

export function RenderTracker({ id, children }: { id: string; children: ReactNode }) {
  const isMounted = useRef(false)

  // No dependency array → runs after every render commit.
  // In React StrictMode (dev), effects fire twice on mount; in production they
  // fire exactly once per render, giving accurate counts for benchmarking.
  useEffect(() => {
    getRecords().push({
      id,
      phase: isMounted.current ? 'update' : 'mount',
      timestamp: performance.now(),
    })
    isMounted.current = true
  })

  return <>{children}</>
}
