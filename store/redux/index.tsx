'use client'

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

/* ── Slice ─────────────────────────────────────────────────── */

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

/* ── Hook ──────────────────────────────────────────────────── */

export function useAppStore(): StoreAdapter {
  const state = useSelector((s: RootState) => s.app)
  const dispatch = useDispatch<AppDispatch>()
  const { actions } = appSlice

  // useMemo prevents a new actions object from being allocated on every render.
  // Without it, any consumer using React.memo would see a new `actions` reference
  // each render and could not bail out via prop equality.
  const memoActions = useMemo<AppActions>(() => ({
    setFilter:        (v)  => dispatch(actions.setFilter(v)),
    setSortBy:        (c)  => dispatch(actions.setSortBy(c)),
    toggleSortDir:    ()   => dispatch(actions.toggleSortDir()),
    toggleSelect:     (id) => dispatch(actions.toggleSelect(id)),
    incrementCounter: ()   => dispatch(actions.incrementCounter()),
    refreshRows:      ()   => dispatch(actions.refreshRows()),
    resetState:       ()   => dispatch(actions.resetState()),
    patchRow:         (id, patch) => dispatch(actions.patchRow({ id, patch })),
  }), [dispatch, actions])

  return { state, actions: memoActions }
}
// Fine-grained hook — per-field selectors mean DataTable re-renders only when
// its own data changes (rows/filter/sort/selection), NOT when counter ticks.
export function useTableStore(): TableState & { toggleSelect: (id: string) => void } {
  const rows        = useSelector((s: RootState) => s.app.rows)
  const filter      = useSelector((s: RootState) => s.app.filter)
  const sortBy      = useSelector((s: RootState) => s.app.sortBy)
  const sortDir     = useSelector((s: RootState) => s.app.sortDir)
  const selectedIds = useSelector((s: RootState) => s.app.selectedIds)
  const dispatch    = useDispatch<AppDispatch>()
  const toggleSelect = useCallback(
    (id: string) => dispatch(appSlice.actions.toggleSelect(id)),
    [dispatch]
  )
  return { rows, filter, sortBy, sortDir, selectedIds, toggleSelect }
}
/* ── Provider ──────────────────────────────────────────────── */

export function StoreProvider({ children }: { children: ReactNode }) {
  return <Provider store={store}>{children}</Provider>
}

// ── Multi-panel slice hooks (RQ11--RQ12) ────────────────────────────────────
// Per-field selectors ensure each panel re-renders ONLY when its specific
// slice changes — the same isolation mechanism as useTableStore above.

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
