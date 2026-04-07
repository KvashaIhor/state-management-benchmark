export interface Row {
  id: string
  name: string
  value: number
  category: 'Alpha' | 'Beta' | 'Gamma' | 'Delta' | 'Epsilon'
  active: boolean
}

export interface AppState {
  rows: Row[]
  filter: string
  sortBy: keyof Row
  sortDir: 'asc' | 'desc'
  counter: number
  selectedIds: string[]
}

export interface AppActions {
  setFilter(value: string): void
  setSortBy(col: keyof Row): void
  toggleSortDir(): void
  toggleSelect(id: string): void
  incrementCounter(): void
  refreshRows(): void
  resetState(): void
  patchRow(id: string, patch: Partial<Row>): void
}

export interface StoreAdapter {
  state: AppState
  actions: AppActions
}

// Subset of AppState used by DataTable (no counter).
// Libraries export useTableStore() returning these fields + toggleSelect
// so DataTable does NOT subscribe to counter and won't re-render on +1.
export interface TableState {
  rows: Row[]
  filter: string
  sortBy: keyof Row
  sortDir: 'asc' | 'desc'
  selectedIds: string[]
}

// ── Multi-panel slice interfaces (RQ11--RQ12) ─────────────────────────────
// Each panel subscribes to a genuinely disjoint slice of AppState.

/** PanelA: only counter. Renders on counter increments; NOT on filter/rows/selection. */
export interface CounterSlice {
  counter: number
}

/** PanelB: filter + sort + rows (table-view data). Renders on filter/sort/rows; NOT on counter/selection. */
export interface FilterSortSlice {
  rows: Row[]
  filter: string
  sortBy: keyof Row
  sortDir: 'asc' | 'desc'
}

/** PanelC: selectedIds only. Renders on selection; NOT on counter/filter/sort/rows. */
export interface SelectionSlice {
  selectedIds: string[]
  toggleSelect: (id: string) => void
}
