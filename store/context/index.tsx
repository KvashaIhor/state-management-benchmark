'use client'

import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react'
import type { AppActions, AppState, Row, StoreAdapter, TableState, CounterSlice, FilterSortSlice, SelectionSlice } from '../types'
import { generateRows } from '../seed'

/* ── Reducer ───────────────────────────────────────────────── */

type Action =
  | { type: 'SET_FILTER';       payload: string }
  | { type: 'SET_SORT_BY';      payload: keyof Row }
  | { type: 'TOGGLE_SORT_DIR' }
  | { type: 'TOGGLE_SELECT';    payload: string }
  | { type: 'INCREMENT_COUNTER' }
  | { type: 'REFRESH_ROWS' }
  | { type: 'RESET' }
  | { type: 'PATCH_ROW';        payload: { id: string; patch: Partial<Row> } }

const initialState: AppState = {
  rows: generateRows(),
  filter: '',
  sortBy: 'name',
  sortDir: 'asc',
  counter: 0,
  selectedIds: [],
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_FILTER':
      return { ...state, filter: action.payload }
    case 'SET_SORT_BY':
      return { ...state, sortBy: action.payload }
    case 'TOGGLE_SORT_DIR':
      return { ...state, sortDir: state.sortDir === 'asc' ? 'desc' : 'asc' }
    case 'TOGGLE_SELECT': {
      const has = state.selectedIds.includes(action.payload)
      return {
        ...state,
        selectedIds: has
          ? state.selectedIds.filter((id) => id !== action.payload)
          : [...state.selectedIds, action.payload],
      }
    }
    case 'INCREMENT_COUNTER':
      return { ...state, counter: state.counter + 1 }
    case 'REFRESH_ROWS':
      return { ...state, rows: generateRows() }
    case 'RESET':
      return initialState
    case 'PATCH_ROW':
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload.patch } : r
        ),
      }
    default:
      return state
  }
}

/* ── Contexts ──────────────────────────────────────────────── */
// Split state and dispatch into separate contexts so components
// that only dispatch don't re-render on state changes.

const StateCtx    = createContext<AppState | null>(null)
const DispatchCtx = createContext<Dispatch<Action> | null>(null)

/* ── Provider ──────────────────────────────────────────────── */

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>
        {children}
      </DispatchCtx.Provider>
    </StateCtx.Provider>
  )
}

/* ── Hook ──────────────────────────────────────────────────── */

// Fine-grained hook for DataTable — still subscribes to the single StateCtx,
// so it WILL re-render when counter changes. This is the baseline cost of
// React Context and is the key measurable differentiator (RQ1).
export function useTableStore(): TableState & { toggleSelect: (id: string) => void } {
  const state    = useContext(StateCtx)
  const dispatch = useContext(DispatchCtx)
  if (!state || !dispatch) throw new Error('useTableStore must be used inside <StoreProvider>')
  const toggleSelect = useCallback(
    (id: string) => dispatch({ type: 'TOGGLE_SELECT', payload: id }),
    [dispatch]
  )
  return {
    rows:        state.rows,
    filter:      state.filter,
    sortBy:      state.sortBy,
    sortDir:     state.sortDir,
    selectedIds: state.selectedIds,
    toggleSelect,
  }
}

export function useAppStore(): StoreAdapter {
  const state    = useContext(StateCtx)
  const dispatch = useContext(DispatchCtx)

  // Rules of Hooks: all hook calls must precede any conditional throw.
  // The `dispatch!` non-null assertions are safe: if dispatch is null the
  // component throws below before returning, so no UI is mounted that could
  // invoke these callbacks with a null dispatch value.
  const setFilter        = useCallback((v: string)    => dispatch!({ type: 'SET_FILTER',   payload: v }), [dispatch])
  const setSortBy        = useCallback((c: keyof Row) => dispatch!({ type: 'SET_SORT_BY',  payload: c }), [dispatch])
  const toggleSortDir    = useCallback(()              => dispatch!({ type: 'TOGGLE_SORT_DIR' }), [dispatch])
  const toggleSelect     = useCallback((id: string)   => dispatch!({ type: 'TOGGLE_SELECT', payload: id }), [dispatch])
  const incrementCounter = useCallback(()              => dispatch!({ type: 'INCREMENT_COUNTER' }), [dispatch])
  const refreshRows      = useCallback(()              => dispatch!({ type: 'REFRESH_ROWS' }), [dispatch])
  const resetState       = useCallback(()              => dispatch!({ type: 'RESET' }), [dispatch])
  const patchRow         = useCallback(
    (id: string, patch: Partial<Row>) => dispatch!({ type: 'PATCH_ROW', payload: { id, patch } }),
    [dispatch]
  )

  if (!state || !dispatch) {
    throw new Error('useAppStore must be used inside <StoreProvider>')
  }

  return {
    state,
    actions: { setFilter, setSortBy, toggleSortDir, toggleSelect, incrementCounter, refreshRows, resetState, patchRow },
  }
}

// ── Multi-panel slice hooks (RQ11--RQ12) ────────────────────────────────────
// Context has a SINGLE StateCtx — all three hooks re-render on every change,
// regardless of which slice changed. This is the baseline cost documented in
// the multi-panel topology and is the key differentiator from selector-based libs.

export function useCounterSlice(): CounterSlice {
  const state = useContext(StateCtx)
  if (!state) throw new Error('useCounterSlice must be inside <StoreProvider>')
  return { counter: state.counter }
}

export function useFilterSortSlice(): FilterSortSlice {
  const state = useContext(StateCtx)
  if (!state) throw new Error('useFilterSortSlice must be inside <StoreProvider>')
  return { rows: state.rows, filter: state.filter, sortBy: state.sortBy, sortDir: state.sortDir }
}

export function useSelectionSlice(): SelectionSlice {
  const state    = useContext(StateCtx)
  const dispatch = useContext(DispatchCtx)
  if (!state || !dispatch) throw new Error('useSelectionSlice must be inside <StoreProvider>')
  const toggleSelect = useCallback(
    (id: string) => dispatch({ type: 'TOGGLE_SELECT', payload: id }),
    [dispatch]
  )
  return { selectedIds: state.selectedIds, toggleSelect }
}
