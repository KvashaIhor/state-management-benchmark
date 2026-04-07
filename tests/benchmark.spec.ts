import { test, expect, type Page } from '@playwright/test'
import type { RenderRecord } from '@/components/render-tracker'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type WindowWithRecords = Window & { __renderRecords?: RenderRecord[] }

/** Read render records injected by <RenderTracker> components */
async function getRenderRecords(page: Page): Promise<RenderRecord[]> {
  return page.evaluate(
    () => (window as WindowWithRecords).__renderRecords ?? [],
  )
}

/** Clear render records between scenarios */
async function clearRenderRecords(page: Page): Promise<void> {
  await page.evaluate(
    () => { (window as WindowWithRecords).__renderRecords = [] },
  )
}

function countRenders(records: RenderRecord[], id: string) {
  return records.filter((r) => r.id === id).length
}

/**
 * Approximates the render-span duration for a given component as the elapsed
 * time between the first and last RenderRecord timestamps (performance.now())
 * captured during a scenario. Returns 0 when fewer than 2 records are found.
 */
function getScenarioDuration(records: RenderRecord[], id: string): number {
  const filtered = records.filter((r) => r.id === id)
  if (filtered.length < 2) return 0
  return filtered[filtered.length - 1].timestamp - filtered[0].timestamp
}

/**
 * Returns t(0.975, df) for a two-sided 95% confidence interval.
 * Values from standard t-table; falls back to z=1.96 for df > 120.
 */
function tCrit(df: number): number {
  const table: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
    6: 2.447,  7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
    16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
    25: 2.060, 30: 2.042, 40: 2.021, 60: 2.000, 120: 1.980,
  }
  if (df in table) return table[df]
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b)
  for (let i = 0; i < keys.length - 1; i++) {
    if (keys[i] <= df && df <= keys[i + 1]) {
      const t = (df - keys[i]) / (keys[i + 1] - keys[i])
      return table[keys[i]] * (1 - t) + table[keys[i + 1]] * t
    }
  }
  return 1.96
}

/**
 * Computes mean [95% CI], median, Q1, Q3, and IQR for an array of numbers.
 * Used by the timing test suite to produce Table 4 values matching the paper.
 * The caller is expected to exclude warm-up runs before passing values here.
 */
function computeStats(values: number[]): { mean: number; ci: number; median: number; q1: number; q3: number; iqr: number } {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const mean = values.reduce((s, v) => s + v, 0) / n
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  const se = Math.sqrt(variance) / Math.sqrt(n)
  const ci = tCrit(n - 1) * se
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)]
  const q1 = sorted[Math.floor(n * 0.25)]
  const q3 = sorted[Math.floor(n * 0.75)]
  return { mean, ci, median, q1, q3, iqr: q3 - q1 }
}

/**
 * Deterministic Fisher–Yates shuffle using a linear-congruential PRNG seeded
 * with the run index.  Produces a distinct scenario order for each timing run,
 * distributing V8 JIT warm-up effects evenly across all scenarios (§III-D).
 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr]
  let s = seed | 0
  for (let i = result.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0
    const j = Math.abs(s) % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// Number of timing repetitions per scenario. Default 20 (matches paper §3.3, Table 4).
// Run 1 is excluded as warm-up; N=TIMING_RUNS-1 steady-state observations are used
// to compute mean [95% CI] per Kalibera and Jones [10].
// Set TIMING_RUNS=1 to skip timing replication (faster CI-only runs).
const TIMING_RUNS = parseInt(process.env.TIMING_RUNS ?? '20', 10)


const LIB = process.env.NEXT_PUBLIC_STATE_LIBRARY ?? 'context'

// ---------------------------------------------------------------------------
// Benchmark suite
// ---------------------------------------------------------------------------

test.describe(`[${LIB}] State Management Benchmarks`, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // waitForSelector finds the SSR-rendered table immediately, but React may
    // not have hydrated yet on slow CI runners (ubuntu 2-core). networkidle
    // confirms all JS chunks have loaded and executed before interactions start.
    await page.waitForLoadState('networkidle')
    await clearRenderRecords(page)
  })

  // ── RQ1: Re-render count for counter updates ────────────────────────────
  test('RQ1 — counter: 50 increments → render count', async ({ page }) => {
    const btn = page.getByTestId('increment')
    const t0 = Date.now()

    for (let i = 0; i < 50; i++) {
      await btn.click()
    }

    await expect(page.getByTestId('counter')).toHaveText('50')
    const wallMs = Date.now() - t0
    const records = await getRenderRecords(page)

    const dashboardRenders = countRenders(records, 'Dashboard')
    const tableRenders = countRenders(records, 'DataTable')
    const tableSpanMs = getScenarioDuration(records, 'DataTable')

    console.log(`
[${LIB}] counter — 50 increments
  Dashboard renders : ${dashboardRenders}
  DataTable renders : ${tableRenders}  ← ideally 0 (counter doesn't affect table)
  DataTable span    : ${tableSpanMs.toFixed(1)} ms (render-span from first to last record)
  Wall-clock        : ${wallMs} ms`)

    // DataTable should NOT re-render when only the counter changes.
    // This is the key differentiator: selector-based libraries (Redux, Zustand,
    // Jotai) subscribe per-field and skip renders when counter changes;
    // Context re-renders all consumers on any context value change.
    expect(dashboardRenders).toBe(50)
    if (LIB === 'context') {
      expect(tableRenders).toBe(50) // Context cannot scope below full StateCtx
    } else {
      expect(tableRenders).toBe(0)  // Redux/Zustand/Jotai skip counter renders
    }
  })

  // ── RQ2: Re-render count for filter changes ─────────────────────────────
  test('RQ2 — filter: typing 5 chars → render count', async ({ page }) => {
    const input = page.getByTestId('filter')
    const t0 = Date.now()
    await input.pressSequentially('Alpha', { delay: 50 })
    const wallMs = Date.now() - t0

    const records = await getRenderRecords(page)

    const dashboardRenders = countRenders(records, 'Dashboard')
    const tableRenders = countRenders(records, 'DataTable')
    const tableSpanMs = getScenarioDuration(records, 'DataTable')

    console.log(`
[${LIB}] filter — typing "Alpha" (5 keystrokes)
  Dashboard renders : ${dashboardRenders}
  DataTable renders : ${tableRenders}
  DataTable span    : ${tableSpanMs.toFixed(1)} ms
  Wall-clock        : ${wallMs} ms`)

    expect(dashboardRenders).toBe(5) // Dashboard re-renders once per keystroke
    expect(tableRenders).toBe(5)     // one render per keystroke (sequential, not batched)
  })

  // ── RQ3: Re-render count for row selection ───────────────────────────────
  test('RQ3 — selection: clicking 20 rows → render count', async ({ page }) => {
    const t0 = Date.now()
    for (let i = 0; i < 20; i++) {
      await page.getByTestId(`row-row-${i}`).click()
    }

    await expect(page.getByTestId('selected-count')).toHaveText('Selected: 20')
    const wallMs = Date.now() - t0
    const records = await getRenderRecords(page)

    const dashboardRenders = countRenders(records, 'Dashboard')
    const tableRenders = countRenders(records, 'DataTable')
    const tableSpanMs = getScenarioDuration(records, 'DataTable')

    console.log(`
[${LIB}] selection — 20 row clicks
  Dashboard renders : ${dashboardRenders}
  DataTable renders : ${tableRenders}
  DataTable span    : ${tableSpanMs.toFixed(1)} ms
  Wall-clock        : ${wallMs} ms`)

    expect(dashboardRenders).toBe(20) // Dashboard re-renders once per selection change
    expect(tableRenders).toBe(20)     // one render per row click
  })

  // ── RQ4: Sort direction toggle ───────────────────────────────────────────
  test('RQ4 — sort: 10 direction toggles → render count', async ({ page }) => {
    const btn = page.getByTestId('sort-dir')
    const t0 = Date.now()

    for (let i = 0; i < 10; i++) {
      await btn.click()
    }

    const wallMs = Date.now() - t0
    const records = await getRenderRecords(page)
    const dashboardRenders = countRenders(records, 'Dashboard')
    const tableRenders = countRenders(records, 'DataTable')
    const tableSpanMs = getScenarioDuration(records, 'DataTable')

    console.log(`
[${LIB}] sort — 10 direction toggles
  Dashboard renders : ${dashboardRenders}
  DataTable renders : ${tableRenders}
  DataTable span    : ${tableSpanMs.toFixed(1)} ms
  Wall-clock        : ${wallMs} ms`)

    expect(dashboardRenders).toBe(10) // Dashboard re-renders once per sort toggle
    expect(tableRenders).toBe(10)     // one render per toggle
  })

  // ── RQ5: Row dataset refresh ─────────────────────────────────────────────
  test('RQ5 — rows: 5 dataset refreshes → render count', async ({ page }) => {
    const btn = page.getByTestId('refresh-rows')
    const t0 = Date.now()

    for (let i = 0; i < 5; i++) {
      await btn.click()
    }

    const wallMs = Date.now() - t0
    const records = await getRenderRecords(page)
    const dashboardRenders = countRenders(records, 'Dashboard')
    const tableRenders = countRenders(records, 'DataTable')
    const tableSpanMs = getScenarioDuration(records, 'DataTable')

    console.log(`
[${LIB}] rows — 5 dataset refreshes
  Dashboard renders : ${dashboardRenders}
  DataTable renders : ${tableRenders}  ← all libraries subscribe to rows; all re-render
  DataTable span    : ${tableSpanMs.toFixed(1)} ms
  Wall-clock        : ${wallMs} ms`)

    // All four libraries subscribe to rows in useTableStore().
    // refreshRows() replaces the array reference → all implementations re-render.
    // This exercises the rows subscription path, which RQ1–RQ4 leave unexercised.
    expect(dashboardRenders).toBe(5)
    expect(tableRenders).toBe(5)
  })

  // ── RQ6: Render isolation across a 3-level component tree ────────────────
  //
  // Tree topology: Shell (root) → Panel (middle, no React.memo) → DataTable (leaf, React.memo)
  // Route: /nested  (served by app/nested/page.tsx → NestedDashboard component)
  //
  // The question: when an intermediate component layer does NOT have React.memo,
  // does render isolation at the leaf still hold? This directly addresses the
  // "shallow 2-component tree" threat to external validity raised in §5.4.
  test('RQ6 — nested tree: 50 counter increments → isolation at leaf (depth 3)', async ({ page }) => {
    // Navigate to the 3-level nested tree route (overrides the '/' loaded in beforeEach).
    await page.goto('/nested')
    await page.waitForLoadState('networkidle')
    await clearRenderRecords(page)

    const btn = page.getByTestId('increment')
    const t0 = Date.now()

    for (let i = 0; i < 50; i++) {
      await btn.click()
    }

    await expect(page.getByTestId('counter')).toHaveText('50')
    const wallMs = Date.now() - t0
    const records = await getRenderRecords(page)

    const shellRenders  = countRenders(records, 'Shell')
    const panelRenders  = countRenders(records, 'Panel')
    const tableRenders  = countRenders(records, 'DataTable')
    const tableSpanMs   = getScenarioDuration(records, 'DataTable')

    console.log(`
[${LIB}] nested counter — 50 increments (Shell → Panel → DataTable, depth 3)
  Shell renders     : ${shellRenders}   ← uses useAppStore(); re-renders on every counter change
  Panel renders     : ${panelRenders}   ← no React.memo; cascades from Shell's 50 re-renders
  DataTable renders : ${tableRenders}  ← React.memo leaf; ideally 0 for selector-based libs
  DataTable span    : ${tableSpanMs.toFixed(1)} ms
  Wall-clock        : ${wallMs} ms`)

    // Shell subscribes to full AppState via useAppStore() → 50 re-renders.
    expect(shellRenders).toBe(50)

    // Panel has NO React.memo and no props from Shell — React's reconciliation
    // cascade enters Panel's render function on every Shell re-render.
    expect(panelRenders).toBe(50)

    // DataTable is React.memo-wrapped with zero props. Even though Panel re-renders,
    // React's memo bail-out prevents DataTable's render body from executing when
    // neither props nor useTableStore() output changed.
    // For Context, useTableStore() reads useContext(StateCtx) which fires on every
    // dispatch regardless of which field changed → 50 DataTable renders.
    if (LIB === 'context') {
      expect(tableRenders).toBe(50)
    } else {
      expect(tableRenders).toBe(0)
    }
  })

  // ── RQ7: Single-field row patch ──────────────────────────────────────────
  //
  // Addresses reviewer Q3: RQ5 tests reference-identity propagation only
  // (refreshRows() replaces the array with value-identical rows). RQ7 tests
  // a realistic partial update: patching a single field on one row.
  //
  // The Dashboard button calls patchRow('row-0', { value: current + 1 }).
  // All four libraries subscribe to the `rows` array reference in useTableStore();
  // every patchRow call replaces the array reference → one DataTable re-render
  // per patch regardless of immer structural sharing (Redux) or direct-replace
  // semantics (Zustand, Jotai, Context). Expected count: 10 for all libraries.
  test('RQ7 — partial row patch: 10 single-field patches → render count', async ({ page }) => {
    const btn = page.getByTestId('patch-row-btn')
    const t0 = Date.now()

    for (let i = 0; i < 10; i++) {
      await btn.click()
    }

    // row-0 starts with value=0 (from seed: (0 * 7919) % 1000 = 0).
    // After 10 patches incrementing value by 1, the value cell should read '10'.
    // This serves as a synchronisation barrier confirming all 10 state updates committed.
    await expect(
      page.locator('[data-testid="row-row-0"] td').nth(2)
    ).toHaveText('10')

    const wallMs = Date.now() - t0
    const records = await getRenderRecords(page)

    const dashboardRenders = countRenders(records, 'Dashboard')
    const tableRenders = countRenders(records, 'DataTable')
    const tableSpanMs = getScenarioDuration(records, 'DataTable')

    console.log(`
[${LIB}] patch — 10 single-field patches (row-0 value++)
  Dashboard renders : ${dashboardRenders}
  DataTable renders : ${tableRenders}  ← all libraries subscribe to rows ref; all re-render
  DataTable span    : ${tableSpanMs.toFixed(1)} ms
  Wall-clock        : ${wallMs} ms
  Note: Redux immer preserves unchanged row object references (structural sharing),
        but DataTable subscribes to the rows *array* reference not individual rows.
        A single-field patch replaces the array ref in all four libraries → 10 renders.`)

    expect(dashboardRenders).toBe(10)
    expect(tableRenders).toBe(10) // identical across all four libraries
  })

  // ── RQ8: K-consumer fan-out ──────────────────────────────────────────────
  //
  // Empirically validates the K×N fan-out claim from §V-A: when K consumers
  // subscribe to the same store slice and an unrelated state field changes,
  //   Context:              total surplus renders = K × N  (broadcasts to all)
  //   Redux/Zustand/Jotai:  total surplus renders = 0      (field-level select)
  //
  // Route: /k-consumer?k=K  (served by app/k-consumer/page.tsx)
  // Each DataTable instance is tracked as DataTable-0 … DataTable-(K-1).
  // ---------------------------------------------------------------------------

  test('RQ8-K3 — 3 consumers, 50 counter increments → total surplus render count', async ({ page }) => {
    const K = 3
    await page.goto(`/k-consumer?k=${K}`)
    await page.waitForLoadState('networkidle')
    await clearRenderRecords(page)

    const btn = page.getByTestId('increment')
    for (let i = 0; i < 50; i++) await btn.click()
    await expect(page.getByTestId('counter')).toHaveText('50')

    const records = await getRenderRecords(page)
    const perConsumer = Array.from({ length: K }, (_, i) => countRenders(records, `DataTable-${i}`))
    const totalSurplus = perConsumer.reduce((s, n) => s + n, 0)

    console.log(`
[${LIB}] RQ8 K=${K}, 50 counter increments
  Per-consumer renders : ${perConsumer.join(', ')}
  Total surplus        : ${totalSurplus}  ← Context: K×50=${K * 50}; others: 0`)

    // K consumers × 50 irrelevant increments = K×50 total surplus for Context
    if (LIB === 'context') {
      expect(totalSurplus).toBe(K * 50)  // 150
    } else {
      expect(totalSurplus).toBe(0)
    }
  })

  test('RQ8-K10 — 10 consumers, 50 counter increments → total surplus render count', async ({ page }) => {
    const K = 10
    await page.goto(`/k-consumer?k=${K}`)
    await page.waitForLoadState('networkidle')
    await clearRenderRecords(page)

    const btn = page.getByTestId('increment')
    for (let i = 0; i < 50; i++) await btn.click()
    await expect(page.getByTestId('counter')).toHaveText('50')

    const records = await getRenderRecords(page)
    const perConsumer = Array.from({ length: K }, (_, i) => countRenders(records, `DataTable-${i}`))
    const totalSurplus = perConsumer.reduce((s, n) => s + n, 0)

    console.log(`
[${LIB}] RQ8 K=${K}, 50 counter increments
  Per-consumer renders : ${perConsumer.join(', ')}
  Total surplus        : ${totalSurplus}  ← Context: K×50=${K * 50}; others: 0`)

    if (LIB === 'context') {
      expect(totalSurplus).toBe(K * 50)  // 500
    } else {
      expect(totalSurplus).toBe(0)
    }
  })

  // ── RQ9: Render isolation across a 5-level component tree ────────────────
  //
  // Tree topology: DeepShell → Layer1 → Layer2 → Layer3 → DataTable (leaf)
  // All intermediate layers (Layer1–Layer3) are intentionally NOT wrapped in
  // React.memo, so Shell's re-renders cascade to all intermediate layers.
  //
  // RQ6 confirmed isolation at depth-3. RQ9 tests whether it holds at depth-5.
  // The hypothesis is the same: React.memo at the leaf is sufficient regardless
  // of tree depth, as long as no new prop references are passed down the chain.
  //
  // Route: /deep  (served by app/deep/page.tsx → DeepTreeDashboard)
  //
  // Expected counts (50 counter increments):
  //   DeepShell: 50, Layer1: 50, Layer2: 50, Layer3: 50
  //   DataTable:  0 (selector-based) | 50 (Context)
  test('RQ9 — deep tree: 50 counter increments → isolation at leaf (depth 5)', async ({ page }) => {
    await page.goto('/deep')
    await page.waitForLoadState('networkidle')
    await clearRenderRecords(page)

    const btn = page.getByTestId('increment')
    for (let i = 0; i < 50; i++) {
      await btn.click()
    }

    await expect(page.getByTestId('counter')).toHaveText('50')
    const records = await getRenderRecords(page)

    const shellRenders  = countRenders(records, 'DeepShell')
    const layer1Renders = countRenders(records, 'Layer1')
    const layer2Renders = countRenders(records, 'Layer2')
    const layer3Renders = countRenders(records, 'Layer3')
    const tableRenders  = countRenders(records, 'DataTable')

    console.log(`
[${LIB}] RQ9 deep tree — 50 increments (DeepShell → Layer1 → Layer2 → Layer3 → DataTable, depth 5)
  DeepShell renders : ${shellRenders}
  Layer1 renders    : ${layer1Renders}
  Layer2 renders    : ${layer2Renders}
  Layer3 renders    : ${layer3Renders}
  DataTable renders : ${tableRenders}  ← ideally 0 for selector-based libs`)

    expect(shellRenders).toBe(50)
    expect(layer1Renders).toBe(50)
    expect(layer2Renders).toBe(50)
    expect(layer3Renders).toBe(50)

    if (LIB === 'context') {
      expect(tableRenders).toBe(50)
    } else {
      expect(tableRenders).toBe(0)
    }
  })
})

// ---------------------------------------------------------------------------
// RQ10: Jotai atom families — per-row render isolation
//
// This test is library-independent: it always runs against the /atom-family
// route which uses the dedicated jotai-atoms store variant regardless of the
// currently active NEXT_PUBLIC_STATE_LIBRARY build.
//
// Hypothesis: patching a single row's value field re-renders ONLY the RowCell
// component subscribed to that row's atom. All other RowCell components and
// the AtomTable wrapper should produce 0 re-renders per patch.
//
// Comparison baseline: in the shared-StoreAdapter tests (RQ7), all four
// libraries re-render the entire DataTable (100 rows worth of reconciliation)
// on every single-field patch, because useTableStore() subscribes to the
// rows *array* reference. Jotai atom families break this by moving subscription
// to the individual row level.
// ---------------------------------------------------------------------------
test.describe('RQ10 — Jotai atom families: per-row render isolation', () => {
  test('RQ10 — 10 patches on row-0 → only RowCell-row-0 re-renders', async ({ page }) => {
    await page.goto('/atom-family')
    await page.waitForLoadState('networkidle')
    await clearRenderRecords(page)

    const btn = page.getByTestId('atom-patch-btn')
    for (let i = 0; i < 10; i++) {
      await btn.click()
    }

    // Synchronisation barrier: row-0 value should be 10 after 10 patches
    await expect(page.getByTestId('atom-row-0-value')).toHaveText('10')

    const records = await getRenderRecords(page)

    const tableWrapperRenders = countRenders(records, 'AtomTable')
    const patchedRowRenders   = countRenders(records, 'RowCell-row-0')
    // Sample three unpatched rows to confirm they did not re-render
    const unpatched1 = countRenders(records, 'RowCell-row-1')
    const unpatched2 = countRenders(records, 'RowCell-row-50')
    const unpatched3 = countRenders(records, 'RowCell-row-99')
    // Count total re-renders across all RowCell components
    const totalRowRenders = records.filter((r) => r.id.startsWith('RowCell-')).length

    console.log(`
[RQ10] Jotai atom families — 10 patches on row-0
  AtomTable wrapper   : ${tableWrapperRenders}  ← should be 0 (stable rowIds)
  RowCell-row-0       : ${patchedRowRenders}  ← should be 10 (patched row)
  RowCell-row-1       : ${unpatched1}  ← should be 0 (unpatched)
  RowCell-row-50      : ${unpatched2}  ← should be 0 (unpatched)
  RowCell-row-99      : ${unpatched3}  ← should be 0 (unpatched)
  Total RowCell renders: ${totalRowRenders}  ← should be 10 (only patched row)`)

    // Table wrapper should not re-render — it only reads stable rowIds atom
    expect(tableWrapperRenders).toBe(0)
    // Only the patched row re-renders — once per patch
    expect(patchedRowRenders).toBe(10)
    // Unpatched rows stay at 0
    expect(unpatched1).toBe(0)
    expect(unpatched2).toBe(0)
    expect(unpatched3).toBe(0)
    // Total across all 100 rows: exactly 10 (only row-0 re-rendered)
    expect(totalRowRenders).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Render-span timing suite  (N=${TIMING_RUNS} independent runs per scenario)
// Reports mean [95% CI] across N runs for Table 4 of the paper (§3.3, §4.2).
// Run 0 (first iteration) is excluded as JIT warm-up; N=TIMING_RUNS-1 steady-state
// observations are used to compute mean ± t * (sd/√n) per Kalibera & Jones [10].
// These tests do not assert render counts — exact counts are validated above.
// Set TIMING_RUNS=1 to skip timing replication (faster CI runs); default is 20 (matches paper).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Render-span timing suite  (N=${TIMING_RUNS} independent runs, scenario order randomized)
//
// All five RQ scenarios are executed in a fresh order each run, seeded by the
// run index.  This eliminates the fixed-order V8 JIT confound that would arise
// when RQ1 always warms up the engine before RQ2 is measured (§III-D).
//
// Run 0 of each scenario is treated as the cross-scenario JIT warm-up and
// excluded from statistics; N=TIMING_RUNS-1 steady-state observations produce
// mean ± t(0.975,N-2)·(sd/√(N-1)) per Kalibera & Jones [10].
//
// Set TIMING_RUNS=1 to skip timing replication (faster CI-only runs).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// RQ11–RQ13: Multi-panel topology — cross-slice render isolation
//
// Route: /multi-panel  (MultiPanelDashboard with three independently memoised panels)
//
//   PanelA → useCounterSlice():    re-renders ONLY when counter changes
//   PanelB → useFilterSortSlice(): re-renders ONLY when filter/sort/rows change
//   PanelC → useSelectionSlice():  re-renders ONLY when selectedIds changes
//
// For selector-based libraries, a mutation to slice X must not trigger a
// re-render in panels subscribing to slices Y or Z.  This directly addresses
// the external-validity concern raised in §5.4: isolation generalises beyond
// the two-component Dashboard+DataTable topology to three genuinely disjoint
// subscriptions in a multi-panel, production-like layout.
//
// For Context (all-or-nothing subscription), ALL three panels re-render on
// every state mutation regardless of which slice changed.
//
// Valtio/MobX: with React Compiler DISABLED (baseline), isolation holds via
// per-instance prevValue gates (Valtio) and reaction() field tracking (MobX).
// With Compiler ENABLED, Valtio/MobX over-memoise — panels that should
// re-render produce zero renders — confirming proxy incompatibility in a
// multi-panel topology (RQ12 ext., reported in app:compiler appendix).
// ---------------------------------------------------------------------------

test.describe(`[${LIB}] Multi-panel cross-slice isolation (RQ11--RQ13)`, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/multi-panel')
    await page.waitForLoadState('networkidle')
    await clearRenderRecords(page)
  })

  // ── RQ11: counter increments → ONLY PanelA re-renders ────────────────────
  test('RQ11 — counter: 50 increments → PanelA=50, PanelB=0, PanelC=0', async ({ page }) => {
    const btn = page.getByTestId('mp-increment')
    const t0 = Date.now()
    for (let i = 0; i < 50; i++) await btn.click()
    // PanelA subscribes to counter and will display the updated value.
    await expect(page.getByTestId('mp-counter-value')).toHaveText('50')
    const wallMs = Date.now() - t0
    const records = await getRenderRecords(page)

    const panelA = countRenders(records, 'PanelA')
    const panelB = countRenders(records, 'PanelB')
    const panelC = countRenders(records, 'PanelC')

    console.log(`
[${LIB}] RQ11 multi-panel counter — 50 increments
  PanelA renders : ${panelA}  ← subscribed to counter; should be 50
  PanelB renders : ${panelB}  ← subscribed to filter/sort/rows; should be 0 (selector-based)
  PanelC renders : ${panelC}  ← subscribed to selection; should be 0 (selector-based)
  Wall-clock     : ${wallMs} ms`)

    expect(panelA).toBe(50)
    if (LIB === 'context') {
      expect(panelB).toBe(50)
      expect(panelC).toBe(50)
    } else {
      expect(panelB).toBe(0)
      expect(panelC).toBe(0)
    }
  })

  // ── RQ12: filter changes → ONLY PanelB re-renders ────────────────────────
  test('RQ12 — filter: typing 5 chars → PanelA=0, PanelB=5, PanelC=0', async ({ page }) => {
    const input = page.getByTestId('mp-filter')
    const t0 = Date.now()
    await input.pressSequentially('Alpha', { delay: 50 })
    const wallMs = Date.now() - t0
    const records = await getRenderRecords(page)

    const panelA = countRenders(records, 'PanelA')
    const panelB = countRenders(records, 'PanelB')
    const panelC = countRenders(records, 'PanelC')

    console.log(`
[${LIB}] RQ12 multi-panel filter — typing "Alpha" (5 keystrokes)
  PanelA renders : ${panelA}  ← subscribed to counter; should be 0 (selector-based)
  PanelB renders : ${panelB}  ← subscribed to filter/sort/rows; should be 5
  PanelC renders : ${panelC}  ← subscribed to selection; should be 0 (selector-based)
  Wall-clock     : ${wallMs} ms`)

    expect(panelB).toBe(5)
    if (LIB === 'context') {
      expect(panelA).toBe(5)
      expect(panelC).toBe(5)
    } else {
      expect(panelA).toBe(0)
      expect(panelC).toBe(0)
    }
  })

  // ── RQ13: selection changes → ONLY PanelC re-renders ─────────────────────
  test('RQ13 — selection: 20 row-0 toggles → PanelA=0, PanelB=0, PanelC=20', async ({ page }) => {
    const btn = page.getByTestId('mp-select-row-0')
    const t0 = Date.now()
    for (let i = 0; i < 20; i++) await btn.click()
    // After 20 toggles (even), row-0 returns to deselected; PanelC recorded 20 renders.
    const wallMs = Date.now() - t0
    const records = await getRenderRecords(page)

    const panelA = countRenders(records, 'PanelA')
    const panelB = countRenders(records, 'PanelB')
    const panelC = countRenders(records, 'PanelC')

    console.log(`
[${LIB}] RQ13 multi-panel selection — 20 row-0 toggles
  PanelA renders : ${panelA}  ← subscribed to counter; should be 0 (selector-based)
  PanelB renders : ${panelB}  ← subscribed to filter/sort/rows; should be 0 (selector-based)
  PanelC renders : ${panelC}  ← subscribed to selection; should be 20
  Wall-clock     : ${wallMs} ms`)

    expect(panelC).toBe(20)
    if (LIB === 'context') {
      expect(panelA).toBe(20)
      expect(panelB).toBe(20)
    } else {
      expect(panelA).toBe(0)
      expect(panelB).toBe(0)
    }
  })
})

test.describe(`[${LIB}] Render-span timing (N=${TIMING_RUNS} runs, order randomized)`, () => {
  type ScenarioKey = 'RQ1' | 'RQ2' | 'RQ3' | 'RQ4' | 'RQ5'

  test('Timing — RQ1–RQ5 DataTable spans (randomized scenario order)', async ({ page }) => {
    // Each scenario navigates fresh, clears records, runs its interactions,
    // and returns the DataTable render-span (performance.now() spread).
    const SCENARIO_FNS: Array<{ key: ScenarioKey; run: (p: Page) => Promise<number> }> = [
      {
        key: 'RQ1',
        run: async (p) => {
          await p.goto('/')
          await p.waitForLoadState('networkidle')
          await clearRenderRecords(p)
          const btn = p.getByTestId('increment')
          for (let i = 0; i < 50; i++) await btn.click()
          await expect(p.getByTestId('counter')).toHaveText('50')
          return getScenarioDuration(await getRenderRecords(p), 'DataTable')
        },
      },
      {
        key: 'RQ2',
        run: async (p) => {
          await p.goto('/')
          await p.waitForLoadState('networkidle')
          await clearRenderRecords(p)
          await p.getByTestId('filter').pressSequentially('Alpha', { delay: 50 })
          return getScenarioDuration(await getRenderRecords(p), 'DataTable')
        },
      },
      {
        key: 'RQ3',
        run: async (p) => {
          await p.goto('/')
          await p.waitForLoadState('networkidle')
          await clearRenderRecords(p)
          for (let i = 0; i < 20; i++) await p.getByTestId(`row-row-${i}`).click()
          await expect(p.getByTestId('selected-count')).toHaveText('Selected: 20')
          return getScenarioDuration(await getRenderRecords(p), 'DataTable')
        },
      },
      {
        key: 'RQ4',
        run: async (p) => {
          await p.goto('/')
          await p.waitForLoadState('networkidle')
          await clearRenderRecords(p)
          const btn = p.getByTestId('sort-dir')
          for (let i = 0; i < 10; i++) await btn.click()
          return getScenarioDuration(await getRenderRecords(p), 'DataTable')
        },
      },
      {
        key: 'RQ5',
        run: async (p) => {
          await p.goto('/')
          await p.waitForLoadState('networkidle')
          await clearRenderRecords(p)
          const btn = p.getByTestId('refresh-rows')
          for (let i = 0; i < 5; i++) await btn.click()
          return getScenarioDuration(await getRenderRecords(p), 'DataTable')
        },
      },
    ]

    const spansByKey: Record<ScenarioKey, number[]> = { RQ1: [], RQ2: [], RQ3: [], RQ4: [], RQ5: [] }

    for (let run = 0; run < TIMING_RUNS; run++) {
      // Deterministic per-run order: run 0 = warm-up (all code paths exercised);
      // runs 1..N-1 are steady-state with a distinct scenario order each time.
      const orderedScenarios = seededShuffle(SCENARIO_FNS, run)
      for (const scenario of orderedScenarios) {
        spansByKey[scenario.key].push(await scenario.run(page))
      }
    }

    // Report per-scenario statistics excluding run 0 (warm-up) for each key.
    const keys: ScenarioKey[] = ['RQ1', 'RQ2', 'RQ3', 'RQ4', 'RQ5']
    for (const key of keys) {
      const steadySpans = spansByKey[key].slice(1)  // exclude warm-up run 0
      const { mean, ci, median, q1, q3, iqr } = computeStats(steadySpans)
      console.log(`\n[${LIB}] TIMING ${key} DataTable render-span  N=${TIMING_RUNS} total, N=${steadySpans.length} steady-state:  mean=${mean.toFixed(1)}ms  95%CI=[${(mean - ci).toFixed(1)},${(mean + ci).toFixed(1)}]  median=${median.toFixed(1)}ms  IQR=±${iqr.toFixed(1)}ms  raw=[${steadySpans.map((s) => s.toFixed(1)).join(',')}]`)
    }
  })
})

