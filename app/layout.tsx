import type { Metadata } from 'next'
import { StoreProvider } from '@/store'

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
  title: 'State Management Benchmark',
  description: 'Reproducible benchmarks for Redux, Zustand, Jotai, and React Context',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  )
}
