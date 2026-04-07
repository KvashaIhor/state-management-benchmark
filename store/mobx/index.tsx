'use client'

import { makeAutoObservable, reaction } from 'mobx'
import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { AppActions, AppState, Row, StoreAdapter, TableState, CounterSlice, FilterSortSlice, SelectionSlice } from '../types'
import { generateRows } from '../seed'

/* ── Observable store ──────────────────────────────────────── */
// `makeAutoObservable` marks all fields as observable and all methods
// as actions automatically.  MobX's reaction() then lets us subscribe
// to exactly the tracked fields we read inside the tracking function,
// providing field-level granularity without wrapping components in
// `observer()`.

class AppStore {
  rows: Row[]             = generateRows()
  filter: string          = ''
  sortBy: keyof Row       = 'name'
  sortDir: 'asc' | 'desc' = 'asc'
  counter: number         = 0
  selectedIds: string[]   = []

  constructor() {
    makeAutoObservable(this)
  }

  setFilter(value: string)           { this.filter = value }
  setSortBy(col: keyof Row)          { this.sortBy = col }
  toggleSortDir()                    { this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc' }
  toggleSelect(id: string) {
    const idx = this.selectedIds.indexOf(id)
    if (idx === -1) this.selectedIds.push(id)
    else            this.selectedIds.splice(idx, 1)
  }
  incrementCounter()                 { this.counter++ }
  refreshRows()                      { this.rows = generateRows() }
  patchRow(id: string, patch: Partial<Row>) {
    const idx = this.rows.findIndex((r) => r.id === id)
    // Replace the element at idx with a new object rather than mutating in-place.
    // The reaction in useTableStore tracks rows via `.slice()`, which observes
    // array structural changes (element replaced).  In-place Object.assign
    // on the element would only trigger reactions that observe that specific
    // element's properties, which our array-level tracking does not cover.
    if (idx !== -1) this.rows.splice(idx, 1, { ...this.rows[idx], ...patch } as Row)
  }
  resetState() {
    this.rows       = generateRows()
    this.filter     = ''
    this.sortBy     = 'name'
    this.sortDir    = 'asc'
    this.counter    = 0
    this.selectedIds = []
  }
}

const mobxStore = new AppStore()

/* ── Hooks ─────────────────────────────────────────────────── */
// Each hook uses reaction() to subscribe to exactly the slice it
// declares inside the tracking function (first argument).
// MobX only schedules the effect (second argument) when an observed
// property that was *actually read* inside the tracker changes.
//
// Key: useTableStore()'s tracker does NOT read `counter`, so MobX
// will NOT fire the forceUpdate callback when counter changes.
// DataTable therefore produces 0 re-renders on counter increments.

export function useAppStore(): StoreAdapter {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const dispose = reaction(
      () => ({
        // read all app-level fields — subscribe to all of them
        rows:        mobxStore.rows.slice(),
        filter:      mobxStore.filter,
        sortBy:      mobxStore.sortBy,
        sortDir:     mobxStore.sortDir,
        counter:     mobxStore.counter,
        selectedIds: mobxStore.selectedIds.slice(),
      }),
      () => forceUpdate((n) => n + 1),
    )
    forceUpdate((n) => n + 1) // sync initial state
    return dispose
  }, [])

  const actions: AppActions = {
    setFilter:        (v)  => mobxStore.setFilter(v),
    setSortBy:        (c)  => mobxStore.setSortBy(c),
    toggleSortDir:    ()   => mobxStore.toggleSortDir(),
    toggleSelect:     (id) => mobxStore.toggleSelect(id),
    incrementCounter: ()   => mobxStore.incrementCounter(),
    refreshRows:      ()   => mobxStore.refreshRows(),
    resetState:       ()   => mobxStore.resetState(),
    patchRow:         (id, patch) => mobxStore.patchRow(id, patch),
  }

  const state: AppState = {
    rows:        mobxStore.rows.slice(),
    filter:      mobxStore.filter,
    sortBy:      mobxStore.sortBy,
    sortDir:     mobxStore.sortDir,
    counter:     mobxStore.counter,
    selectedIds: mobxStore.selectedIds.slice(),
  }

  return { state, actions }
}

// Fine-grained hook — tracker does NOT read counter.
// MobX will never fire forceUpdate when only counter changes,
// so DataTable produces 0 re-renders on counter increments.
export function useTableStore(): TableState & { toggleSelect: (id: string) => void } {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const dispose = reaction(
      () => ({
        // deliberately omit counter — DataTable must not subscribe to it
        rows:        mobxStore.rows.slice(),
        filter:      mobxStore.filter,
        sortBy:      mobxStore.sortBy,
        sortDir:     mobxStore.sortDir,
        selectedIds: mobxStore.selectedIds.slice(),
      }),
      () => forceUpdate((n) => n + 1),
    )
    return dispose
  }, [])

  const toggleSelect = useCallback(
    (id: string) => mobxStore.toggleSelect(id),
    [],
  )

  return {
    rows:        mobxStore.rows.slice(),
    filter:      mobxStore.filter,
    sortBy:      mobxStore.sortBy,
    sortDir:     mobxStore.sortDir,
    selectedIds: mobxStore.selectedIds.slice(),
    toggleSelect,
  }
}

/* ── Provider (no-op — MobX store is module-level) ────────── */

export function StoreProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
// ── Multi-panel slice hooks (RQ11--RQ12) ────────────────────────────────────
// Each hook's reaction() tracker reads ONLY the fields for its slice.
// MobX schedules the effect only when those specific observables change;
// unrelated field mutations are completely invisible to the subscription.

export function useCounterSlice(): CounterSlice {
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    const dispose = reaction(
      () => mobxStore.counter,
      () => forceUpdate((n) => n + 1),
    )
    return dispose
  }, [])
  return { counter: mobxStore.counter }
}

export function useFilterSortSlice(): FilterSortSlice {
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    const dispose = reaction(
      () => ({
        rows:    mobxStore.rows.slice(),
        filter:  mobxStore.filter,
        sortBy:  mobxStore.sortBy,
        sortDir: mobxStore.sortDir,
      }),
      () => forceUpdate((n) => n + 1),
    )
    return dispose
  }, [])
  return {
    rows:    mobxStore.rows.slice(),
    filter:  mobxStore.filter,
    sortBy:  mobxStore.sortBy,
    sortDir: mobxStore.sortDir,
  }
}

export function useSelectionSlice(): SelectionSlice {
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    const dispose = reaction(
      () => mobxStore.selectedIds.slice(),
      () => forceUpdate((n) => n + 1),
    )
    return dispose
  }, [])
  const toggleSelect = useCallback((id: string) => mobxStore.toggleSelect(id), [])
  return { selectedIds: mobxStore.selectedIds.slice(), toggleSelect }
}