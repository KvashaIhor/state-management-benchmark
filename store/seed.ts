import type { Row } from './types'

const CATEGORIES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'] as const

/**
 * Generates a deterministic (non-random) set of rows.
 * Determinism is required for reproducible benchmark comparisons.
 */
export function generateRows(count = 100): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `row-${i}`,
    name: `Item ${String(i + 1).padStart(3, '0')}`,
    value: (i * 7919) % 1000, // deterministic large-prime modulo
    category: CATEGORIES[i % CATEGORIES.length],
    active: i % 3 !== 0,
  }))
}
