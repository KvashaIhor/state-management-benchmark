#!/usr/bin/env python3
"""
compute_ci.py — Reproducibility script for Table 4 of the paper.

Parses raw per-run timing values from results/playwright-{library}.log files
produced by scripts/run-benchmarks.sh.  Each log line contains a 'raw=[...]'
field with all TIMING_RUNS span values in milliseconds.  Run 0 (index 0) is
discarded as JIT / V8 warm-up per Kalibera and Jones [10]; the remaining
N-1 steady-state observations are used to compute mean ± t(0.975, N-2) × (sd/√(N-1)).

To reproduce Table 4:
    TIMING_RUNS=20 pnpm benchmark        # collect logs under results/
    python3 scripts/compute_ci.py        # parse logs → print Table 4

The script reads whichever log files are present; run the benchmark first to
populate them.  If a log is missing for a library, that row is skipped.

Reference:
    Kalibera, T. & Jones, R. (2013). Rigorous benchmarking in reasonable time.
    ISMM '13. https://doi.org/10.1145/2464157.2464161
"""

import math
import re
import statistics
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# t(0.975, df) — two-sided 95% CI critical values
# ---------------------------------------------------------------------------

T_TABLE: dict[int, float] = {
    1: 12.706, 2: 4.303,  3: 3.182,  4: 2.776,  5: 2.571,
    6: 2.447,  7: 2.365,  8: 2.306,  9: 2.262, 10: 2.228,
    11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
    16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
    25: 2.060, 30: 2.042, 40: 2.021, 60: 2.000, 120: 1.980,
}


def t_crit(df: int) -> float:
    if df in T_TABLE:
        return T_TABLE[df]
    keys = sorted(T_TABLE)
    for i in range(len(keys) - 1):
        if keys[i] <= df <= keys[i + 1]:
            frac = (df - keys[i]) / (keys[i + 1] - keys[i])
            return T_TABLE[keys[i]] * (1 - frac) + T_TABLE[keys[i + 1]] * frac
    return 1.96


# ---------------------------------------------------------------------------
# Parse raw=[...] from a Playwright log line
# ---------------------------------------------------------------------------

_RAW_RE = re.compile(r'raw=\[([^\]]+)\]')
_SCENARIO_RE = re.compile(r'TIMING (RQ\d+)')


def parse_log(path: Path) -> dict[str, list[float]]:
    """Extract {RQ_label: [run0, run1, ...]} from a playwright-{lib}.log file."""
    data: dict[str, list[float]] = {}
    for line in path.read_text().splitlines():
        sc_m = _SCENARIO_RE.search(line)
        raw_m = _RAW_RE.search(line)
        if sc_m and raw_m:
            rq = sc_m.group(1)
            values = [float(v.strip()) for v in raw_m.group(1).split(',')]
            # If the same RQ appears multiple times (re-runs), take the last one.
            data[rq] = values
    return data


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------

def compute_ci(raw: list[float]) -> tuple[float, float]:
    """Return (mean, half_width_95pct) after excluding raw[0] as warm-up."""
    if len(raw) < 2:
        return (0.0, 0.0)
    steady = raw[1:]
    n = len(steady)
    if n == 1 or all(v == 0.0 for v in steady):
        return (statistics.mean(steady), 0.0)
    mean = statistics.mean(steady)
    sd = statistics.stdev(steady)
    hw = t_crit(n - 1) * sd / math.sqrt(n)
    return mean, hw


# ---------------------------------------------------------------------------
# TOST — two one-sided Welch t-tests for practical equivalence
# ---------------------------------------------------------------------------

def tost(
    vals_a: list[float],
    vals_b: list[float],
    delta: float = 5.0,
) -> tuple[bool, float, float]:
    """Two one-sided Welch t-tests (TOST) for equivalence within ±delta ms.

    Null hypotheses:
        H0_lower: mean_A − mean_B ≤ −delta  (difference too negative)
        H0_upper: mean_A − mean_B ≥ +delta  (difference too positive)

    Equivalence is established when BOTH nulls are rejected at alpha = 0.05.
    Warm-up (index 0) is excluded from each input array, matching compute_ci().

    Returns:
        (equiv_established, t_lower, t_upper)
        t_lower = (diff + delta) / SE  — statistic for H0_lower
        t_upper = (delta − diff) / SE  — statistic for H0_upper
        Reject each null when the corresponding statistic exceeds t_crit(df).
    """
    a = vals_a[1:]  # exclude warm-up
    b = vals_b[1:]
    n_a, n_b = len(a), len(b)
    if n_a < 2 or n_b < 2:
        return (False, float("nan"), float("nan"))
    mean_a = statistics.mean(a)
    mean_b = statistics.mean(b)
    var_a = statistics.variance(a)
    var_b = statistics.variance(b)
    diff = mean_a - mean_b
    se_sq = var_a / n_a + var_b / n_b
    se = math.sqrt(se_sq)
    if se < 1e-12:
        return (True, float("inf"), float("inf"))
    # Satterthwaite degrees of freedom
    df = se_sq ** 2 / (
        (var_a / n_a) ** 2 / (n_a - 1) + (var_b / n_b) ** 2 / (n_b - 1)
    )
    tc = t_crit(max(1, int(df)))
    t_lower = (diff + delta) / se   # rejects H0_lower when > tc
    t_upper = (delta - diff) / se   # rejects H0_upper when > tc
    return (bool(t_lower > tc and t_upper > tc), t_lower, t_upper)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

LIBRARIES = ["redux", "redux-idiomatic", "zustand", "jotai", "context"]

SCENARIO_LABELS: dict[str, str] = {
    "RQ1": "RQ1 — counter ×50",
    "RQ2": "RQ2 — filter ×5",
    "RQ3": "RQ3 — selection ×20",
    "RQ4": "RQ4 — sort ×10",
    "RQ5": "RQ5 — rows ×5",
}

COL = 26  # column width for each library cell


def main() -> None:
    results_dir = Path(__file__).parent.parent / "results"

    # Load per-library data
    lib_data: dict[str, dict[str, list[float]]] = {}
    for lib in LIBRARIES:
        log = results_dir / f"playwright-{lib}.log"
        if not log.exists():
            print(f"WARNING: {log} not found — run 'pnpm benchmark' first", file=sys.stderr)
            lib_data[lib] = {}
        else:
            lib_data[lib] = parse_log(log)

    # Determine N (runs) from first available log
    n_runs = 0
    for lib in LIBRARIES:
        for rq in SCENARIO_LABELS:
            raw = lib_data.get(lib, {}).get(rq)
            if raw:
                n_runs = len(raw)
                break
        if n_runs:
            break

    n_steady = max(n_runs - 1, 0)
    df = max(n_steady - 1, 1)
    try:
        tc = t_crit(df)
    except Exception:
        tc = 1.96

    print(f"Table 4 — Reproduced from results/playwright-{{library}}.log")
    print(f"N={n_runs} total runs per library per scenario; run 0 excluded as warm-up.")
    print(f"N={n_steady} steady-state observations; t(0.975,{df})={tc:.3f}")
    print()

    # Header
    hdr = f"{'Scenario':<24}" + "".join(f"{'[' + lib + ']':>{COL}}" for lib in LIBRARIES)
    print(hdr)
    print("-" * len(hdr))

    for rq, label in SCENARIO_LABELS.items():
        row = f"{label:<24}"
        for lib in LIBRARIES:
            raw = lib_data.get(lib, {}).get(rq)
            if not raw:
                row += f"{'(missing)':>{COL}}"
                continue
            mean, hw = compute_ci(raw)
            if mean == 0.0 and hw == 0.0:
                cell = "0  (no renders)"
            else:
                lo, hi = mean - hw, mean + hw
                cell = f"{mean:.1f} [{lo:.1f}–{hi:.1f}]"
            row += f"{cell:>{COL}}"
        print(row)

    print()
    print("Format: mean [95% CI lower–upper] (ms).  0 = DataTable had no renders in this scenario.")
    print(f"To reproduce: TIMING_RUNS={n_runs} pnpm benchmark")

    # ── TOST equivalence tests ──────────────────────────────────────────────
    # Pre-specified equivalence bound: delta = 5 ms.
    # Tested for RQ2–RQ5 (all libraries have non-zero DataTable render-spans).
    # RQ1 is excluded: Context produces 50 renders vs. 0 for selector libraries
    # — populations are not comparable for a timing equivalence claim.
    DELTA_MS = 5.0
    TOST_RQS = ["RQ2", "RQ3", "RQ4", "RQ5"]
    pairs = [
        (LIBRARIES[i], LIBRARIES[j])
        for i in range(len(LIBRARIES))
        for j in range(i + 1, len(LIBRARIES))
    ]

    print()
    print(
        f"TOST Equivalence Tests — δ={DELTA_MS:.0f} ms, α=0.05"
        " (two one-sided Welch t-tests, Satterthwaite df)"
    )
    print(
        "Equivalence established when both one-sided statistics exceed t_crit."
    )

    for rq in TOST_RQS:
        label = SCENARIO_LABELS.get(rq, rq)
        print(f"\n  {label}")
        for lib_a, lib_b in pairs:
            raw_a = lib_data.get(lib_a, {}).get(rq)
            raw_b = lib_data.get(lib_b, {}).get(rq)
            if not raw_a or not raw_b:
                print(f"    {lib_a:<22} vs {lib_b:<22}: (missing data)")
                continue
            equiv, t_lo, t_hi = tost(raw_a, raw_b, delta=DELTA_MS)
            status = "EQUIV" if equiv else "     "
            n_s = len(raw_a) - 1
            tc = t_crit(max(1, n_s - 1))
            print(
                f"    {lib_a:<22} vs {lib_b:<22}: {status}"
                f"  t₁={t_lo:+.2f}  t₂={t_hi:+.2f}  tc={tc:.3f}"
            )

    print()


if __name__ == "__main__":
    main()
