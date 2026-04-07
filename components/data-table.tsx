'use client'

import { memo, useMemo } from 'react'
import { useTableStore } from '@/store'
import { RenderTracker } from './render-tracker'
import type { Row } from '@/store'

// React.memo prevents re-renders when Dashboard (parent) re-renders.
// Since DataTable has no props (besides optional consumerId), the only thing
// that can trigger a re-render is a change in useTableStore()'s output.
//
// Result by library for RQ1 (counter increments):
//   Redux / Zustand / Jotai — useTableStore() uses per-field selectors that
//     do NOT subscribe to counter → DataTable renders = 0 on counter change.
//   Context — useContext(StateCtx) fires on ANY context value change, including
//     counter → DataTable renders = 50. This is the key RQ1 finding.
//
// consumerId: used by RenderTracker to distinguish instances in K-consumer
//   scenarios (RQ8). Defaults to 'DataTable' for backward compatibility.
export const DataTable = memo(function DataTable({ consumerId = 'DataTable' }: { consumerId?: string }) {
  const { rows, filter, sortBy, sortDir, selectedIds, toggleSelect } = useTableStore()

  const visibleRows = useMemo(() => {
    const filtered = filter
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(filter.toLowerCase()) ||
            r.category.toLowerCase().includes(filter.toLowerCase()),
        )
      : rows

    return [...filtered].sort((a, b) => {
      const av = a[sortBy as keyof Row]
      const bv = b[sortBy as keyof Row]
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, filter, sortBy, sortDir])

  return (
    <RenderTracker id={consumerId}>
      <table data-testid="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>✓</th>
            <th>Name</th>
            <th>Value</th>
            <th>Category</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const selected = selectedIds.includes(row.id)
            return (
              <tr
                key={row.id}
                data-testid={`row-${row.id}`}
                data-selected={selected}
                onClick={() => toggleSelect(row.id)}
                style={{ background: selected ? '#e0f0ff' : undefined, cursor: 'pointer' }}
              >
                <td>{selected ? '✓' : ''}</td>
                <td>{row.name}</td>
                <td>{row.value}</td>
                <td>{row.category}</td>
                <td>{row.active ? 'Yes' : 'No'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </RenderTracker>
  )
})
