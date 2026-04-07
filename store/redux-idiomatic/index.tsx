'use client'

/**
 * redux-idiomatic/index.tsx
 *
 * Idiomatic Redux variant: useAppStore() uses individual per-field useSelector
 * calls (one per AppState field) instead of the single coarse
 * `useSelector((s) => s.app)` used in store/redux/index.tsx.
 *
 * Key design difference
 * ─────────────────────
 * Non-idiomatic (redux/):    useSelector((s: RootState) => s.app)
 *   → subscribes to the entire AppState slice; any dispatched action that
 *     produces a new s.app object triggers a Dashboard re-render.
 *
 * Idiomatic (redux-idiomatic/): one useSelector call per field + useMemo
 *   → each selector tests strict equality against its primitive/reference;
 *     a field that did NOT change (e.g. rows during a counter increment)
 *     returns the same reference → useMemo dependency list is unchanged →
 *     the reconstructed AppState object is NOT recreated → the component
 *     does not re-render for that field's absence-of-change.
 *
 * Render-count expectation
 * ────────────────────────
 * Because Dashboard subscribes — through useAppStore().state — to all six
 * AppState fields (counter, rows, filter, sortBy, sortDir, selectedIds),
 * every scenario that changes a field still triggers a Dashboard re-render.
 * The observable benefit therefore mirrors the non-idiomatic case for these
 * test scenarios: DataTable isolation (via useTableStore, identical in both
 * variants) is the dominant effect.  The idiomatic variant is included as an
 * explicit robustness check: if render counts match the non-idiomatic Redux
 * baseline, it confirms that the isolation property holds regardless of how
 * coarsely useAppStore is implemented — the useTableStore boundary is decisive.
 */

import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { Provider, useDispatch, useSelector } from 'react-redux'
import { useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { AppActions, AppState, Row, StoreAdapter, TableState, CounterSlice, FilterSortSlice, SelectionSlice } from '../types'
import { generateRows } from '../seed'

/* ── Initial state ─────────────────────────────────────────── */

const initialState: AppState = {
  rows: generateRows(),
  filter: '',
  sortBy: 'name',
  sortDir: 'asc',
  counter: 0,
  selectedIds: [],
}

/* ── Slice (identical to redux/index.tsx) ──────────────────── */

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setFilter: (s, a: PayloadAction<string>) => {
      s.filter = a.payload
    },
    setSortBy: (s, a: PayloadAction<keyof Row>) => {
      s.sortBy = a.payload
    },
    toggleSortDir: (s) => {
      s.sortDir = s.sortDir === 'asc' ? 'desc' : 'asc'
    },
    toggleSelect: (s, a: PayloadAction<string>) => {
      const idx = s.selectedIds.indexOf(a.payload)
      if (idx === -1) s.selectedIds.push(a.payload)
      else s.selectedIds.splice(idx, 1)
    },
    incrementCounter: (s) => {
      s.counter += 1
    },
    refreshRows: (s) => {
      s.rows = generateRows()
    },
    resetState: () => initialState,
    patchRow: (s, a: PayloadAction<{ id: string; patch: Partial<Row> }>) => {
      const row = s.rows.find((r) => r.id === a.payload.id)
      if (row) Object.assign(row, a.payload.patch)
    },
  },
})

/* ── Redux store ───────────────────────────────────────────── */

const store = configureStore({ reducer: { app: appSlice.reducer } })
type RootState = ReturnType<typeof store.getState>
type AppDispatch = typeof store.dispatch

/* ── Idiomatic hook — per-field selectors ──────────────────── */

// One useSelector call per AppState field.  RTK/immer preserves unchanged
// field references on every dispatch; per-field selectors therefore skip
// re-renders when the specific field they watch has not changed.
// useMemo reconstructs the AppState object only when at least one field
// reference/value has changed, preventing a fresh object allocation on every
// render and allowing downstream React.memo components to bail out.
export function useAppStore(): StoreAdapter {
  const counter     = useSelector((s: RootState) => s.app.counter)
  const rows        = useSelector((s: RootState) => s.app.rows)
  const filter      = useSelector((s: RootState) => s.app.filter)
  const sortBy      = useSelector((s: RootState) => s.app.sortBy)
  const sortDir     = useSelector((s: RootState) => s.app.sortDir)
  const selectedIds = useSelector((s: RootState) => s.app.selectedIds)
  const dispatch    = useDispatch<AppDispatch>()
  const { actions } = appSlice

  const state = useMemo<AppState>(
    () => ({ counter, rows, filter, sortBy, sortDir, selectedIds }),
    [counter, rows, filter, sortBy, sortDir, selectedIds],
  )

  const memoActions = useMemo<AppActions>(() => ({
    setFilter:        (v)         => dispatch(actions.setFilter(v)),
    setSortBy:        (c)         => dispatch(actions.setSortBy(c)),
    toggleSortDir:    ()          => dispatch(actions.toggleSortDir()),
    toggleSelect:     (id)        => dispatch(actions.toggleSelect(id)),
    incrementCounter: ()          => dispatch(actions.incrementCounter()),
    refreshRows:      ()          => dispatch(actions.refreshRows()),
    resetState:       ()          => dispatch(actions.resetState()),
    patchRow:         (id, patch) => dispatch(actions.patchRow({ id, patch })),
  }), [dispatch, actions])

  return { state, actions: memoActions }
}

// Fine-grained hook — identical to redux/index.tsx.
// DataTable does NOT subscribe to counter regardless of which useAppStore
// variant is active; this hook is the isolation boundary under test.
export function useTableStore(): TableState & { toggleSelect: (id: string) => void } {
  const rows        = useSelector((s: RootState) => s.app.rows)
  const filter      = useSelector((s: RootState) => s.app.filter)
  const sortBy      = useSelector((s: RootState) => s.app.sortBy)
  const sortDir     = useSelector((s: RootState) => s.app.sortDir)
  const selectedIds = useSelector((s: RootState) => s.app.selectedIds)
  const dispatch    = useDispatch<AppDispatch>()
  const toggleSelect = useCallback(
    (id: string) => dispatch(appSlice.actions.toggleSelect(id)),
    [dispatch],
  )
  return { rows, filter, sortBy, sortDir, selectedIds, toggleSelect }
}

/* ── Provider ──────────────────────────────────────────────── */

export function StoreProvider({ children }: { children: ReactNode }) {
  return <Provider store={store}>{children}</Provider>
}

// ── Multi-panel slice hooks (RQ11--RQ12) ────────────────────────────────────
// Identical to redux/index.tsx — isolation property holds regardless of how
// coarsely useAppStore is implemented; the per-field useSelector boundary is
// what determines per-panel re-render behaviour.

export function useCounterSlice(): CounterSlice {
  const counter = useSelector((s: RootState) => s.app.counter)
  return { counter }
}

export function useFilterSortSlice(): FilterSortSlice {
  const rows    = useSelector((s: RootState) => s.app.rows)
  const filter  = useSelector((s: RootState) => s.app.filter)
  const sortBy  = useSelector((s: RootState) => s.app.sortBy)
  const sortDir = useSelector((s: RootState) => s.app.sortDir)
  return { rows, filter, sortBy, sortDir }
}

export function useSelectionSlice(): SelectionSlice {
  const selectedIds  = useSelector((s: RootState) => s.app.selectedIds)
  const dispatch     = useDispatch<AppDispatch>()
  const toggleSelect = useCallback(
    (id: string) => dispatch(appSlice.actions.toggleSelect(id)),
    [dispatch],
  )
  return { selectedIds, toggleSelect }
}
