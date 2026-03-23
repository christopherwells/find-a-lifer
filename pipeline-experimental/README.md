# Pipeline Experiments

Isolated testing environment for pipeline improvements. Does NOT modify production pipeline.

## Setup

Requires raw EBD files in `data/` or `data/downloads/`. Each experiment processes a single region (default: US-ME) and compares metrics against the current baseline.

```bash
# Run all experiments
python pipeline-experimental/experiment.py

# Run specific experiments
python pipeline-experimental/experiment.py --experiment 1,2,3

# Different test region
python pipeline-experimental/experiment.py --region US-MA

# Baseline only
python pipeline-experimental/experiment.py --baseline-only
```

## Experiments

| # | Name | What It Tests | Key Question |
|---|------|--------------|--------------|
| 1 | Effort Normalization | Per-hour frequency rates, MIN_DURATION→10min | Does normalizing reduce duration bias? |
| 2 | Area Protocol | Add CBC/atlas "Area" protocol data | Does systematic survey data improve winter coverage? |
| 3 | Observer Weighting | Weight by observer experience (log scale) | Do experienced observers produce smoother frequencies? |
| 4 | Recency Weighting | 10-year half-life time decay | Do recent data better reflect current distributions? |
| 5 | Partial Checklists | Presence-only recovery from incomplete lists | Does partial data fill gaps or add noise? |
| 6 | Maximum Data | All filters relaxed (5min, 16km, all protocols) | Kitchen sink — is more data always better? |
| 7 | All Quality | Improvements 1-4 combined (conservative combo) | Do quality improvements compound? |

## Evaluation Criteria

Each experiment is judged on signal-to-noise, NOT just sample size:

- **Smoothness** (lower = better): mean |freq(cell) - mean(freq(neighbors))|
- **Freq StdDev** (context-dependent): should decrease with better data, but not collapse to uniform
- **Coverage** (higher = better): cells with frequency data
- **Species count** (should be stable): gaining/losing species indicates data quality issues
- **Spot checks**: Northern Cardinal (common), Bicknell's Thrush (rare), Kirtland's Warbler (range-restricted)

**Critical principle:** Adding data that increases noise is worse than no change. Sample size gains are only valuable if they improve or maintain smoothness.

## Output

- `results/comparison.json` — raw metrics for all experiments
- `results/report.txt` — human-readable comparison table with delta from baseline
- `output/` — intermediate data files (not committed to git)

## Files

- `experiment.py` — test harness, runs experiments and generates reports
- `improved_ebd.py` — fork of process_ebd.py with all improvement flags
- `occupancy_model.py` — single-season occupancy model (to be built)
- `compare_results.py` — visualization/chart generation (to be built)
