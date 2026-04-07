'use client'

import { memo } from 'react'
import { useAppStore, useCounterSlice, useFilterSortSlice, useSelectionSlice } from '@/store'
import { RenderTracker } from './render-tracker'

// ── Panel A: subscribes ONLY to counter slice ─────────────────────────────────
// Re-renders when and only when counter increments.
const PanelA = memo(function PanelA() {
  const { counter } = useCounterSlice()
  return (
    <RenderTracker id="PanelA">
      <div style={{ border: '2px solid #4f86c6', padding: '1rem', borderRadius: '4px' }}>
        <h3 style={{ margin: '0 0 0.5rem' }}>Panel A — Counter slice</h3>
        <span
          data-testid="mp-counter-value"
          style={{ fontSize: '2rem', fontWeight: 'bold' }}
        >
          {counter}
        </span>
      </div>
    </RenderTracker>
  )
})

// ── Panel B: subscribes ONLY to filter/sort/rows slice ───────────────────────
// Re-renders when filter, sortBy, sortDir, or rows change — NOT on counter or
// selection changes.
const PanelB = memo(function PanelB() {
  const { rows, filter, sortBy, sortDir } = useFilterSortSlice()
  return (
    <RenderTracker id="PanelB">
      <div style={{ border: '2px solid #5ab55e', padding: '1rem', borderRadius: '4px' }}>
        <h3 style={{ margin: '0 0 0.5rem' }}>Panel B — FilterSort slice</h3>
        <p data-testid="mp-row-count" style={{ margin: '0.25rem 0' }}>
          Rows: {rows.length}
        </p>
        <p style={{ margin: '0.25rem 0' }}>
          Filter: <em>&quot;{filter}&quot;</em>
        </p>
        <p style={{ margin: '0.25rem 0' }}>
          Sort: {String(sortBy)} {sortDir}
        </p>
      </div>
    </RenderTracker>
  )
})

// ── Panel C: subscribes ONLY to selection slice ───────────────────────────────
// Re-renders when selectedIds changes — NOT on counter or filter/sort changes.
const PanelC = memo(function PanelC() {
  const { selectedIds, toggleSelect } = useSelectionSlice()
  return (
    <RenderTracker id="PanelC">
      <div style={{ border: '2px solid #c46666', padding: '1rem', borderRadius: '4px' }}>
        <h3 style={{ margin: '0 0 0.5rem' }}>Panel C — Selection slice</h3>
        <p data-testid="mp-selected-count" style={{ margin: '0.25rem 0' }}>
          Selected: {selectedIds.length}
        </p>
        <button data-testid="mp-select-row-0" onClick={() => toggleSelect('row-0')}>
          Toggle row-0
        </button>
      </div>
    </RenderTracker>
  )
})

// ── Shell / controls (render not tracked) ────────────────────────────────────
// useAppStore() in the shell re-renders on all state changes; this is expected
// and not instrumented. Only PanelA/B/C render counts are recorded.
export function MultiPanelDashboard() {
  const { state, actions } = useAppStore()

  return (
    <div style={{ fontFamily: 'monospace', padding: '1rem' }}>
      <header style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: '0 0 0.5rem' }}>
          Multi-Panel Benchmark — {process.env.NEXT_PUBLIC_STATE_LIBRARY ?? 'context'}
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button data-testid="mp-increment" onClick={actions.incrementCounter}>
            Increment Counter
          </button>
          <input
            data-testid="mp-filter"
            type="text"
            value={state.filter}
            onChange={(e) => actions.setFilter(e.target.value)}
            placeholder="Filter…"
            style={{ padding: '0.25rem' }}
          />
          <button data-testid="mp-reset" onClick={actions.resetState}>
            Reset
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        <PanelA />
        <PanelB />
        <PanelC />
      </div>
    </div>
  )
}
