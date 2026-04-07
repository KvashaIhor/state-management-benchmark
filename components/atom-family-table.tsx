'use client'

/**
 * AtomFamilyTable — RQ10 benchmark component
 *
 * Each row is a separate RowCell component subscribing to its own atom via
 * useRowAtom(id). A single-field patch on row-0 only causes RowCell-row-0
 * to re-render; all other RowCell components are unaffected.
 *
 * This demonstrates Jotai's structural advantage over Redux/Zustand/Context
 * under high-frequency per-row update workloads: per-row render count is 1
 * per patch rather than 100 (full table re-render).
 *
 * RenderTracker id convention:
 *   'AtomTable'       — the outer table wrapper (should render 0 on patches)
 *   `RowCell-${id}`   — individual row cells (only patched row re-renders)
 */

import { memo, useCallback, useState } from 'react'
import { useRowAtom, usePatchRowAtom, useRowIds } from '@/store/jotai-atoms'
import { RenderTracker } from './render-tracker'

// ---------------------------------------------------------------------------
// Individual row — subscribes to its own atom only
// ---------------------------------------------------------------------------
const RowCell = memo(function RowCell({ id }: { id: string }) {
  const row = useRowAtom(id)
  return (
    <RenderTracker id={`RowCell-${id}`}>
      <tr data-testid={`atom-row-${id}`}>
        <td>{row.name}</td>
        <td data-testid={id === 'row-0' ? 'atom-row-0-value' : undefined}>{row.value}</td>
        <td>{row.category}</td>
        <td>{row.active ? 'yes' : 'no'}</td>
      </tr>
    </RenderTracker>
  )
})

// ---------------------------------------------------------------------------
// Patch button — patches row-0's value field
// Rendered outside RowCell so its re-render doesn't count as a row re-render
// ---------------------------------------------------------------------------
function PatchButton() {
  const patch = usePatchRowAtom('row-0')
  const [count, setCount] = useState(0)
  const handleClick = useCallback(() => {
    setCount((c) => {
      const next = c + 1
      patch({ value: next })
      return next
    })
  }, [patch])
  return (
    <button data-testid="atom-patch-btn" onClick={handleClick}>
      Patch row-0 value ({count})
    </button>
  )
}

// ---------------------------------------------------------------------------
// Table wrapper — tracked but should NOT re-render on per-row patches
// because it only reads rowIds (stable), not any row atom's value
// ---------------------------------------------------------------------------
export const AtomFamilyTable = memo(function AtomFamilyTable() {
  const rowIds = useRowIds()

  return (
    <RenderTracker id="AtomTable">
      <div>
        <PatchButton />
        <table
          data-testid="atom-table"
          style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}
        >
          <thead>
            <tr>
              <th>Name</th>
              <th>Value</th>
              <th>Category</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {rowIds.map((id) => (
              <RowCell key={id} id={id} />
            ))}
          </tbody>
        </table>
      </div>
    </RenderTracker>
  )
})
