#!/usr/bin/env bash
# setup-and-run.sh — one-shot benchmark runner for fresh machines.
#
# Usage (after cloning the repo):
#   bash scripts/setup-and-run.sh
#
# Optional environment overrides:
#   TIMING_RUNS=5   bash scripts/setup-and-run.sh   # fewer runs (faster, less precise)
#   TIMING_RUNS=20  bash scripts/setup-and-run.sh   # full paper protocol (default)
#   BENCHMARK_RUNS=3 bash scripts/setup-and-run.sh  # triple-build reproducibility check
#
# What it does:
#   1. Checks that Node.js ≥ 20 and pnpm are available; prints install hints if not.
#   2. Runs pnpm install (installs npm dependencies from the lockfile).
#   3. Installs Playwright's Chromium browser + OS-level system deps.
#   4. Runs the full benchmark (7 libraries × build + E2E + timing).
#   5. Computes mean [95% CI] for Table 4 (calls scripts/compute_ci.py).
#   6. Prints a machine-info summary so results can be attributed to hardware.
#
# Output: results/playwright-{lib}.log, results/bundle-sizes.csv, results/chunks-*.txt
# The results/ directory is ready to zip and send for cross-hardware comparison.

set -euo pipefail

# ── Colours ─────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

info()    { echo -e "${GREEN}[setup]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET}  $*"; }
error()   { echo -e "${RED}[error]${RESET} $*" >&2; }
section() { echo -e "\n${BOLD}━━━  $*  ━━━${RESET}"; }

# ── Repo root (script is always in scripts/, repo root is one level up) ──────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
info "Working directory: $REPO_ROOT"

# ── Benchmark parameters (override via env) ───────────────────────────────────
TIMING_RUNS="${TIMING_RUNS:-20}"
BENCHMARK_RUNS="${BENCHMARK_RUNS:-1}"

# ── Step 1: Machine info ──────────────────────────────────────────────────────
section "Step 1 / 5 — Machine info"
echo "Date       : $(date)"
echo "OS         : $(uname -sr)"
if command -v sw_vers &>/dev/null; then
  echo "macOS      : $(sw_vers -productName) $(sw_vers -productVersion)"
fi
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "Linux      : $PRETTY_NAME"
fi
echo "CPU        : $(uname -m)"
if command -v sysctl &>/dev/null && sysctl -n machdep.cpu.brand_string &>/dev/null 2>&1; then
  echo "CPU model  : $(sysctl -n machdep.cpu.brand_string)"
elif [[ -f /proc/cpuinfo ]]; then
  echo "CPU model  : $(grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2 | xargs)"
  echo "CPU cores  : $(nproc)"
fi
if command -v sysctl &>/dev/null && sysctl -n hw.memsize &>/dev/null 2>&1; then
  MEM_GB=$(( $(sysctl -n hw.memsize) / 1024 / 1024 / 1024 ))
  echo "RAM        : ${MEM_GB} GB"
elif [[ -f /proc/meminfo ]]; then
  echo "RAM        : $(awk '/MemTotal/{printf "%.1f GB", $2/1024/1024}' /proc/meminfo)"
fi

# ── Step 2: Check prerequisites ───────────────────────────────────────────────
section "Step 2 / 5 — Prerequisites"

# Node.js
if ! command -v node &>/dev/null; then
  error "Node.js not found."
  echo "  Install via https://nodejs.org (LTS ≥ 20) or:"
  echo "  macOS: brew install node"
  echo "  Ubuntu: sudo apt install nodejs npm"
  exit 1
fi
NODE_VERSION=$(node --version)
NODE_MAJOR=$(echo "$NODE_VERSION" | grep -oE '[0-9]+' | head -1)
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  error "Node.js $NODE_VERSION found but ≥ 20 is required."
  echo "  Upgrade: https://nodejs.org or use nvm: nvm install --lts"
  exit 1
fi
info "Node.js $NODE_VERSION ✓"

# pnpm
if ! command -v pnpm &>/dev/null; then
  error "pnpm not found."
  echo "  Install: npm install -g pnpm   or   corepack enable pnpm"
  exit 1
fi
info "pnpm $(pnpm --version) ✓"

# Python 3 (for compute_ci.py)
if command -v python3 &>/dev/null; then
  info "Python $(python3 --version | cut -d' ' -f2) ✓  (CI table output enabled)"
  HAS_PYTHON=1
else
  warn "python3 not found — CI table will be skipped."
  warn "Install: https://python.org or brew install python3"
  HAS_PYTHON=0
fi

# ── Step 3: Install npm dependencies ─────────────────────────────────────────
section "Step 3 / 5 — npm dependencies"
info "Running pnpm install --frozen-lockfile …"
pnpm install --frozen-lockfile
info "Dependencies installed ✓"

# ── Step 4: Install Playwright browsers ───────────────────────────────────────
section "Step 4 / 5 — Playwright browsers"
info "Installing Chromium + system dependencies …"
# --with-deps installs any missing OS packages (libnss3, libgbm, etc.) on Linux.
# On macOS it is a no-op beyond the browser download itself.
pnpm playwright install chromium --with-deps
info "Playwright Chromium installed ✓"

# ── Step 5: Run the benchmark ─────────────────────────────────────────────────
section "Step 5 / 5 — Benchmark"
info "TIMING_RUNS=${TIMING_RUNS}  BENCHMARK_RUNS=${BENCHMARK_RUNS}"
info "Starting full benchmark (7 libraries × build + E2E + ${TIMING_RUNS} timing runs) …"
info "Estimated time: ~20 min on Apple M-series / ~60 min on x86-64 two-core CI"

TIMING_RUNS="$TIMING_RUNS" BENCHMARK_RUNS="$BENCHMARK_RUNS" bash scripts/run-benchmarks.sh

# ── CI table ─────────────────────────────────────────────────────────────────
if [[ "$HAS_PYTHON" -eq 1 ]]; then
  section "Results — Table 4 (mean [95% CI])"
  python3 scripts/compute_ci.py
fi

# ── Summary ──────────────────────────────────────────────────────────────────
section "Done"
info "Results written to results/"
echo ""
echo "  results/bundle-sizes.csv       — bundle deltas (all 7 libraries)"
echo "  results/playwright-{lib}.log   — raw render counts + timing"
echo "  results/chunks-{lib}.txt       — per-chunk gzip inventory"
echo ""
info "To share results, zip the results/ directory and send it:"
echo "  zip -r benchmark-$(hostname)-$(date +%Y%m%d).zip results/"
echo ""
info "Machine details are printed above (Step 1) for attribution in cross-hardware comparison."
