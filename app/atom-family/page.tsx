import { AtomFamilyStoreProvider } from '@/store/jotai-atoms'
import { AtomFamilyTable } from '@/components/atom-family-table'

export default function AtomFamilyPage() {
  return (
    <AtomFamilyStoreProvider>
      <main style={{ fontFamily: 'monospace', padding: '1rem' }}>
        <h1>RQ10 — Jotai Atom Families: Per-Row Render Isolation</h1>
        <p>
          Each row subscribes to its own atom. Patching row-0 should only
          re-render <code>RowCell-row-0</code>; all other RowCell components
          remain unaffected.
        </p>
        <AtomFamilyTable />
      </main>
    </AtomFamilyStoreProvider>
  )
}
