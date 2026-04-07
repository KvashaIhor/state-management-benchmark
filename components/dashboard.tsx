'use client'

import { useAppStore } from '@/store'
import { RenderTracker } from './render-tracker'
import { DataTable } from './data-table'
import type { Row } from '@/store'

export function Dashboard() {
  const { state, actions } = useAppStore()

  return (
    <RenderTracker id="Dashboard">
      <div style={{ fontFamily: 'monospace', padding: '1rem' }}>
        <header style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          <h1 style={{ margin: 0 }}>
            State Benchmark — {process.env.NEXT_PUBLIC_STATE_LIBRARY ?? 'context'}
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
          <button
            data-testid="patch-row-btn"
            onClick={() => actions.patchRow('row-0', { value: state.rows[0].value + 1 })}
          >
            Patch Row
          </button>
          <button data-testid="reset" onClick={actions.resetState}>
            Reset
          </button>
        </header>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            data-testid="filter"
            type="text"
            value={state.filter}
            onChange={(e) => actions.setFilter(e.target.value)}
            placeholder="Filter by name or category…"
            style={{ flex: 1, padding: '0.25rem' }}
          />

          <select
            data-testid="sort-by"
            value={state.sortBy}
            onChange={(e) => actions.setSortBy(e.target.value as keyof Row)}
            style={{ padding: '0.25rem' }}
          >
            <option value="name">Name</option>
            <option value="value">Value</option>
            <option value="category">Category</option>
          </select>

          <button data-testid="sort-dir" onClick={actions.toggleSortDir}>
            {state.sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
          </button>
        </div>

        <p data-testid="selected-count">Selected: {state.selectedIds.length}</p>

        <DataTable />
      </div>
    </RenderTracker>
  )
}
