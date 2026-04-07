# State Management Benchmark

## Context

This project is the **empirical infrastructure** for an academic research paper:

> **"Measuring the Cost of State: A Comparative Analysis of Redux, Zustand, Jotai, and React Context in Large-Scale React Applications"**

The paper is being written solo for inclusion on a developer resume. It targets a computer science / software engineering conference or journal (IEEE / ACM style). The goal is to provide data-driven, reproducible evidence for a question practitioners face constantly: *which React state management library should I use, and what does the choice actually cost?*

---

## Paper Summary

### Research Questions

| RQ | Question |
|----|----------|
| RQ1 | How does gzipped bundle size differ across Redux Toolkit, Zustand, Jotai, and React Context? |
| RQ2 | Which library causes the fewest unnecessary re-renders under identical state topology? |
| RQ3 | What is the memory cost of each approach under high-frequency state updates? |
| RQ4 | How do render counts and durations compare across different interaction types (counter updates, filtering, row selection, sorting)? |

### Libraries Under Test

| Library | Version | Paradigm |
|---------|---------|----------|
| Redux Toolkit | ^2.5.0 | Centralized flux store |
| Zustand | ^5.0.0 | External subscription store |
| Jotai | ^2.11.0 | Atomic state |
| React Context + useReducer | built-in | Built-in coarse-grained context |

### Methodology

- **Benchmark app**: A realistic dashboard with a 100-row data table, filter input, sort controls, row selection, and a live counter.
- **Deterministic data**: `store/seed.ts` generates the same 100 rows every time (large-prime modulo, no `Math.random()`).
- **Same UI across all variants**: All four libraries implement the same `StoreAdapter` interface (`store/types.ts`), so the React component tree is byte-for-byte identical. Differences in results are attributable only to the state layer.
- **Build-time library swapping**: `next.config.mjs` uses a webpack alias (`@/store/active`) resolved via `NEXT_PUBLIC_STATE_LIBRARY` env var. This enables genuine tree-shaking of unused libraries.
- **Render tracking**: `components/render-tracker.tsx` wraps components in a `useEffect`-based commit counter (no dependency array) and appends records to `window.__renderRecords`, which Playwright reads via `page.evaluate()`. Note: React's `<Profiler>` API was originally used but was replaced because `Profiler.onRender` is stripped in standard `react-dom` production builds (see Engineering Log).
- **Playwright scripted interactions**: All benchmark scenarios are automated — no human timing required.
- **Bundle analysis**: `@next/bundle-analyzer` + `find .next/static/chunks` for gzipped sizes.

### Planned Paper Sections

1. **Abstract** — brief summary of motivation, method, key findings (~200 words)
2. **Introduction** — the state management fragmentation problem, gap in empirical literature, contributions
3. **Related Work** — prior React perf studies, existing non-empirical comparisons (blog posts)
4. **Methodology** — benchmark app design, metrics, tools, reproducibility
5. **Results** — tables: bundle sizes, render counts per RQ; figures: render timeline charts
6. **Discussion** — which library wins in which scenario, atomic vs. coarse-grained tradeoffs, React 19 compiler implications
7. **Conclusion** — recommendation matrix by app scale, future work (Valtio, MobX, TanStack Store)

---

## Project Structure

```
state-management-benchmark/
├── package.json
├── tsconfig.json
├── next.config.mjs          ← webpack alias swaps active store at build time
├── playwright.config.ts
├── store/
│   ├── types.ts              ← shared AppState / AppActions / StoreAdapter interfaces
│   ├── seed.ts               ← deterministic 100-row dataset (no Math.random)
│   ├── index.ts              ← public re-export API
│   ├── active.tsx            ← TypeScript default; replaced by alias at build time
│   ├── redux/index.tsx       ← Redux Toolkit implementation
│   ├── zustand/index.tsx     ← Zustand implementation
│   ├── jotai/index.tsx       ← Jotai atomic implementation
│   └── context/index.tsx     ← React Context + useReducer implementation
├── components/
│   ├── render-tracker.tsx    ← useEffect commit counter → window.__renderRecords
│   ├── dashboard.tsx         ← top-level UI (header, filter, sort controls)
│   └── data-table.tsx        ← 100-row table with selection
├── app/
│   ├── layout.tsx            ← wraps children in <StoreProvider>
│   └── page.tsx
├── tests/
│   └── benchmark.spec.ts     ← Playwright: 4 RQ scenarios, reads render records
├── scripts/
│   └── run-benchmarks.sh     ← builds all 4 variants, runs tests, emits CSV
└── results/                  ← gitignored; created by run-benchmarks.sh
    ├── bundle-sizes.csv
    ├── build-{lib}.log
    └── playwright-{lib}.log
```

---

## Running the Benchmarks

```bash
# Install dependencies
pnpm install
pnpm playwright install chromium

# Run all 4 libraries end-to-end (builds + Playwright tests):
pnpm benchmark

# Run a single library in dev mode for inspection:
NEXT_PUBLIC_STATE_LIBRARY=redux pnpm dev
# then open http://localhost:3000

# Run Playwright against a running dev server:
NEXT_PUBLIC_STATE_LIBRARY=zustand pnpm dev &
pnpm test:e2e

# Analyze bundle composition visually:
NEXT_PUBLIC_STATE_LIBRARY=jotai ANALYZE=true pnpm build
```

---

## Key Design Decisions

**Why a webpack alias instead of 4 separate apps?**
A single codebase with a build-time switch ensures the UI layer is identical. Four separate apps would introduce accidental differences in non-state code.

**Why deterministic seed data?**
`Math.random()` would produce different rows on each build, making render count comparisons unreliable. The seed uses `(i * 7919) % 1000` — a large prime ensures good value distribution without randomness.

**Why split State and Dispatch contexts in the Context implementation?**
The React Context variant uses two separate contexts (`StateCtx` + `DispatchCtx`) following React best practices. A single combined context would cause every consumer to re-render on any state change, which would be an unfair worst-case representation of the pattern.

**Why are Zustand subscriptions split in `useAppStore`?**
State and actions are subscribed via two separate `useStore` selectors to prevent action reference changes from triggering re-renders. This reflects idiomatic production usage.

---

## Current Status

- [x] Project scaffolded (Next.js 15, React 19, TypeScript)
- [x] All 4 store implementations complete
- [x] Shared UI components with render tracking
- [x] Playwright benchmark suite (4 RQs)
- [x] Automated benchmark runner script
- [x] First full benchmark run — all 16 tests pass (4 libraries × 4 RQs)
- [x] Webpack alias fixed (absolute-path key) — each build now loads the correct library
- [x] Bundle-size measurement fixed (per-route delta from `next build` stdout)
- [x] Zustand v5 infinite re-render bug fixed (`useShallow`)
- [x] RQ1 render differentiation fixed (`useTableStore` granular hook + `React.memo`)
- [x] All 16/16 tests passing with meaningful, differentiated results
- [ ] Analyse results and produce paper tables / figures
- [ ] Write paper sections

### Final Benchmark Results (run 2026-04-02)

#### Bundle overhead (First Load JS − 102 KB shared runtime)

| Library | First Load JS | **Library Delta** | Gzip Total |
|---------|:-------------:|:-----------------:|:----------:|
| Redux Toolkit | 112 KB | **+10.0 KB** | 245.4 KB |
| Jotai | 108 KB | **+6.0 KB** | 241.1 KB |
| Zustand | 104 KB | **+2.0 KB** | 238.1 KB |
| React Context | 104 KB | **+2.0 KB** | 237.4 KB |

Redux carries the largest library overhead (+10 KB) due to Redux Toolkit's dispatcher and
middleware infrastructure. Jotai adds a moderate +6 KB for its atomic scheduler. Zustand
and Context are indistinguishable at this resolution (+2 KB each — Zustand's runtime is
bundled into the route chunk rather than a separate async chunk).

#### DataTable re-render counts

All 16 tests pass. `DataTable` is wrapped in `React.memo` and uses `useTableStore()` —
a granular hook that subscribes only to table-relevant state (no counter subscription).

| Scenario | Redux | Zustand | Jotai | **Context** |
|----------|:-----:|:-------:|:-----:|:-----------:|
| **RQ1** — counter: 50 increments | **0** | **0** | **0** | **50** |
| **RQ2** — filter: 5 chars typed | 5 | 5 | 5 | 5 |
| **RQ3** — selection: 20 row clicks | 20 | 20 | 20 | 20 |
| **RQ4** — sort: 10 dir toggles | 10 | 10 | 10 | 10 |

**Key RQ1 finding:** React Context propagates every state change — including those
irrelevant to the subscribing component — to all `useContext` consumers. Even with
`React.memo` and a granular `useTableStore()` hook, `DataTable` still re-renders 50×
when the counter increments, because `useContext(StateCtx)` fires whenever the context
_value reference_ changes. Redux, Zustand, and Jotai all achieve 0 DataTable re-renders
via per-field selectors / per-atom subscriptions that skip renders when unrelated slices
change.

RQ2–RQ4 are identical across all libraries: every library correctly re-renders the table
exactly as many times as there are relevant state changes, confirming correctness.

---

---

## Engineering Log

This section documents every non-trivial technical decision and bug encountered during the first benchmark run (2 April 2026). It exists to support accurate Methodology and Limitations sections in the paper.

---

### [2026-04-02] Fix: ESLint `react-refresh/only-export-components` in `app/layout.tsx`

**File:** `app/layout.tsx`

**Problem:** The production build failed with:
```
4:14  Error: Fast refresh only works when a file only exports components.
      Use a new file to share constants or functions between components.
      react-refresh/only-export-components
```
The ESLint rule `react-refresh/only-export-components` flagged `export const metadata` as a non-component export coexisting with the default component export.

**Root cause:** `react-refresh` does not recognise Next.js App Router special exports (like `metadata`, `generateMetadata`, `viewport`) as valid non-component exports. The rule is correct in general React codebases but produces a false positive here.

**Fix:** Added `// eslint-disable-next-line react-refresh/only-export-components` immediately above the `metadata` export. This is the idiomatic solution for Next.js App Router projects.

**Paper note:** Not relevant to methodology. Infrastructure-only fix.

---

### [2026-04-02] Fix: Playwright Chromium binary missing

**Problem:** All 4 tests failed immediately with:
```
Error: browserType.launch: Executable doesn't exist at
  .../chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell
```

**Root cause:** `pnpm exec playwright install chromium` had not been run after the initial `pnpm install`. Unlike npm, Playwright browsers are not downloaded by the package install step — they require a separate explicit command.

**Fix:** `pnpm exec playwright install chromium`

**Paper note:** Reproducibility instruction. Include in paper's artifact README: browsers must be installed separately.

---

### [2026-04-02] Investigation: React `<Profiler>` disabled in production builds

**Files affected:** `components/render-tracker.tsx`, `next.config.mjs`, `scripts/run-benchmarks.sh`

**Problem:** When running the full benchmark suite (`pnpm benchmark`), all `DataTable renders : 0` for redux, zustand, and jotai across RQ2–RQ4. The `context` library had previously passed when run via `pnpm test:e2e` (which starts `next dev`).

**Diagnosis:** React's `<Profiler>` component is intentionally a no-op in standard production builds of `react-dom`. Its `onRender` callback is stripped at build time. Confirmed:
```js
// react-dom/cjs/react-dom.production.js
// grep 'onRender' → not found
```
The benchmark script uses `next build` + `next start` (production). The prior ad-hoc test used `next dev` (development, where Profiler is active). This caused a false passing result for `context` — it worked in dev but would have failed in production too.

**Attempted fix 1 — `react-dom/profiling` webpack alias (abandoned):**
Added to `next.config.mjs`:
```js
config.resolve.alias['react-dom$'] = 'react-dom/profiling'
config.resolve.alias['react-dom/client$'] = 'react-dom/profiling'
```
Controlled by a `PROFILING=true` env var flag, with the benchmark script doing two passes per library (one for clean bundle sizes, one for profiling render counts).

This did not resolve the issue. The Next.js build cache served identical chunk hashes across both builds, indicating the alias was either not applied or the `react-dom/profiling` entry point in React 19 does not re-enable `onRender` the same way as React 18. Investigation confirmed `react-dom/profiling` resolves correctly (`node -e "require('./node_modules/react-dom/profiling')"` returns `object`) but the webpack alias approach through Next.js's build pipeline did not produce different output.

**Final fix — replace `<Profiler>` with `useEffect`-based render counter:**

`components/render-tracker.tsx` was rewritten to use `useEffect` with no dependency array instead of `<Profiler>`:

```tsx
useEffect(() => {
  getRecords().push({ id, phase: isMounted.current ? 'update' : 'mount', ... })
  isMounted.current = true
})
```

`useEffect` with no deps array fires synchronously after every DOM commit in both development and production builds. It does not depend on React's profiling infrastructure. The `<Profiler>` wrapper and import were removed entirely.

The two-pass `PROFILING=true` logic was reverted from both `next.config.mjs` and `scripts/run-benchmarks.sh` — a single build per library is sufficient.

**Tradeoff:** `useEffect` does not provide `actualDuration` (render wall-clock time). The `actualDuration` and `baseDuration` fields in `RenderRecord` are now always `0`. For this study, **render count** is the primary metric (RQ2–RQ4); duration was a secondary nice-to-have. This tradeoff is acceptable.

**Paper note (Methodology / Limitations):** The original design used React's `<Profiler>` API to measure render counts and durations. During execution, it was discovered that `react-dom`'s production build strips `Profiler.onRender` as a deliberate performance optimisation. The measurement approach was revised to use a `useEffect`-based commit counter, which is production-safe and captures render counts accurately. Render duration (`actualDuration`) is not available with this approach and is excluded from results. Render count remains the primary dependent variable for RQ2–RQ4.

---

### [2026-04-02] Fix: Bundle size measurement — shared chunks contaminated totals

**Problem:** Initial script (`find .next/static/chunks -name '*.js' | xargs wc -c`) summed all chunks including the shared Next.js / React runtime (~770 KB). All 4 libraries showed identical totals, making library-specific overhead invisible.

**Fix:** Updated `scripts/run-benchmarks.sh` to:
1. Parse `next build` stdout's `first_load` and `shared` columns for the `/` route.
2. Compute `library_delta_kb = first_load − shared` — the overhead above the shared runtime.
3. Also compute total gzip bytes of all `.next/static/chunks` files using `gzip -c` piped to `wc -c`.
4. Added `rm -rf .next` before each build to prevent stale chunk hash reuse.

**Result:** Library deltas are now distinct:
- Redux Toolkit: +10.0 KB (Redux + RTK middleware)
- Jotai: +6.0 KB (atomic scheduler)
- Zustand: +2.0 KB
- Context: +2.0 KB (built-in, no external library)

**Paper note (Methodology):** Bundle overhead is reported as `First Load JS − shared runtime` (in KB, gzip). See `results/bundle-sizes.csv`.

---

### [2026-04-02] Fix: Webpack alias `@/store/active` key never matched

**Files affected:** `next.config.mjs`

**Problem:** All 4 library builds produced identical chunk hashes, and a content grep confirmed every build included Context's `createContext`/`useReducer` code — even the `redux` build. The library-swap alias was silently failing.

**Diagnosis:** Next.js uses `tsconfig-paths-webpack-plugin` to resolve TypeScript path aliases (`@/…`). This plugin runs early in webpack's resolver pipeline and converts `@/store/active` → `/abs/path/store/active.tsx` **before** webpack evaluates `resolve.alias` string keys. The alias key `'@/store/active'` never matched because webpack only ever saw the already-resolved absolute path.

Evidence:
```bash
# Layout chunk for the "redux" build contained:
grep -c 'createContext\|useReducer' .next/static/chunks/app/layout-*.js
# Output: 1  ← Context code in the Redux build
```

**Fix:** Change the alias key from a string (`'@/store/active'`) to the resolved absolute file path:
```js
// next.config.mjs — BEFORE (broken):
config.resolve.alias['@/store/active'] = path.resolve(__dirname, `store/${library}/index.tsx`)

// AFTER (working):
const activeStorePath = path.resolve(__dirname, 'store/active.tsx')
config.resolve.alias[activeStorePath] = path.resolve(__dirname, `store/${library}/index.tsx`)
```

**Verification:** Redux build now contains an extra async chunk (`555-*.js`, ~22 KB) with Redux Toolkit code, absent in the Context build. Layout chunk hash differs between libraries.

**Paper note (Methodology / Reproducibility):** This bug invalidated all benchmark runs prior to the fix. All reported results were collected after the fix was applied. The root cause is specific to Next.js ≥ 13 with `tsconfig-paths-webpack-plugin`. Any future study using Next.js + webpack aliases must use absolute-path keys, not TypeScript path alias strings.

---

### [2026-04-02] Fix: Zustand v5 infinite re-render — `useStore` with object selector

**Files affected:** `store/zustand/index.tsx`

**Problem:** All 4 Zustand tests timed out (`page.waitForSelector('[data-testid="table"]')` never resolved). The app did not render.

**Root cause:** Zustand v5 uses `Object.is` (strict equality) to compare the old and new return value of a selector. When `useStore` receives an inline object literal selector:
```js
const state = useStore((s) => ({
  rows: s.rows, filter: s.filter, /* ... */
}))
```
the selector creates a new object reference on every call. Since `{} !== {}`, Zustand always detects a "change" and schedules another re-render → infinite loop → React error before first paint.

This only manifested after the webpack alias fix; prior runs silently loaded the Context implementation for the Zustand build.

**Fix:** Use `useShallow` from `zustand/react/shallow` to do shallow field-by-field equality instead of reference equality:
```js
import { useShallow } from 'zustand/react/shallow'

const state = useStore(useShallow((s) => ({
  rows: s.rows, filter: s.filter, /* ... */
})))
```

**Paper note (Methodology):** Idiomatic Zustand usage requires `useShallow` whenever a selector returns a new object. This is documented in the Zustand v4 migration guide. Failure to apply `useShallow` is a common mistake and would silently degrade performance (infinite re-renders) in production, making it a practical correctness concern in addition to a benchmark infrastructure concern.

---

### [2026-04-02] Fix: DataTable identical render counts across all libraries (RQ1)

**Files affected:** `store/types.ts`, all 4 store implementations, `store/active.tsx`, `store/index.ts`, `components/data-table.tsx`

**Problem:** After all prior fixes, RQ1 (counter increments) showed `DataTable renders = 50` for ALL libraries — no differentiation. This meant every library appeared equally bad at isolating irrelevant state changes.

**Root cause (two-part):**

1. `DataTable` called `useAppStore()`, which subscribes to the full `AppState` including `counter`. Since every library's `useAppStore()` re-evaluates when counter changes, DataTable received a new state/hook return value on every increment.

2. Even after introducing `useTableStore()` (a granular hook without counter), `React.memo` was missing. When Dashboard (parent) re-renders on counter change (Dashboard uses `useAppStore()` which includes counter), React reconciles all children including DataTable — causing DataTable's function body to run even if its hooks return the same values. The `useEffect(no-deps)` commit counter fires on every render commit, capturing these parent-driven re-renders.

**Fix:**
1. Added `useTableStore()` hook to each store implementation that subscribes only to `{rows, filter, sortBy, sortDir, selectedIds, toggleSelect}` — no counter.
   - Redux: 5 separate `useSelector` calls, one `useDispatch` for the action
   - Zustand: 5 separate per-field `useStore` selectors + `useStore(s => s.toggleSelect)`
   - Jotai: 5 `useAtomValue` calls + `useSetAtom` (write-only, no subscription) for the action
   - Context: `useContext(StateCtx)` + `useContext(DispatchCtx)` — cannot scope below the full context value
2. Exported `useTableStore` from each implementation, from `store/active.tsx`, and from `store/index.ts`.
3. Added `TableState` type to `store/types.ts`.
4. Wrapped `DataTable` export in `React.memo`. With no props, the only way to trigger a re-render is through the hook subscriptions.
5. `DataTable` now calls ONLY `useTableStore()` — `useAppStore()` import removed entirely.

**Result:**
- Redux / Zustand / Jotai RQ1: DataTable renders = **0** (per-field subscriptions skip renders when counter alone changes)
- Context RQ1: DataTable renders = **50** (`useContext` fires whenever the context value reference changes, regardless of which fields the component reads)
- RQ2–RQ4: unchanged at 5 / 20 / 10 for all libraries (table-relevant state still triggers correct re-renders)

**Paper note (Discussion):** This result quantifies the canonical performance argument for selector-based state management. Context's `useContext` hook uses value-reference equality — any state change creates a new context value object and re-renders all consumers. Libraries with explicit subscription APIs (Redux `useSelector`, Zustand `useStore`, Jotai `useAtomValue`) can subscribe to individual slices and skip renders when unrelated slices change. The 50× difference in RQ1 is not inherent to Context as a mechanism but to its lack of subscription scoping. A workaround exists (`use-context-selector`, manual memoisation, context splitting) but adds complexity not reflected in this measurement.

