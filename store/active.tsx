// Default active store — used by TypeScript for type resolution.
// At build time next.config.mjs replaces this module with the
// library chosen by NEXT_PUBLIC_STATE_LIBRARY.
export { useAppStore, StoreProvider, useTableStore, useCounterSlice, useFilterSortSlice, useSelectionSlice } from './context'
