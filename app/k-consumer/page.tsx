import { KConsumerDashboard } from '@/components/k-consumer-dashboard'

// ---------------------------------------------------------------------------
// K-Consumer route — /k-consumer?k=N
//
// Renders N identical DataTable consumers for RQ8 fan-out measurement.
// Playwright navigates to /k-consumer?k=3 and /k-consumer?k=10.
// ---------------------------------------------------------------------------

export default async function KConsumerPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string }>
}) {
  const params = await searchParams
  const k = Math.max(1, Math.min(20, parseInt(params.k ?? '3', 10)))

  return (
    <main>
      <KConsumerDashboard k={k} />
    </main>
  )
}
