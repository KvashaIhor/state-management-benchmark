'use client'

import { atom, useAtomValue, useSetAtom, createStore, Provider } from 'jotai'
import { useCallback } from 'react'
import type { ReactNode } from 'react'
import type { AppActions, AppState, Row, StoreAdapter, TableState, CounterSlice, FilterSortSlice, SelectionSlice } from '../types'
import { generateRows } from '../seed'

/* ── Atoms ─────────────────────────────────────────────────── */
// Each atom is independent so components can subscribe to only
// the slice they need — the core advantage of atomic state.

const rowsAtom        = atom<Row[]>(generateRows())
const filterAtom      = atom<string>('')
const sortByAtom      = atom<keyof Row>('name')
const sortDirAtom     = atom<'asc' | 'desc'>('asc')
const counterAtom     = atom<number>(0)
const selectedIdsAtom = atom<string[]>([])

/* ── Hook ──────────────────────────────────────────────────── */

export function useAppStore(): StoreAdapter {
  const rows       = useAtomValue(rowsAtom)
  const filter     = useAtomValue(filterAtom)
  const sortBy     = useAtomValue(sortByAtom)
  const sortDir    = useAtomValue(sortDirAtom)
  const counter    = useAtomValue(counterAtom)
  const selectedIds = useAtomValue(selectedIdsAtom)

  const setRows        = useSetAtom(rowsAtom)
  const setFilter      = useSetAtom(filterAtom)
  const setSortByAtom  = useSetAtom(sortByAtom)
  const setSortDir     = useSetAtom(sortDirAtom)
  const setCounter     = useSetAtom(counterAtom)
  const setSelectedIds = useSetAtom(selectedIdsAtom)

  const toggleSortDir    = useCallback(() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')), [setSortDir])
  const toggleSelect     = useCallback((id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ), [setSelectedIds])
  const incrementCounter = useCallback(() => setCounter((c) => c + 1), [setCounter])
  const refreshRows      = useCallback(() => setRows(generateRows()), [setRows])
  const patchRow         = useCallback(
    (id: string, patch: Partial<Row>) =>
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    [setRows]
  )
  const resetState       = useCallback(() => {
    // NOTE — atomicity asymmetry: Jotai has no built-in multi-atom transaction,
    // so resetState fires 6 independent atom writes. This produces up to 6
    // separate React render cycles rather than Redux/Context/Zustand's single
    // dispatch. This asymmetry does NOT affect any measured RQ1–RQ5 scenario
    // because beforeEach() reloads the page (rather than calling resetState()),
    // ensuring the store is always fresh before each test without triggering any
    // extra renders in the measured window.
    setRows(generateRows())
    setFilter('')
    setSortByAtom('name')
    setSortDir('asc')
    setCounter(0)
    setSelectedIds([])
  }, [setRows, setFilter, setSortByAtom, setSortDir, setCounter, setSelectedIds])

  const actions: AppActions = {
    setFilter,
    setSortBy: setSortByAtom,
    toggleSortDir,
    toggleSelect,
    incrementCounter,
    refreshRows,
    resetState,
    patchRow,
  }

  return {
    state: { rows, filter, sortBy, sortDir, counter, selectedIds },
    actions,
  }
}
// Fine-grained hook — subscribes only to the 5 atoms DataTable needs.
// counterAtom is NOT subscribed, so DataTable skips renders on +1.
export function useTableStore(): TableState & { toggleSelect: (id: string) => void } {
  const rows        = useAtomValue(rowsAtom)
  const filter      = useAtomValue(filterAtom)
  const sortBy      = useAtomValue(sortByAtom)
  const sortDir     = useAtomValue(sortDirAtom)
  const selectedIds = useAtomValue(selectedIdsAtom)
  const setSelectedIds = useSetAtom(selectedIdsAtom) // setter only — no subscription
  const toggleSelect = useCallback(
    (id: string) => setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ),
    [setSelectedIds]
  )
  return { rows, filter, sortBy, sortDir, selectedIds, toggleSelect }
}
/* ── Provider ──────────────────────────────────────────────── */

const jotaiStore = createStore()

// ── Multi-panel slice hooks (RQ11--RQ12) ────────────────────────────────────
// Each hook subscribes to exactly the atoms for its slice; Jotai re-renders
// the subscribing component only when those atoms change.

export function useCounterSlice(): CounterSlice {
  const counter = useAtomValue(counterAtom)
  return { counter }
}

export function useFilterSortSlice(): FilterSortSlice {
  const rows    = useAtomValue(rowsAtom)
  const filter  = useAtomValue(filterAtom)
  const sortBy  = useAtomValue(sortByAtom)
  const sortDir = useAtomValue(sortDirAtom)
  return { rows, filter, sortBy, sortDir }
}

export function useSelectionSlice(): SelectionSlice {
  const selectedIds    = useAtomValue(selectedIdsAtom)
  const setSelectedIds = useSetAtom(selectedIdsAtom)
  const toggleSelect   = useCallback(
    (id: string) => setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ),
    [setSelectedIds],
  )
  return { selectedIds, toggleSelect }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  return <Provider store={jotaiStore}>{children}</Provider>
}
