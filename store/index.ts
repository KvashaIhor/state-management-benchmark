// Public API for all consumers.
// `@/store/active` is mapped by next.config.mjs webpack alias to the
// library selected by NEXT_PUBLIC_STATE_LIBRARY at build time.
// TypeScript resolves the default store/active.tsx for type-checking.
export type { StoreAdapter, AppState, AppActions, Row, TableState, CounterSlice, FilterSortSlice, SelectionSlice } from './types'
// The relative './active' import resolves to store/active.tsx, which is
// swapped by the webpack alias in next.config.mjs using its absolute path.
export { useAppStore, StoreProvider, useTableStore, useCounterSlice, useFilterSortSlice, useSelectionSlice } from './active'
