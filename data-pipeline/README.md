# Find-A-Lifer Data Pipeline

Processes the eBird Basic Dataset (EBD) to compute **reporting frequency** per species per H3 hex cell per week. The output feeds directly into the Find-A-Lifer web app.

## What It Computes

**Reporting frequency** = (checklists detecting species X) / (total checklists) for each H3 cell and week, pooled over 20 years (2006-2025).

The app's composite "lifer probability" metric uses these per-species frequencies:

```
P(any_lifer | cell, week) = 1 - prod(1 - freq_i for all unseen species i)
```

This product is computed in the **frontend** using the user's personal life list. The pipeline provides the freq_i values that make it possible.

## Prerequisites

- **R 4.0+** (tested with 4.3+)
- **eBird Basic Dataset access** — request at https://ebird.org/data/download
  - Download both the EBD observations file and the Sampling Event Data (SED)
  - For Maine PoC: request data for US-ME only (much smaller download)
- **Cygwin with gawk** (Windows only) — required by the `auk` R package
  - Install from https://www.cygwin.com/, select the `gawk` package during install
  - Then in R: `auk::auk_set_awk_path("C:/cygwin64/bin/gawk.exe")`
- **R packages** — installed automatically by `00_setup.R`:
  - `auk` (EBD filtering), `sf` (spatial), `data.table` (fast aggregation)
  - `h3jsr` (H3 hex grid via V8), `jsonlite` (JSON export), `lubridate` (dates)

## Quick Start (Maine Proof of Concept)

```bash
# 1. Install R packages and check environment
Rscript 00_setup.R

# 2. Edit config.R — set paths to your EBD and SED files
#    EBD_FILE <- "C:/path/to/ebd_US-ME_relXXX.txt"
#    SED_FILE <- "C:/path/to/ebd_sampling_relXXX.txt"

# 3. Filter raw EBD (slowest step, ~5-15 min for Maine)
Rscript 01_filter_ebd.R

# 4. Import data and assign H3 cells + weeks (~1-3 min)
Rscript 02_import_and_assign.R

# 5. Compute reporting frequency (~1-2 min)
Rscript 03_compute_frequency.R

# 6. Export JSON files for the app (~1 min)
Rscript 04_export_json.R

# 7. Validate output against known species patterns
Rscript 05_validate.R

# 8. Copy output to the app
cp -r output/json/* ../backend/data/
# Rename grid file to match what main.py expects
mv ../backend/data/grid_h3.geojson ../backend/data/grid_27km.geojson
```

## Pipeline Steps

| Script | Purpose | Runtime (Maine) | Runtime (Full NA) |
|--------|---------|-----------------|-------------------|
| `00_setup.R` | Install packages, check environment | ~1 min | ~1 min |
| `01_filter_ebd.R` | Filter raw EBD with auk effort filters | 5-15 min | 2-6 hours |
| `02_import_and_assign.R` | Import, assign H3 cells + week numbers | 1-3 min | 15-45 min |
| `03_compute_frequency.R` | Compute reporting frequency per species/cell/week | 1-2 min | 5-15 min |
| `04_export_json.R` | Export weekly JSON, species.json, grid GeoJSON | <1 min | 2-5 min |
| `05_validate.R` | Validate against known species patterns | <1 min | <1 min |

## Configuring for Full North America

Edit `config.R`:

```r
# Change geographic scope
COUNTRY_CODES <- c("US", "CA", "MX")
STATE_CODES   <- NULL  # NULL = don't filter by state

# You'll need the full EBD download (~200 GB uncompressed)
EBD_FILE <- "path/to/ebd_relXXX.txt"
SED_FILE <- "path/to/ebd_sampling_relXXX.txt"

# Consider adjusting H3 resolution for the larger area
H3_RESOLUTION <- 3  # Larger cells for continental scale (~60 km edge)
# or keep at 4 for finer resolution (~22 km edge, more cells)
```

For the full NA run, use the Bowdoin HPC. The filtering step (01) is I/O-bound and benefits from fast storage. Steps 02-04 are CPU/memory-bound and benefit from more RAM (16+ GB recommended for full NA at resolution 4).

## Output Files

All output goes to `output/json/`:

| File | Format | Description |
|------|--------|-------------|
| `species.json` | JSON array | Species metadata with derived metrics |
| `weeks/week_01.json` ... `week_52.json` | JSON array | `[[cell_id, [[species_id, freq_uint8], ...]], ...]` |
| `weeks/week_01_summary.json` ... | JSON array | `[[cell_id, n_species, max_freq_uint8], ...]` |
| `grid_h3.geojson` | GeoJSON FeatureCollection | H3 cell polygons with `cell_id` property |
| `cell_mapping.json` | JSON array | `[{cell_id, h3_index}, ...]` |

### Frequency encoding

Frequencies are stored as uint8 (0-255) in weekly files: `freq_uint8 = round(frequency * 255)`. To decode: `frequency = freq_uint8 / 255.0`.

### Species metadata fields

Each species in `species.json` includes frequency-derived metrics:
- `difficultyScore` — 1 minus max reporting frequency (0 = very easy, 1 = very hard)
- `peakWeek` — week number with highest mean frequency
- `seasonalityScore` — coefficient of variation of weekly frequencies (0 = year-round, 1 = highly seasonal)
- `isRestrictedRange` — true if found in fewer than 10% of cells

## H3 Grid

The pipeline uses [H3](https://h3geo.org/) hexagonal cells instead of the previous custom grid. H3 advantages:
- Standardized, globally consistent hex grid
- Each cell has a unique string index (e.g., `8428b0dffffffff`)
- Cells are approximately equal area at each resolution
- Resolution 4 (~1,770 km2, ~22 km edge) is closest to the previous 27 km grid

## Effort Filters

Following eBird best practices, only checklists meeting ALL criteria are included:
- Complete checklists only (all species reported)
- Stationary or Traveling protocol
- Duration <= 6 hours
- Distance <= 10 km (traveling counts)
- Observers <= 10
- Minimum 5 checklists per cell per week for a frequency estimate

## Troubleshooting

**"AWK not found" error in 01_filter_ebd.R:**
On Windows, install Cygwin with gawk, then run:
```r
auk::auk_set_awk_path("C:/cygwin64/bin/gawk.exe")
```

**h3jsr errors:**
h3jsr requires the V8 JavaScript engine. Install with:
```r
install.packages("V8")
# On Linux: sudo apt-get install libv8-dev
```

**Out of memory on full NA run:**
- Use H3 resolution 3 (fewer, larger cells)
- Process one region at a time
- Use the HPC with 32+ GB RAM

**"Column not found" errors in 03_compute_frequency.R:**
The column names depend on your auk version. The script auto-detects the species identifier column. If it fails, check `names(observations)` and adjust accordingly.
