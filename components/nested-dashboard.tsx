'use client'

import { useAppStore } from '@/store'
import { RenderTracker } from './render-tracker'
import { DataTable } from './data-table'

// ---------------------------------------------------------------------------
// Panel — intermediate layout layer (intentionally NOT wrapped in React.memo)
// ---------------------------------------------------------------------------
//
// This component sits between the state-subscribing root (Shell) and the
// memoised leaf (DataTable). Its purpose in RQ6 is to demonstrate that an
// unmemoized middle layer propagates the parent's re-renders — Panel will
// render once per Shell re-render — while the React.memo-guarded DataTable
// leaf remains protected as long as no new prop references are passed to it.
//
// Expected render counts on RQ6 (50 counter increments):
//   Panel: 50  — cascades from Shell (no React.memo bail-out)
//   DataTable: 0 (Redux / Zustand / Jotai) | 50 (Context)
function Panel() {
  return (
    <RenderTracker id="Panel">
      <div data-testid="panel" style={{ border: '1px dashed #ccc', padding: '0.5rem' }}>
        <DataTable />
      </div>
    </RenderTracker>
  )
}

// ---------------------------------------------------------------------------
// Shell — root component, subscribes to full AppState including counter
// ---------------------------------------------------------------------------
//
// Re-renders once per counter increment (50 times in RQ6). Passes no props
// to Panel, so Panel's re-renders are driven entirely by reconciliation
// cascade from Shell — not by prop changes.
function Shell() {
  const { state, actions } = useAppStore()

  return (
    <RenderTracker id="Shell">
      <div style={{ fontFamily: 'monospace', padding: '1rem' }}>
        <header
          style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}
        >
          <h1 style={{ margin: 0 }}>
            Nested Benchmark — {process.env.NEXT_PUBLIC_STATE_LIBRARY ?? 'context'}
          </h1>
          <span data-testid="counter" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
            {state.counter}
          </span>
          <button data-testid="increment" onClick={actions.incrementCounter}>
            +1
          </button>
          <button data-testid="refresh-rows" onClick={actions.refreshRows}>
            Refresh Rows
          </button>
          <button data-testid="reset" onClick={actions.resetState}>
            Reset
          </button>
        </header>

        {/* 3-level tree: Shell (this) → Panel (middle) → DataTable (leaf) */}
        <Panel />
      </div>
    </RenderTracker>
  )
}

export { Shell as NestedDashboard }
