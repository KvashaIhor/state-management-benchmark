'use client'

import { useAppStore } from '@/store'
import { RenderTracker } from './render-tracker'
import { DataTable } from './data-table'

// ---------------------------------------------------------------------------
// 5-level component tree for RQ9
//
// Shell (root, subscribes to full AppState including counter)
//   └─ Layer1 (no React.memo — cascades Shell's re-renders)
//        └─ Layer2 (no React.memo — cascades Layer1's re-renders)
//             └─ Layer3 (no React.memo — cascades Layer2's re-renders)
//                  └─ DataTable (React.memo leaf — should be isolated under
//                                selector-based libraries regardless of depth)
//
// Purpose: RQ6 confirmed leaf isolation holds at depth-3. RQ9 extends this
// to depth-5 to empirically test whether isolation holds across greater depth.
//
// Expected render counts on RQ9 (50 counter increments):
//   Shell:     50  (subscribes to counter via useAppStore)
//   Layer1:    50  (no React.memo; cascades from Shell)
//   Layer2:    50  (no React.memo; cascades from Layer1)
//   Layer3:    50  (no React.memo; cascades from Layer2)
//   DataTable:  0  for selector-based libs (React.memo + useTableStore excludes counter)
//              50  for Context (useContext re-renders on every dispatch)
// ---------------------------------------------------------------------------

function Layer3() {
  return (
    <RenderTracker id="Layer3">
      <div data-testid="layer3">
        <DataTable />
      </div>
    </RenderTracker>
  )
}

function Layer2() {
  return (
    <RenderTracker id="Layer2">
      <div data-testid="layer2">
        <Layer3 />
      </div>
    </RenderTracker>
  )
}

function Layer1() {
  return (
    <RenderTracker id="Layer1">
      <div data-testid="layer1">
        <Layer2 />
      </div>
    </RenderTracker>
  )
}

function DeepShell() {
  const { state, actions } = useAppStore()

  return (
    <RenderTracker id="DeepShell">
      <div style={{ fontFamily: 'monospace', padding: '1rem' }}>
        <header
          style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}
        >
          <h1 style={{ margin: 0 }}>
            Deep Tree Benchmark (5-level) —{' '}
            {process.env.NEXT_PUBLIC_STATE_LIBRARY ?? 'context'}
          </h1>
          <span data-testid="counter" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
            {state.counter}
          </span>
          <button data-testid="increment" onClick={actions.incrementCounter}>
            +1
          </button>
          <button data-testid="refresh-rows" onClick={actions.refreshRows}>
            Refresh Rows
          </button>
          <button data-testid="reset" onClick={actions.resetState}>
            Reset
          </button>
        </header>

        {/* 5-level tree: DeepShell → Layer1 → Layer2 → Layer3 → DataTable */}
        <Layer1 />
      </div>
    </RenderTracker>
  )
}

export { DeepShell as DeepTreeDashboard }
