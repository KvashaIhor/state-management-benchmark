'use client'

import { proxy, subscribe } from 'valtio'
import { useSyncExternalStore, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import type { AppActions, AppState, Row, StoreAdapter, TableState, CounterSlice, FilterSortSlice, SelectionSlice } from '../types'
import { generateRows } from '../seed'

/* ── Proxy store ───────────────────────────────────────────── */
// `proxy` wraps the object in a Proxy that intercepts mutations.
//
// Integration strategy: useSyncExternalStore (React 18) rather than
// useState + useEffect.  The subscribe API fires asynchronously in
// Valtio 2, and React 18's automatic batching can coalesce multiple
// rapid setVersion() calls into one commit, producing incorrect render
// counts in the benchmark.  useSyncExternalStore forces synchronous,
// non-batched re-renders that match the real per-mutation semantics
// measured by the other libraries (Redux/Zustand/Jotai all use
// useSyncExternalStore internally via react-redux / zustand / jotai).

const store = proxy<AppState>({
  rows: generateRows(),
  filter: '',
  sortBy: 'name',
  sortDir: 'asc',
  counter: 0,
  selectedIds: [],
})

/* ── Actions ───────────────────────────────────────────────── */

const actions: AppActions = {
  setFilter:        (value) => { store.filter = value },
  setSortBy:        (col)   => { store.sortBy = col },
  toggleSortDir:    ()      => { store.sortDir = store.sortDir === 'asc' ? 'desc' : 'asc' },
  toggleSelect:     (id)    => {
    const idx = store.selectedIds.indexOf(id)
    if (idx === -1) store.selectedIds.push(id)
    else            store.selectedIds.splice(idx, 1)
  },
  incrementCounter: ()      => { store.counter++ },
  refreshRows:      ()      => { store.rows = generateRows() },
  resetState:       ()      => {
    store.rows       = generateRows()
    store.filter     = ''
    store.sortBy     = 'name'
    store.sortDir    = 'asc'
    store.counter    = 0
    store.selectedIds = []
  },
  patchRow: (id, patch) => {
    const idx = store.rows.findIndex((r) => r.id === id)
    if (idx !== -1) Object.assign(store.rows[idx], patch)
  },
}

/* ── Snapshot helpers ──────────────────────────────────────── */
// Each snapshot helper caches its result and exposes an invalidation
// token so that useSyncExternalStore can detect when a change occurred.
// React calls getSnapshot() more than once per render cycle (strict-mode,
// concurrent-mode double invocation) — caching avoids spurious inequality.

// App snapshot: re-creates on every store mutation.
let appSnapshot: AppState | null = null

function getAppSnapshot(): AppState {
  if (!appSnapshot) {
    appSnapshot = {
      rows:        store.rows as Row[],
      filter:      store.filter,
      sortBy:      store.sortBy,
      sortDir:     store.sortDir,
      counter:     store.counter,
      selectedIds: store.selectedIds as string[],
    }
  }
  return appSnapshot
}

function subscribeApp(onStoreChange: () => void): () => void {
  return subscribe(store, () => {
    appSnapshot = null          // invalidate so next getSnapshot() returns new ref
    onStoreChange()
  })
}

// Table snapshot: re-creates only on non-counter mutations.
// counter-isolation is implemented per-subscription (each useTableStore()
// call creates its own prevCounter closure via useRef so that K concurrent
// consumers remain independent — see useTableStore below).
let tableSnapshot: TableState | null = null

function getTableSnapshot(): TableState {
  if (!tableSnapshot) {
    tableSnapshot = {
      rows:        store.rows as Row[],
      filter:      store.filter,
      sortBy:      store.sortBy,
      sortDir:     store.sortDir,
      selectedIds: store.selectedIds as string[],
    }
  }
  return tableSnapshot
}

/* ── Hooks ─────────────────────────────────────────────────── */

// Dashboard / Shell: re-renders on every store mutation.
export function useAppStore(): StoreAdapter {
  const state = useSyncExternalStore(subscribeApp, getAppSnapshot, getAppSnapshot)
  return { state, actions }
}

// DataTable: re-renders only on table-relevant changes (NOT counter-only).
//
// Counter isolation: each component instance tracks its own prevCounter
// via useRef so that K concurrent consumers (RQ8) are each independently
// correct without races on a shared module-level variable.
//
// When subscribe fires:
//   - counter changed alone → skip (RQ1: DataTable = 0 renders)
//   - anything else changed → invalidate shared tableSnapshot + notify
//     (RQ2–RQ7 correctness)
//
// Valtio fires subscribe for deep mutations too (patchRow's
// Object.assign on store.rows[idx]), so the !counterChanged gate
// correctly covers all table-relevant paths.
export function useTableStore(): TableState & { toggleSelect: (id: string) => void } {
  // Stable subscribe function per component instance (unique prevCounter).
  const subscribeFn = useRef<((cb: () => void) => () => void) | null>(null)
  if (!subscribeFn.current) {
    let prevCounter = store.counter
    subscribeFn.current = (onStoreChange: () => void) =>
      subscribe(store, () => {
        const counterChanged = store.counter !== prevCounter
        prevCounter = store.counter
        if (!counterChanged) {
          tableSnapshot = null    // invalidate shared cache
          onStoreChange()
        }
      })
  }

  const snapshot = useSyncExternalStore(
    subscribeFn.current,
    getTableSnapshot,
    getTableSnapshot,
  )

  const toggleSelect = useCallback((id: string) => actions.toggleSelect(id), [])
  return { ...snapshot, toggleSelect }
}

/* ── Provider (no-op — Valtio is module-level store) ──────── */

export function StoreProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
// ── Multi-panel slice snapshots ─────────────────────────────────────────────
let counterSliceCache:    CounterSlice                  | null = null
let filterSortSliceCache: FilterSortSlice               | null = null
let selectionIdsCache:    { selectedIds: string[] }     | null = null

function getCounterSliceSnap(): CounterSlice {
  if (!counterSliceCache) counterSliceCache = { counter: store.counter }
  return counterSliceCache
}
function getFilterSortSliceSnap(): FilterSortSlice {
  if (!filterSortSliceCache) filterSortSliceCache = {
    rows: store.rows as Row[], filter: store.filter,
    sortBy: store.sortBy, sortDir: store.sortDir,
  }
  return filterSortSliceCache
}
function getSelectionIdsSnap(): { selectedIds: string[] } {
  if (!selectionIdsCache) selectionIdsCache = { selectedIds: store.selectedIds as string[] }
  return selectionIdsCache
}

// ── Multi-panel slice hooks (RQ11--RQ12) ────────────────────────────────────
// Valtio's subscribe() fires on ALL store mutations (no field-level filtering).
// Each hook carries a per-instance prevValue closure (via useRef) to gate
// whether a mutation is relevant to its slice — same pattern as useTableStore.
// NOTE: With React Compiler enabled Valtio is INCOMPATIBLE: the compiler's
// static memoisation suppresses re-renders even when the proxy signals a change,
// producing zero renders where non-zero are correct (RQ12 key finding).

export function useCounterSlice(): CounterSlice {
  const subscribeFn = useRef<((cb: () => void) => () => void) | null>(null)
  if (!subscribeFn.current) {
    let prev = store.counter
    subscribeFn.current = (onStoreChange: () => void) =>
      subscribe(store, () => {
        if (store.counter !== prev) {
          prev = store.counter
          counterSliceCache = null
          onStoreChange()
        }
      })
  }
  return useSyncExternalStore(subscribeFn.current, getCounterSliceSnap, getCounterSliceSnap)
}

export function useFilterSortSlice(): FilterSortSlice {
  const subscribeFn = useRef<((cb: () => void) => () => void) | null>(null)
  if (!subscribeFn.current) {
    let prevCounter   = store.counter
    let prevSelection = store.selectedIds.join(',')
    subscribeFn.current = (onStoreChange: () => void) =>
      subscribe(store, () => {
        const counterChanged   = store.counter !== prevCounter
        const selectionChanged = store.selectedIds.join(',') !== prevSelection
        prevCounter   = store.counter
        prevSelection = store.selectedIds.join(',')
        // Re-render only when something other than counter or selection changed
        // (i.e., filter, sortBy, sortDir, or rows changed).
        if (!counterChanged && !selectionChanged) {
          filterSortSliceCache = null
          onStoreChange()
        }
      })
  }
  return useSyncExternalStore(subscribeFn.current, getFilterSortSliceSnap, getFilterSortSliceSnap)
}

export function useSelectionSlice(): SelectionSlice {
  const subscribeFn = useRef<((cb: () => void) => () => void) | null>(null)
  if (!subscribeFn.current) {
    let prevKey = store.selectedIds.join(',')
    subscribeFn.current = (onStoreChange: () => void) =>
      subscribe(store, () => {
        const key = store.selectedIds.join(',')
        if (key !== prevKey) {
          prevKey = key
          selectionIdsCache = null
          onStoreChange()
        }
      })
  }
  const snap = useSyncExternalStore(subscribeFn.current, getSelectionIdsSnap, getSelectionIdsSnap)
  const toggleSelect = useCallback((id: string) => actions.toggleSelect(id), [])
  return { selectedIds: snap.selectedIds, toggleSelect }
}