'use client'

import { useAppStore } from '@/store'
import { RenderTracker } from './render-tracker'
import { DataTable } from './data-table'

// ---------------------------------------------------------------------------
// KConsumerDashboard — empirical K-consumer fan-out benchmark (RQ8)
//
// Renders K identical DataTable instances (each with React.memo) all
// subscribing to the same store. Validates the K×N fan-out claim from §V-A:
//
//   Context:              K × 50 surplus renders (broadcast to all consumers)
//   Redux/Zustand/Jotai:  0 surplus renders at any K (field-level subscriptions)
//
// Each DataTable instance receives consumerId="DataTable-{i}" so that
// RenderTracker can distinguish them in window.__renderRecords. Playwright
// sums countRenders(records, `DataTable-${i}`) for i in [0, K) to get the
// total surplus render count.
// ---------------------------------------------------------------------------

export function KConsumerDashboard({ k }: { k: number }) {
  const { state, actions } = useAppStore()

  return (
    <RenderTracker id="KDashboard">
      <div style={{ fontFamily: 'monospace', padding: '1rem' }}>
        <header style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          <h1 style={{ margin: 0 }}>
            K-Consumer Benchmark (K={k}) — {process.env.NEXT_PUBLIC_STATE_LIBRARY ?? 'context'}
          </h1>
          <span data-testid="counter" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
            {state.counter}
          </span>
          <button data-testid="increment" onClick={actions.incrementCounter}>
            +1
          </button>
          <button data-testid="reset" onClick={actions.resetState}>
            Reset
          </button>
        </header>

        <p style={{ marginBottom: '0.5rem', color: '#666' }}>
          {k} DataTable consumers, all subscribing to the same store slice.
          Only the counter changes on increment — none of the table data changes.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {Array.from({ length: k }, (_, i) => (
            <div key={i} data-testid={`consumer-${i}`} style={{ border: '1px solid #ddd', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#999', marginBottom: '0.25rem' }}>
                Consumer {i}
              </div>
              <DataTable consumerId={`DataTable-${i}`} />
            </div>
          ))}
        </div>
      </div>
    </RenderTracker>
  )
}
