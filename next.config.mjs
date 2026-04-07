import path from 'path'
import { fileURLToPath } from 'url'
import bundleAnalyzer from '@next/bundle-analyzer'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const library = process.env.NEXT_PUBLIC_STATE_LIBRARY ?? 'context'

// React Compiler is opt-in: set REACT_COMPILER=1 to enable.
// Normal builds (REACT_COMPILER unset) are identical to the pre-compiler baseline.
const compilerEnabled = process.env.REACT_COMPILER === '1'

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(compilerEnabled ? { experimental: { reactCompiler: true } } : {}),
  webpack(config) {
    // Swap the active store implementation at build time.
    //
    // Key insight: Next.js resolves tsconfig `@/` path aliases to absolute
    // paths via tsconfig-paths-webpack-plugin BEFORE webpack evaluates
    // resolve.alias. This means aliasing '@/store/active' (the @/ form)
    // has no effect — webpack never sees that string; it sees the resolved
    // absolute path instead.
    //
    // Fix: alias the ABSOLUTE PATH of store/active.tsx → the selected library.
    // Webpack's resolve.alias checks are applied against resolved absolute
    // paths, so this intercepts the import regardless of how it was written
    // in source (relative './active', absolute '@/store/active', etc.).
    const activeStorePath = path.resolve(__dirname, 'store/active.tsx')
    const libraryPath = path.resolve(__dirname, `store/${library}/index.tsx`)
    config.resolve.alias[activeStorePath] = libraryPath

    return config
  },
}

export default withBundleAnalyzer(nextConfig)
