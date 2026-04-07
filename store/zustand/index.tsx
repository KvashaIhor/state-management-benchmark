'use client'

import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { ReactNode } from 'react'
import type { AppActions, AppState, Row, StoreAdapter, TableState, CounterSlice, FilterSortSlice, SelectionSlice } from '../types'
import { generateRows } from '../seed'

/* ── Store ─────────────────────────────────────────────────── */

type ZustandStore = AppState & AppActions

const useStore = create<ZustandStore>((set) => ({
  rows: generateRows(),
  filter: '',
  sortBy: 'name',
  sortDir: 'asc',
  counter: 0,
  selectedIds: [],

  setFilter: (value) => set({ filter: value }),
  setSortBy: (col) => set({ sortBy: col }),
  toggleSortDir: () =>
    set((s) => ({ sortDir: s.sortDir === 'asc' ? 'desc' : 'asc' })),
  toggleSelect: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id],
    })),
  incrementCounter: () => set((s) => ({ counter: s.counter + 1 })),
  refreshRows: () => set({ rows: generateRows() }),
  patchRow: (id, patch) =>
    set((s) => ({ rows: s.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
  resetState: () =>
    set({
      rows: generateRows(),
      filter: '',
      sortBy: 'name',
      sortDir: 'asc',
      counter: 0,
      selectedIds: [],
    }),
}))

/* ── Hooks ──────────────────────────────────────────────────── */
// useShallow prevents infinite re-render: object-literal selectors always
// produce a new reference; useShallow compares field-by-field instead.

export function useAppStore(): StoreAdapter {
  const state = useStore(
    useShallow((s) => ({
      rows: s.rows,
      filter: s.filter,
      sortBy: s.sortBy,
      sortDir: s.sortDir,
      counter: s.counter,
      selectedIds: s.selectedIds,
    }))
  )

  const actions = useStore(
    useShallow((s) => ({
      setFilter:        s.setFilter,
      setSortBy:        s.setSortBy,
      toggleSortDir:    s.toggleSortDir,
      toggleSelect:     s.toggleSelect,
      incrementCounter: s.incrementCounter,
      refreshRows:      s.refreshRows,
      resetState:       s.resetState,
      patchRow:         s.patchRow,
    }))
  )

  return { state, actions }
}

// Fine-grained hook — subscribes only to table-relevant fields (no counter).
// DataTable uses this so it does NOT re-render when counter changes.
export function useTableStore(): TableState & { toggleSelect: (id: string) => void } {
  const rows        = useStore((s) => s.rows)
  const filter      = useStore((s) => s.filter)
  const sortBy      = useStore((s) => s.sortBy)
  const sortDir     = useStore((s) => s.sortDir)
  const selectedIds = useStore((s) => s.selectedIds)
  // toggleSelect is a Zustand store method with a stable reference;
  // no useCallback wrapper is needed.
  const toggleSelect = useStore((s) => s.toggleSelect)
  return { rows, filter, sortBy, sortDir, selectedIds, toggleSelect }
}

/* ── Provider (no-op — Zustand is store-external) ──────────── */

export function StoreProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

// ── Multi-panel slice hooks (RQ11--RQ12) ────────────────────────────────────
// Each hook uses a fine-grained selector so Zustand only re-renders the
// subscribing component when its specific slice changes.

export function useCounterSlice(): CounterSlice {
  return { counter: useStore((s) => s.counter) }
}

export function useFilterSortSlice(): FilterSortSlice {
  return useStore(
    useShallow((s) => ({ rows: s.rows, filter: s.filter, sortBy: s.sortBy, sortDir: s.sortDir }))
  )
}

export function useSelectionSlice(): SelectionSlice {
  const selectedIds  = useStore((s) => s.selectedIds)
  const toggleSelect = useStore((s) => s.toggleSelect)
  return { selectedIds, toggleSelect }
}
