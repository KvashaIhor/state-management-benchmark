#!/usr/bin/env python3
"""Generate Figure 2: bundle overhead bar chart as a PDF vector figure."""

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

libraries = ['Redux Toolkit\nv2.5', 'Jotai\nv2.12', 'Zustand\nv5.0', 'Context\n(built-in)']
deltas = [10, 5, 2, 2]
colors = ['#4C72B0', '#DD8452', '#55A868', '#C44E52']

fig, ax = plt.subplots(figsize=(5.5, 3.2))

bars = ax.bar(libraries, deltas, color=colors, width=0.5, edgecolor='white', linewidth=0.8)

for bar, val in zip(bars, deltas):
    ax.text(
        bar.get_x() + bar.get_width() / 2,
        bar.get_height() + 0.15,
        f'+{val} KB',
        ha='center', va='bottom', fontsize=9, fontweight='bold'
    )

ax.set_ylabel('First Load JS delta (KB)', fontsize=9)
ax.set_title('Bundle overhead above 102 KB shared baseline', fontsize=10, pad=8)
ax.set_ylim(0, 14)
ax.yaxis.set_tick_params(labelsize=8)
ax.xaxis.set_tick_params(labelsize=8)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.axhline(0, color='black', linewidth=0.5)

fig.tight_layout()
out = 'paper/figure2.pdf'
fig.savefig(out, format='pdf', bbox_inches='tight')
print(f'Saved {out}')
