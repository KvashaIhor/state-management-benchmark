'use client'

/**
 * Jotai atom-families store variant (RQ10)
 *
 * This variant replaces the single `rowsAtom` (array atom) with an atomFamily
 * where each row has its own atom keyed by row id. Components can subscribe to
 * individual row atoms, so a single-field patch on `row-0` only re-renders the
 * component subscribed to `row-0` — not all 100 row components.
 *
 * This is the structural advantage of Jotai over Redux/Zustand under
 * high-frequency per-row update workloads. It is not expressible within the
 * shared StoreAdapter interface (which subscribes at the array level), so this
 * variant is measured separately in RQ10.
 *
 * The variant intentionally does NOT implement StoreAdapter — it exposes only
 * the hooks needed for the RQ10 row-patch scenario.
 */

import { atom, useAtomValue, useSetAtom, createStore, Provider } from 'jotai'
import { useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Row } from '../types'
import { generateRows } from '../seed'

// ---------------------------------------------------------------------------
// Row atom family — one atom per row id
// ---------------------------------------------------------------------------
const initialRows = generateRows()

// Map from row id → atom<Row>
const rowAtomMap = new Map<string, ReturnType<typeof atom<Row>>>()
for (const row of initialRows) {
  rowAtomMap.set(row.id, atom<Row>(row))
}

// Derived atom: sorted list of all row ids (stable; row order never changes in RQ10)
const rowIdsAtom = atom<string[]>(initialRows.map((r) => r.id))

// ---------------------------------------------------------------------------
// Patch action
// ---------------------------------------------------------------------------
export function useAtomFamilyPatchRow() {
  const setRow = useSetAtom
  return useCallback((id: string, patch: Partial<Row>) => {
    const rowAtom = rowAtomMap.get(id)
    if (!rowAtom) return
    // We need the store to write — use the jotai store ref from the provider.
    // This is called from a component that holds the store context, so we
    // expose a per-row setter hook instead (see RowCell below).
  }, [])
}

// Hook to read a single row atom by id
export function useRowAtom(id: string): Row {
  const rowAtom = rowAtomMap.get(id)
  if (!rowAtom) throw new Error(`No atom for row id: ${id}`)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useAtomValue(rowAtom)
}

// Hook to patch a single row atom
export function usePatchRowAtom(id: string) {
  const rowAtom = rowAtomMap.get(id)
  if (!rowAtom) throw new Error(`No atom for row id: ${id}`)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const set = useSetAtom(rowAtom)
  return useCallback(
    (patch: Partial<Row>) => set((prev) => ({ ...prev, ...patch })),
    [set]
  )
}

// Hook to get all row ids
export function useRowIds(): string[] {
  return useAtomValue(rowIdsAtom)
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
const atomFamilyStore = createStore()

export function AtomFamilyStoreProvider({ children }: { children: ReactNode }) {
  return <Provider store={atomFamilyStore}>{children}</Provider>
}
