#!/usr/bin/env bash
# run-benchmarks.sh — builds and tests all state management variants,
# then collects bundle sizes and render counts into results/.
#
# Render counts are tracked via useEffect (not React Profiler), which works
# in standard production builds without react-dom/profiling.
#
# Set COMPILER_RUN=1 to also run the React Compiler sensitivity pass.
# Set LIBS to override the library list, e.g.:
#   LIBS="valtio mobx" TIMING_RUNS=1 pnpm benchmark

set -euo pipefail

LIBRARIES=(${LIBS:-"redux" "redux-idiomatic" "zustand" "jotai" "context" "valtio" "mobx"})
RESULTS="results"
mkdir -p "$RESULTS"

# Number of build replications per library. Default is 1 (fast run).
# Set BENCHMARK_RUNS=3 to verify build reproducibility, e.g.:
#   BENCHMARK_RUNS=3 pnpm benchmark
BENCHMARK_RUNS="${BENCHMARK_RUNS:-1}"

# Number of timing repetitions per scenario for render-span median/IQR collection.
# Default 20 (matches paper §3.3, Table 4). Set TIMING_RUNS=1 for faster CI-only runs
TIMING_RUNS="${TIMING_RUNS:-20}"

BUNDLE_REPORT="$RESULTS/bundle-sizes.csv"
# Columns:
#   run                — replication index (1-based); always 1 for default single-run mode
#   library,route_size_kb,first_load_kb,shared_kb,library_delta_kb,gzip_total_bytes,gzip_total_kb
echo "run,library,route_size_kb,first_load_kb,shared_kb,library_delta_kb,gzip_total_bytes,gzip_total_kb" > "$BUNDLE_REPORT"

# Skip the primary Chromium benchmark loop when running a webkit-only or compiler-only pass.
if [ "${WEBKIT_ONLY:-0}" != "1" ] && [ "${COMPILER_ONLY:-0}" != "1" ]; then
for LIB in "${LIBRARIES[@]}"; do
  for RUN in $(seq 1 "$BENCHMARK_RUNS"); do
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [ "$BENCHMARK_RUNS" -gt 1 ]; then
    echo "  Library: $LIB  (run $RUN / $BENCHMARK_RUNS)"
  else
    echo "  Library: $LIB"
  fi
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # ── Build ────────────────────────────────────────────────────────────────
  # Clear the Next.js build cache so webpack re-evaluates the @/store/active
  # alias for each library. Without this, Next.js 15's incremental compilation
  # reuses chunk hashes from the previous build, producing identical output.
  echo "→ Clearing build cache…"
  rm -rf .next
  echo "→ Building…"
  NEXT_PUBLIC_STATE_LIBRARY="$LIB" pnpm build 2>&1 | tee "$RESULTS/build-$LIB.log"

  # ── Bundle size ──────────────────────────────────────────────────────────
  # Three measurements, from coarsest to most precise:
  #
  # 1. next build stdout delta (first_load − shared): rounded to kB, masked by
  #    rounding when library code < 500 B. Kept for paper Table 1 footnote.
  #
  # 2. Gzip bytes across ALL .next/static/chunks/*.js: precise total, but
  #    includes shared React/Next.js runtime. Differences between libraries
  #    represent the library-specific contribution (now that cache is cleared).
  #
  # 3. Individual chunk gzip sizes saved to results/chunks-{lib}.txt so the
  #    specific library chunk can be identified and cited in the paper.

  BUILD_LOG="$RESULTS/build-$LIB.log"

  # --- Measurement 1: next build stdout delta ---
  ROUTE_LINE=$(grep -E '○ /' "$BUILD_LOG" | grep -v '_not-found' | head -1)
  FIRST_LOAD_KB=$(echo "$ROUTE_LINE" | grep -oE '[0-9]+(\.[0-9]+)? kB' | tail -1 | awk '{print $1}')
  ROUTE_SIZE_RAW=$(echo "$ROUTE_LINE" | grep -oE '[0-9]+(\.[0-9]+)? (kB|B)' | head -1)
  ROUTE_SIZE_KB=$(echo "$ROUTE_SIZE_RAW" | awk '{if ($2=="B") printf "%.3f",$1/1024; else printf "%.2f",$1}')
  SHARED_KB=$(grep "First Load JS shared by all" "$BUILD_LOG" | grep -oE '[0-9]+(\.[0-9]+)? kB' | head -1 | awk '{print $1}')
  LIBRARY_DELTA_KB=$(awk "BEGIN {printf \"%.2f\", $FIRST_LOAD_KB - $SHARED_KB}")

  # --- Measurement 2: gzip total of all chunks (raw bytes) ---
  CHUNKS_DIR=".next/static/chunks"
  GZIP_TOTAL_BYTES=$(find "$CHUNKS_DIR" -name "*.js" | sort | xargs gzip -c | wc -c | tr -d ' ')
  GZIP_TOTAL_KB=$(awk "BEGIN {printf \"%.2f\", $GZIP_TOTAL_BYTES/1024}")

  # --- Measurement 3: per-chunk gzip inventory ---
  find "$CHUNKS_DIR" -name "*.js" | sort | while read -r f; do
    gzip -c "$f" | wc -c | tr -d ' ' | awk -v name="$(basename "$f")" '{printf "%s\t%s\n", $1, name}'
  done | sort -rn > "$RESULTS/chunks-$LIB.txt"

  echo "$RUN,$LIB,$ROUTE_SIZE_KB,$FIRST_LOAD_KB,$SHARED_KB,$LIBRARY_DELTA_KB,$GZIP_TOTAL_BYTES,$GZIP_TOTAL_KB" >> "$BUNDLE_REPORT"
  echo "→ Bundle: run=$RUN route=${ROUTE_SIZE_KB}kB  first_load=${FIRST_LOAD_KB}kB  shared=${SHARED_KB}kB  library_delta=${LIBRARY_DELTA_KB}kB  gzip_total=${GZIP_TOTAL_KB}kB"

  # Only run the E2E benchmark on the first replication run.
  # Subsequent runs are bundle-size replication checks only; re-running E2E
  # on identical builds would produce identical deterministic counts.
  if [ "$RUN" -gt 1 ]; then
    echo "→ Skipping E2E (replication run $RUN — bundle-size verification only)"
    continue
  fi

  # ── E2E benchmark (start server, run tests, kill server) ─────────────────
  # Free port 3000 in case a previous server's child process is still running.
  # `kill $SERVER_PID` only kills the pnpm parent; `next start` can survive as
  # an orphan and keep the port bound until we explicitly release it.
  lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
  echo "→ Starting production server…"
  NEXT_PUBLIC_STATE_LIBRARY="$LIB" pnpm start &
  SERVER_PID=$!

  # Poll until the server responds rather than sleeping a fixed duration.
  # A fixed sleep risks a race condition on slow machines or loaded CI runners:
  # if the server takes longer than the sleep, Playwright either connects before
  # the server is ready or falls back to the dev-server fallback in the config.
  echo "→ Waiting for production server on :3000…"
  SERVER_READY=0
  for i in $(seq 1 30); do
    if curl -s -o /dev/null http://localhost:3000; then
      SERVER_READY=1
      break
    fi
    sleep 1
  done
  if [ "$SERVER_READY" -eq 0 ]; then
    echo "ERROR: Production server did not respond within 30 seconds" >&2
    kill "$SERVER_PID" 2>/dev/null || true
    exit 1
  fi

  echo "→ Running Playwright benchmarks…"
  # Use the production benchmark config (not the dev-server fallback in playwright.config.ts).
  # Removing '|| true' so that a test failure halts the loop immediately rather than
  # silently producing a partial results file that could be mistaken for valid data.
  NEXT_PUBLIC_STATE_LIBRARY="$LIB" TIMING_RUNS="$TIMING_RUNS" pnpm playwright test \
    --config=playwright.benchmark.config.ts \
    --reporter=list \
    --output="$RESULTS/pw-artifacts-$LIB" \
    2>&1 | tee "$RESULTS/playwright-$LIB.log"

  # Kill the entire process group (PGID == PID for bash background jobs) so
  # both pnpm and its next-start child are terminated, then release the port.
  kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
  done  # end BENCHMARK_RUNS loop
done  # end LIBRARIES loop
fi  # end WEBKIT_ONLY guard

# ── Optional React Compiler sensitivity pass ─────────────────────────────────
# Runs the benchmark for ALL libraries with REACT_COMPILER=1.
# Produces results/playwright-{lib}-compiler.log and bundle-sizes-compiler.csv.
#
# Activated by setting COMPILER_RUN=1, e.g.:
#   COMPILER_RUN=1 TIMING_RUNS=20 pnpm benchmark
#
# Use COMPILER_LIBS to restrict which libraries are tested:
#   COMPILER_LIBS="redux context" COMPILER_RUN=1 pnpm benchmark
#
# Note: selector-based libraries (Redux, Jotai, Zustand, Valtio, MobX) are
# already at zero surplus renders; the compiler's effect on TIMING is what
# is measured. Context is the primary interest for render-count changes.
if [ "${COMPILER_RUN:-0}" = "1" ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  React Compiler sensitivity pass (all libraries)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  COMPILER_LIBRARIES=(${COMPILER_LIBS:-"redux" "redux-idiomatic" "zustand" "jotai" "context" "valtio" "mobx"})

  COMPILER_BUNDLE_REPORT="$RESULTS/bundle-sizes-compiler.csv"
  echo "run,library,route_size_kb,first_load_kb,shared_kb,library_delta_kb,gzip_total_bytes,gzip_total_kb" > "$COMPILER_BUNDLE_REPORT"

  for LIB in "${COMPILER_LIBRARIES[@]}"; do
    echo ""
    echo "  Library: $LIB (React Compiler ON)"
    rm -rf .next
    REACT_COMPILER=1 NEXT_PUBLIC_STATE_LIBRARY="$LIB" pnpm build 2>&1 | tee "$RESULTS/build-${LIB}-compiler.log"

    # Full bundle measurement (matching the primary run)
    BUILD_LOG="$RESULTS/build-${LIB}-compiler.log"
    ROUTE_LINE=$(grep -E '○ /' "$BUILD_LOG" | grep -v '_not-found' | head -1)
    FIRST_LOAD_KB=$(echo "$ROUTE_LINE" | grep -oE '[0-9]+(\.[0-9]+)? kB' | tail -1 | awk '{print $1}')
    ROUTE_SIZE_RAW=$(echo "$ROUTE_LINE" | grep -oE '[0-9]+(\.[0-9]+)? (kB|B)' | head -1)
    ROUTE_SIZE_KB=$(echo "$ROUTE_SIZE_RAW" | awk '{if ($2=="B") printf "%.3f",$1/1024; else printf "%.2f",$1}')
    SHARED_KB=$(grep "First Load JS shared by all" "$BUILD_LOG" | grep -oE '[0-9]+(\.[0-9]+)? kB' | head -1 | awk '{print $1}')
    LIBRARY_DELTA_KB=$(awk "BEGIN {printf \"%.2f\", $FIRST_LOAD_KB - $SHARED_KB}")
    GZIP_TOTAL_BYTES=$(find .next/static/chunks -name '*.js' | sort | xargs gzip -c | wc -c | tr -d ' ')
    GZIP_TOTAL_KB=$(awk "BEGIN {printf \"%.2f\", $GZIP_TOTAL_BYTES/1024}")
    echo "1,$LIB,$ROUTE_SIZE_KB,$FIRST_LOAD_KB,$SHARED_KB,$LIBRARY_DELTA_KB,$GZIP_TOTAL_BYTES,$GZIP_TOTAL_KB" >> "$COMPILER_BUNDLE_REPORT"
    echo "→ Bundle (compiler): route=${ROUTE_SIZE_KB}kB  first_load=${FIRST_LOAD_KB}kB  library_delta=${LIBRARY_DELTA_KB}kB"

    lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
    REACT_COMPILER=1 NEXT_PUBLIC_STATE_LIBRARY="$LIB" pnpm start &
    SERVER_PID=$!
    SERVER_READY=0
    for i in $(seq 1 30); do
      if curl -s -o /dev/null http://localhost:3000; then SERVER_READY=1; break; fi
      sleep 1
    done
    if [ "$SERVER_READY" -eq 0 ]; then
      echo "ERROR: Production server (compiler/$LIB) did not respond within 30 seconds" >&2
      kill "$SERVER_PID" 2>/dev/null || true; exit 1
    fi

    # React Compiler changes render counts for non-subscribing components
    # (e.g., Panel in RQ6, Dashboard in RQ5). Tests assert non-compiler
    # baselines; failures here are expected and documented in Appendix app:compiler.
    # '|| true' ensures the timing test (test 12) always runs even if earlier
    # render-count assertions fail.
    NEXT_PUBLIC_STATE_LIBRARY="$LIB" TIMING_RUNS="$TIMING_RUNS" pnpm playwright test \
      --config=playwright.benchmark.config.ts \
      --reporter=list \
      --output="$RESULTS/pw-artifacts-${LIB}-compiler" \
      2>&1 | tee "$RESULTS/playwright-${LIB}-compiler.log" || true

    kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
  done

  echo ""
  echo "Compiler sensitivity bundle sizes:"
  column -t -s ',' "$COMPILER_BUNDLE_REPORT"
fi

# ── Optional WebKit/Safari cross-validation pass ──────────────────────────────
# Runs render-count tests (TIMING_RUNS=1) for all libraries under WebKit
# (JavaScriptCore), confirming engine-independence of the main findings.
# Activated by setting WEBKIT_RUN=1, e.g.:
#   WEBKIT_RUN=1 pnpm benchmark
if [ "${WEBKIT_RUN:-0}" = "1" ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  WebKit/Safari render-count cross-validation"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  WEBKIT_LIBRARIES=(${WEBKIT_LIBS:-"redux" "redux-idiomatic" "zustand" "jotai" "context" "valtio" "mobx"})

  for LIB in "${WEBKIT_LIBRARIES[@]}"; do
    echo ""
    echo "  Library: $LIB (WebKit)"
    # Always rebuild for each library: NEXT_PUBLIC_STATE_LIBRARY is baked in
    # at Next.js build time, so we must rebuild per library.
    rm -rf .next
    NEXT_PUBLIC_STATE_LIBRARY="$LIB" pnpm build 2>&1 | tee "$RESULTS/build-${LIB}-webkit.log"

    lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
    NEXT_PUBLIC_STATE_LIBRARY="$LIB" pnpm start &
    SERVER_PID=$!
    SERVER_READY=0
    for i in $(seq 1 30); do
      if curl -s -o /dev/null http://localhost:3000; then SERVER_READY=1; break; fi
      sleep 1
    done
    if [ "$SERVER_READY" -eq 0 ]; then
      echo "ERROR: Production server (webkit/$LIB) did not respond within 30 seconds" >&2
      kill "$SERVER_PID" 2>/dev/null || true; exit 1
    fi

    # TIMING_RUNS=1: skip the N=20 timing loop, run render-count tests only.
    NEXT_PUBLIC_STATE_LIBRARY="$LIB" TIMING_RUNS=1 pnpm playwright test \
      --config=playwright.webkit.config.ts \
      --reporter=list \
      --output="$RESULTS/pw-artifacts-${LIB}-webkit" \
      2>&1 | tee "$RESULTS/playwright-${LIB}-webkit.log"

    kill -- -"$SERVER_PID" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
  done

  echo ""
  echo "Render counts are in results/playwright-{library}-webkit.log"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅  Benchmark complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Bundle sizes (results/bundle-sizes.csv):"
echo "  route_size_kb  = JS unique to the / route"
echo "  library_delta_kb = first_load − shared  ← the RQ1 number"
column -t -s ',' "$BUNDLE_REPORT"

echo ""
echo "Render counts are in results/playwright-{library}.log"
echo "  grep for '[redux]', '[zustand]' etc. to compare"
