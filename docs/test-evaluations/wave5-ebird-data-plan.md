# Find-A-Lifer: EBD Data Pipeline Plan

## Executive Summary

The current data pipeline uses eBird Status & Trends (S&T) raster data, which only provides **abundance** (expected count) for ~1,850 species. The frontend was designed around probability/frequency values (0-1), but the pipeline hardcodes `probability: 1.0` for every species-cell pair. This plan describes how to build a new pipeline using the **eBird Basic Dataset (EBD)** — raw checklist-level observation data — to compute real **reporting frequency** values (`checklists_reporting / total_checklists`) for all 2,490 North American species across 52 weeks and the app's existing hex grid.

---

## 1. EBD Data Overview

### What Is the EBD?

The eBird Basic Dataset is a tab-separated text dump of every eBird checklist observation ever submitted. It is distributed as two paired files:

- **EBD (observations file)**: One row per species observation per checklist. Contains species identification, count, location, date, effort, and metadata.
- **Sampling Event Data (SED)**: One row per checklist. Contains date, time, location, effort variables, protocol, observer info, and the critical `all_species_reported` flag.

These two files are linked by the `sampling_event_identifier` field. Together they enable construction of **presence-absence** (detection/non-detection) data: if a species appears on a complete checklist, it was detected; if it does not appear but the checklist is complete, it was *not* detected.

### How to Get the Data

1. Go to https://ebird.org/data/download
2. Submit a **Custom Download** request (the full EBD is 100+ GB compressed)
3. Filter by region (e.g., "North America" or specific countries: US, CA, MX, plus Caribbean/Central America countries)
4. Request **both** the EBD and the Sampling Event Data
5. Data arrives as a `.zip` containing tab-separated `.txt` files with a release identifier (e.g., `ebd_relDec-2025.txt`)

**You already have EBD access**, so this step is done.

### Raw Data Size

| Component | Approximate Size |
|-----------|-----------------|
| Full global EBD (compressed) | ~100 GB |
| North America EBD (compressed) | ~40-60 GB |
| North America EBD (uncompressed) | ~150-250 GB |
| North America SED (uncompressed) | ~30-50 GB |
| After auk filtering (complete checklists, traveling/stationary, effort-filtered) | ~30-60 GB |

The uncompressed EBD for North America alone will be hundreds of gigabytes. This is why `auk` exists: it uses AWK to filter the data *before* loading into R.

### Key EBD Fields for This Pipeline

**From the observations file (EBD):**
- `sampling_event_identifier` — links to SED
- `common_name`, `scientific_name`, `taxonomic_order`
- `observation_count` — number seen (or "X" for presence-only)
- `latitude`, `longitude`
- `observation_date`
- `all_species_reported` — whether the checklist is "complete"

**From the sampling event data (SED):**
- `sampling_event_identifier`
- `latitude`, `longitude`
- `observation_date`
- `time_observations_started`
- `protocol_type` — Stationary, Traveling, Incidental, Historical, Area
- `duration_minutes`
- `effort_distance_km`
- `number_observers`
- `all_species_reported`

---

## 2. auk Package Usage

### Setup

```r
install.packages("auk")
library(auk)
```

**Windows requirement**: auk needs Cygwin installed (it calls `gawk`). Default expected path: `C:/cygwin64/bin/gawk.exe`. If installed elsewhere, set `AWK_PATH` in `.Renviron`.

### Core Workflow

The auk workflow is a four-step process: reference, define filters, execute, import.

```r
# Step 1: Reference both the EBD and sampling event files
f_ebd <- "path/to/ebd_relDec-2025.txt"
f_sed <- "path/to/ebd_sampling_relDec-2025.txt"

# Step 2: Define filters (nothing runs yet — just builds a filter spec)
filters <- auk_ebd(f_ebd, file_sampling = f_sed) %>%
  auk_country(c("US", "CA", "MX", "BZ", "GT", "HN", "SV", "NI", "CR", "PA",
                 "CU", "JM", "HT", "DO", "PR", "BS", "TT", "BB", "GL")) %>%
  auk_protocol(c("Stationary", "Traveling")) %>%
  auk_duration(c(0, 360)) %>%       # max 6 hours
  auk_distance(c(0, 10)) %>%        # max 10 km
  auk_complete()                     # only complete checklists

# Step 3: Execute filtering (takes HOURS on full EBD)
filtered <- auk_filter(filters,
                       file = "ebd_filtered.txt",
                       file_sampling = "sed_filtered.txt")

# Step 4: Import into R
observations <- read_ebd(filtered)
checklists <- read_sampling(filtered)
```

### Critical Functions

| Function | Purpose |
|----------|---------|
| `auk_ebd()` | Create reference to EBD + SED files |
| `auk_country()` | Filter by country codes |
| `auk_protocol()` | Keep only Stationary/Traveling |
| `auk_duration()` | Keep checklists 0-360 minutes |
| `auk_distance()` | Keep checklists 0-10 km |
| `auk_complete()` | Only complete checklists (required for zero-fill) |
| `auk_date()` | Filter by date range (supports `"*-01-01"` wildcards for any year) |
| `auk_filter()` | Execute the AWK filtering (slow — hours) |
| `read_ebd()` | Import filtered observations |
| `read_sampling()` | Import filtered sampling events |
| `auk_unique()` | Deduplicate shared/group checklists (called automatically by `read_ebd()`) |
| `auk_rollup()` | Roll subspecies up to species level (called automatically by `read_ebd()`) |
| `auk_zerofill()` | Create presence-absence data from EBD + SED |

### Zero-Filling

This is the most important step. `auk_zerofill()` combines the observations file with the sampling events file to create detection/non-detection records. For every complete checklist, species that were NOT reported are inferred as non-detections.

```r
# Zero-fill creates a list with $observations and $sampling_events
zf <- auk_zerofill(filtered)

# Or collapse to a flat data frame
zf_df <- auk_zerofill(filtered, collapse = TRUE)
# Result has a `species_observed` column: TRUE/FALSE
```

**Critical**: `auk_complete()` must be called before zero-filling, because non-detection inference only works on complete checklists.

---

## 3. Frequency Calculation

### The Core Metric

**Reporting frequency** (also called encounter rate in eBird best practices):

```
frequency = checklists_detecting_species / total_complete_checklists
```

Per species, per grid cell, per week. This gives a value from 0 to 1 representing how likely a birder is to report that species on a standard checklist in that cell during that week.

### Following eBird Best Practices

The eBird best practices guide recommends several steps to reduce bias:

#### Step 1: Effort Filtering

Keep only checklists that meet standardized effort criteria:

| Filter | Threshold | Rationale |
|--------|-----------|-----------|
| Protocol | Stationary or Traveling | Incidental/Historical have inconsistent effort |
| Duration | <= 6 hours (360 min) | Very long checklists inflate detection |
| Distance | <= 10 km | Long-distance checklists blur spatial precision |
| Speed | <= 100 km/h | Unreasonably fast checklists are data entry errors |
| Observers | <= 10 | Large groups have different detection dynamics |
| Complete | TRUE | Required for non-detection inference |

#### Step 2: Spatial Subsampling (Recommended but Optional)

eBird data is heavily biased toward populated areas, roads, and popular birding spots. The best practices guide recommends **grid-based spatial subsampling** to reduce this bias:

- Overlay a fine grid (e.g., 3 km) on the study area
- Within each grid cell and each week, randomly sample a fixed number of checklists (e.g., 1 per cell per week)
- This gives underbirded areas equal weight to heavily birded areas

**For Find-A-Lifer**: Since our grid cells are 27 km, the spatial subsampling is somewhat built in — we are already aggregating at a coarse scale. However, within each 27 km cell, some spots may have hundreds of checklists while others have none. Two options:

1. **Simple approach (recommended to start)**: Skip subsampling. Just count all effort-filtered checklists per cell per week. The 27 km aggregation already smooths out much of the spatial bias.
2. **Advanced approach**: Subdivide each 27 km cell into a 3 km sub-grid, sample 1 checklist per sub-cell per week, then aggregate up. This would be more rigorous but adds significant complexity.

#### Step 3: Temporal Aggregation

Group checklists by **week of year** (1-52), pooling across all years in the dataset. This gives a single "typical week" frequency for each species-cell combination.

Alternatively, use only the most recent N years (e.g., 2019-2025) to reflect current distributions and avoid outdated historical records.

#### Step 4: Compute Frequency

For each (species, cell, week) combination:

```r
frequency <- n_checklists_detecting / n_total_checklists
```

Where:
- `n_checklists_detecting` = number of complete, effort-filtered checklists in that cell/week where the species was reported
- `n_total_checklists` = total number of complete, effort-filtered checklists in that cell/week

#### Step 5: Minimum Sample Size Threshold

Cells/weeks with very few checklists produce unreliable frequencies. Apply a minimum threshold:

- **Recommended**: Require at least 5-10 checklists per cell per week to compute frequency
- Cells below this threshold should be marked as `NA` / excluded from the output
- This naturally handles remote areas (northern Canada, Arctic, open ocean) where there is no eBird data

### What Frequency Means for Users

A frequency of 0.35 for Red-tailed Hawk in cell X during week 20 means: "35% of complete, standardized eBird checklists submitted from this cell during mid-May reported Red-tailed Hawk." This is a direct, interpretable metric that birders understand intuitively.

---

## 4. Grid Alignment

### Current Grid Structure

The app uses a hexagonal grid with 27 km resolution over North America:
- **229,814 grid cells** in `grid_27km.geojson`
- Each cell has a `cell_id` property (integer, e.g., 171856)
- Geometry type: `Polygon` (hexagons stored as 7-vertex polygons)

The weekly data currently references **268,173 unique cells** in week 1 (some may be from a different grid version). The cell IDs are large integers (e.g., 291064).

### Assigning Checklists to Grid Cells

Each eBird checklist has a `latitude` and `longitude`. To assign it to a grid cell:

#### Option A: Point-in-Polygon (Precise but Slow)

```r
library(sf)

# Load grid
grid <- st_read("grid_27km.geojson")

# Convert checklists to spatial points
pts <- st_as_sf(checklists, coords = c("longitude", "latitude"), crs = 4326)

# Spatial join
assigned <- st_join(pts, grid, join = st_within)
```

This is the most accurate method but can be slow for hundreds of millions of checklists. Use `sf::st_join()` with spatial indexing.

#### Option B: Nearest Cell Center (Fast Approximation)

```r
library(FNN)

# Load grid centers (precomputed from grid_centers.json or computed from polygon centroids)
centers <- data.frame(cell_id = grid$cell_id,
                      lon = st_coordinates(st_centroid(grid))[,1],
                      lat = st_coordinates(st_centroid(grid))[,2])

# For each checklist, find nearest cell center
nn <- get.knnx(as.matrix(centers[,c("lon","lat")]),
               as.matrix(checklists[,c("longitude","latitude")]),
               k = 1)

checklists$cell_id <- centers$cell_id[nn$nn.index[,1]]
```

Nearest-neighbor on 27 km cells is fast and introduces minimal error.

#### Option C: H3 Index (If Grid Uses H3)

If the hex grid is based on H3 (Uber's hierarchical hex grid), assignment is trivial:

```r
library(h3jsr)
checklists$cell_id <- point_to_cell(checklists$latitude, checklists$longitude, res = 3)
```

**Recommendation**: Check whether the existing grid is H3-based (the large integer cell IDs like 291064 suggest it might be a custom grid, not H3). If custom, use Option A (point-in-polygon) for correctness, batched to manage memory.

### Grid Centers File

There is already a `grid_centers.json` (5.9 MB) in the data directory. This likely contains precomputed centroids and could be used for nearest-neighbor assignment if point-in-polygon is too slow.

---

## 5. Data Pipeline Architecture

### Overview

```
Raw EBD + SED files
    |
    v
[Step 1: auk filtering] ──> Filtered EBD + SED text files (~30-60 GB)
    |
    v
[Step 2: Import & assign to grid cells] ──> R data frames with cell_id column
    |
    v
[Step 3: Compute weekly frequency matrices] ──> Per-species, per-cell, per-week frequency
    |
    v
[Step 4: Export to JSON] ──> 52 weekly JSON files + species.json + summaries
    |
    v
[Step 5: Validate & deploy] ──> Copy to backend/data/weeks/
```

### Detailed Script Architecture

#### Script 1: `01_filter_ebd.R` — Filter raw EBD with auk

**Input**: Raw `ebd_relXXX.txt` + `ebd_sampling_relXXX.txt`
**Output**: `ebd_filtered.txt` + `sed_filtered.txt`
**Runtime**: 2-6 hours (runs once)

```r
library(auk)

auk_ebd("ebd_relDec-2025.txt", file_sampling = "ebd_sampling_relDec-2025.txt") %>%
  auk_country(c("US", "CA", "MX", ...)) %>%   # All NA countries
  auk_protocol(c("Stationary", "Traveling")) %>%
  auk_duration(c(0, 360)) %>%
  auk_distance(c(0, 10)) %>%
  auk_complete() %>%
  auk_filter(file = "ebd_filtered.txt",
             file_sampling = "sed_filtered.txt")
```

#### Script 2: `02_import_and_assign.R` — Import filtered data and assign grid cells

**Input**: `ebd_filtered.txt`, `sed_filtered.txt`, `grid_27km.geojson`
**Output**: `checklists_with_cells.rds`, `observations_with_cells.rds`
**Runtime**: 30-60 minutes

```r
library(auk)
library(sf)
library(dplyr)

# Import
obs <- read_ebd("ebd_filtered.txt")
checklists <- read_sampling("sed_filtered.txt")

# Load grid
grid <- st_read("grid_27km.geojson")

# Assign checklists to cells via spatial join
pts <- st_as_sf(checklists, coords = c("longitude", "latitude"), crs = 4326)
checklists$cell_id <- st_join(pts, grid)$cell_id

# Assign week number (1-52)
checklists$week <- as.integer(format(checklists$observation_date, "%V"))

# Join cell_id back to observations
obs <- left_join(obs, checklists %>% select(sampling_event_identifier, cell_id, week),
                 by = "sampling_event_identifier")

# Save intermediate results
saveRDS(checklists, "checklists_with_cells.rds")
saveRDS(obs, "observations_with_cells.rds")
```

**Memory note**: The filtered EBD for all of North America may be tens of millions of rows. If memory is tight, process in chunks by country or by month.

#### Script 3: `03_compute_frequency.R` — Compute frequency per species/cell/week

**Input**: `checklists_with_cells.rds`, `observations_with_cells.rds`
**Output**: `frequency_matrix.rds` (or one file per week)
**Runtime**: 10-30 minutes

```r
library(dplyr)

checklists <- readRDS("checklists_with_cells.rds")
obs <- readRDS("observations_with_cells.rds")

# Count total checklists per cell per week
total_checklists <- checklists %>%
  filter(!is.na(cell_id)) %>%
  count(cell_id, week, name = "n_total")

# Count detecting checklists per species per cell per week
detections <- obs %>%
  filter(!is.na(cell_id)) %>%
  distinct(sampling_event_identifier, cell_id, week, scientific_name) %>%
  count(cell_id, week, scientific_name, name = "n_detected")

# Join and compute frequency
frequency <- detections %>%
  left_join(total_checklists, by = c("cell_id", "week")) %>%
  mutate(frequency = n_detected / n_total) %>%
  filter(n_total >= 5)  # minimum sample size threshold

saveRDS(frequency, "frequency_matrix.rds")
```

#### Script 4: `04_export_json.R` — Export to weekly JSON files

**Input**: `frequency_matrix.rds`, `species.json`
**Output**: `week_01.json` through `week_52.json`, `week_01_summary.json` through `week_52_summary.json`
**Runtime**: 5-15 minutes

```r
library(dplyr)
library(jsonlite)

frequency <- readRDS("frequency_matrix.rds")
species_meta <- fromJSON("species.json")

# Build species name -> species_id lookup
sp_lookup <- setNames(species_meta$species_id, species_meta$sciName)

# Add species_id
frequency$species_id <- sp_lookup[frequency$scientific_name]

for (w in 1:52) {
  week_data <- frequency %>% filter(week == w)

  # Format: [[cell_id, [[species_id, frequency], ...]], ...]
  # Or to match current format: [[cell_id, [species_id_1, species_id_2, ...]], ...]
  # with frequency stored separately or encoded

  # Option A: Keep current format (species list only, threshold-based presence)
  # Option B: New format with frequency values (see Section 7)

  by_cell <- week_data %>%
    group_by(cell_id) %>%
    summarise(
      species = list(species_id),
      freqs = list(round(frequency, 4)),
      .groups = "drop"
    )

  # Export as [[cell_id, [[sp_id, freq], [sp_id, freq], ...]], ...]
  output <- lapply(seq_len(nrow(by_cell)), function(i) {
    list(by_cell$cell_id[i],
         mapply(c, by_cell$species[[i]], by_cell$freqs[[i]], SIMPLIFY = FALSE))
  })

  write_json(output, sprintf("week_%02d.json", w), auto_unbox = TRUE)

  # Summary file: [[cell_id, n_species, max_freq_uint8], ...]
  summary_data <- week_data %>%
    group_by(cell_id) %>%
    summarise(
      n_species = n(),
      max_freq_uint8 = as.integer(round(max(frequency) * 255)),
      .groups = "drop"
    )

  summary_output <- lapply(seq_len(nrow(summary_data)), function(i) {
    c(summary_data$cell_id[i], summary_data$n_species[i], summary_data$max_freq_uint8[i])
  })

  write_json(summary_output, sprintf("week_%02d_summary.json", w), auto_unbox = TRUE)
}
```

#### Script 5: `05_update_species_meta.R` — Enrich species.json with frequency-derived metrics

**Input**: `frequency_matrix.rds`, existing `species.json`
**Output**: Updated `species.json`

This script recomputes:
- `difficultyScore`: average frequency across all cells/weeks where species occurs (lower frequency = harder)
- `isRestrictedRange`: species appears in fewer than N cells
- `peakWeek`: week with highest average frequency
- `seasonalityScore`: variance of frequency across weeks

---

## 6. Data Size Estimates

### Input Data Sizes

| Stage | Records | Disk Size |
|-------|---------|-----------|
| Raw North America EBD | ~500-800M observation rows | ~150-250 GB uncompressed |
| Raw North America SED | ~80-120M checklist rows | ~30-50 GB uncompressed |
| After auk filtering (effort + complete) | ~200-400M obs / ~40-80M checklists | ~30-60 GB |
| After import to R (data frames) | Same row counts | ~10-20 GB in memory |
| Frequency matrix (species x cell x week) | ~20-50M rows | ~2-5 GB in memory |

### Output Data Sizes

| File | Current Size | Estimated New Size |
|------|-------------|-------------------|
| `week_XX.json` (52 files) | 2,066 MB total (~40 MB each) | ~2,500-4,000 MB total (frequency values add bytes) |
| `week_XX_summary.json` (52 files) | Small | ~50-100 MB total |
| `species.json` | 1.1 MB | ~1.2 MB (minor additions) |
| `grid_27km.geojson` | 39.8 MB | No change |

**Key insight**: Adding real frequency values will increase weekly file sizes because the current format just stores species ID lists (integers), while the new format needs to store (species_id, frequency) pairs. Estimate roughly 1.5-2x increase.

### Compression Impact

The backend already uses GZip middleware. JSON with many repeated structures compresses well:
- Current 40 MB week file -> ~5-8 MB gzipped
- New format with frequencies -> ~8-12 MB gzipped

---

## 7. What Changes in the Backend

### Weekly Data Format Change

**Current format** (`week_XX.json`):
```json
[[cell_id, [species_id_1, species_id_2, ...]], ...]
```
No frequency values — everything is implicitly `probability: 1.0`.

**New format options**:

#### Option A: Nested pairs (recommended)
```json
[[cell_id, [[species_id, frequency_uint8], [species_id, frequency_uint8], ...]], ...]
```
Where `frequency_uint8` is `round(frequency * 255)` — an integer 0-255. This is compact and gives ~0.4% precision, more than sufficient for heatmap coloring.

#### Option B: Parallel arrays
```json
[[cell_id, [species_id_1, species_id_2, ...], [freq_1, freq_2, ...]], ...]
```
Slightly more compact but harder to parse.

#### Option C: Threshold-based (minimal change)
Keep the current format but only include species with `frequency >= 0.01`. This requires no frontend format changes but loses the actual frequency values.

**Recommendation**: Option A. It preserves actual frequency data, is compact with uint8 encoding, and is straightforward to parse.

### Backend Code Changes (`main.py`)

1. **`_load_week_data()`**: Update parser to handle the new `[[cell_id, [[sp_id, freq], ...]], ...]` format. Store frequencies alongside species IDs.

2. **`get_week()` endpoint**: Return `probability` from actual frequency data instead of hardcoded `1.0`.

3. **`get_week_species()` endpoint**: Return per-cell frequency for the requested species.

4. **`get_week_cell()` endpoint**: Return frequency alongside species info in the popup data.

5. **`get_week_summary()` endpoint**: Use actual `max_freq_uint8` from summary files instead of hardcoded `200`.

6. **`get_lifer_summary()` endpoint**: Incorporate frequency into the lifer summary (e.g., weighted lifer count, or max frequency of any lifer in the cell).

### Summary File Format Change

**Current**: `[[cell_id, species_count, 200], ...]` (hardcoded 200)
**New**: `[[cell_id, species_count, max_freq_uint8], ...]` (real max frequency)

### No Grid Changes Needed

The grid GeoJSON stays the same. Cell IDs remain the same. The grid is purely spatial geometry.

---

## 8. What Changes in the Frontend

### Type Changes

The `probability` field in `TripLifer` and various API response interfaces already exists and expects a 0-1 float. The change is that it will now contain real values instead of always being `1.0`.

No new types are needed, but interfaces that consume probability data will start showing meaningful variation.

### Behavioral Changes

1. **Heatmap coloring**: Currently all cells with any species have the same intensity. With real frequencies, cells will show graduated color intensity based on actual reporting frequency. The `max_freq_uint8` in summary data drives this.

2. **Species range view**: Instead of binary "present/absent", cells will show a gradient based on frequency. High-frequency cells (e.g., 0.8) are dark; low-frequency cells (e.g., 0.05) are faint.

3. **Trip planning**: Lifer rankings can now be sorted by actual probability of encounter, not just presence/absence. A Red-tailed Hawk with 0.65 frequency is more likely to be found than a Connecticut Warbler with 0.02.

4. **Species info cards**: The `difficultyScore` and `difficultyLabel` will be based on real frequency data, making them meaningful.

5. **Cell popup**: When clicking a cell, species can be sorted by frequency, and frequency can be displayed next to each species name.

### Data Parsing

The frontend's weekly data parsing code (in `MapView.tsx` or wherever weekly data is consumed) needs to handle the new format with frequency values. If the backend API already returns `probability` in the response (just currently hardcoded to 1.0), the frontend may need minimal changes — the backend does the format translation.

### Potential Display Additions

- Show frequency as a percentage next to species names in cell popups: "Red-tailed Hawk (65%)"
- Color-code species in lists by frequency
- Add frequency to the trip planner rankings
- Update the legend to show frequency scale

---

## 9. Challenges & Gotchas

### 9.1 Zero-Inflation

Most species are absent from most cells in most weeks. The frequency matrix is extremely sparse. A typical cell in week 1 currently has a median of 7 species (out of 2,490). This is expected and correct — most cells are outside most species' ranges.

**Mitigation**: Only store non-zero frequencies in the JSON output. The current format already does this (only cells with species present are included).

### 9.2 Effort Variability

eBird checklists vary enormously in effort: a 5-minute backyard count vs. a 6-hour Big Day. Even after effort filtering (max 6 hours, 10 km), a 5-minute checklist will detect far fewer species than a 3-hour checklist.

**Mitigation**: The frequency calculation inherently accounts for this at scale. With enough checklists per cell/week, the varying efforts average out. The eBird best practices guide's more sophisticated approach (modeling encounter rate as a function of effort covariates using random forests) is overkill for this app's needs — simple frequency is sufficient and interpretable.

### 9.3 Spatial Bias

eBird data is heavily concentrated near cities, roads, and popular birding destinations. Central Park may have thousands of checklists per week; remote parts of northern Canada may have zero.

**Mitigation**:
- The minimum checklist threshold (5-10 per cell/week) naturally excludes under-surveyed areas
- The 27 km grid aggregation smooths some bias
- For the app's purpose (helping birders plan trips), bias toward accessible areas is actually a *feature* — those are the places users can actually go
- Future improvement: spatial subsampling within cells

### 9.4 Temporal Coverage Gaps

Some cells have data in summer but not winter (or vice versa). Northern cells may only have data in summer. Tropical cells may have sparse data year-round.

**Mitigation**: The minimum checklist threshold handles this. Cells with no data in a given week simply won't appear in the output for that week.

### 9.5 Species with Few Reports

Rare species (e.g., vagrant warblers, accidentals) may appear on very few checklists. A single report in a cell with 100 checklists gives frequency = 0.01, which is low but real. A single report in a cell with 5 checklists gives frequency = 0.20, which is misleadingly high.

**Mitigation**:
- The minimum checklist threshold helps (require >= 5 or 10 checklists)
- Consider a secondary threshold: require at least 2 detections to include a species-cell-week combination
- For very rare species, frequency will be very low — this is correct and useful

### 9.6 Taxonomy Alignment

The EBD uses eBird taxonomy (updated annually, usually in August). The app's species list must match. `auk_rollup()` handles subspecies consolidation, but species splits/lumps between taxonomy versions can cause mismatches.

**Mitigation**:
- Use the same eBird taxonomy version for the EBD download and the species list
- `auk` includes the current taxonomy; ensure the auk version matches the EBD release
- After processing, verify all species in the output match species in `species.json`

### 9.7 Memory and Computation

Processing hundreds of millions of checklist records requires significant RAM. The full filtered EBD for North America may require 16-32 GB of RAM to hold in a single R data frame.

**Mitigation**:
- Process by country or region, then merge results
- Process one week at a time instead of all 52 at once
- Use Bowdoin HPC for the heavy steps
- The `data.table` package is much more memory-efficient than `dplyr` for large datasets — consider using it for the aggregation step

### 9.8 Checklist Date to Week Mapping

R's `%V` format gives ISO week numbers (1-53). Some years have week 53. eBird S&T uses a different week numbering system.

**Mitigation**: Use a consistent week mapping. One approach: `week <- ceiling(as.integer(format(date, "%j")) / 7)`, capped at 52 (days 358-365/366 go into week 52). This matches the app's 1-52 week system.

### 9.9 Cross-Border Grid Cells

Grid cells on country borders may contain checklists from multiple countries. This is fine — the frequency calculation naturally handles it since it counts all checklists regardless of country.

---

## 10. Recommended Approach

### Phase 1: Proof of Concept (1-2 days)

**Goal**: Validate the pipeline with a small subset.

1. Download a custom EBD extract for a single US state (e.g., Maine) — much smaller and faster
2. Install `auk` and Cygwin (if on Windows)
3. Run `auk_filter()` on the state data with effort filters
4. Import, assign to grid cells, compute frequency for 1 week
5. Verify the frequency values look reasonable (compare to eBird bar charts for known species)
6. Export one week of JSON in the new format
7. Update the backend to parse the new format
8. Confirm the frontend displays real frequency gradients on the map

**Estimated effort**: 1-2 days

### Phase 2: Full North America Pipeline (2-3 days)

**Goal**: Process the complete North America EBD.

1. Request the full NA EBD + SED custom download (if not already done)
2. Run `auk_filter()` on the full dataset — let this run overnight or on HPC
3. Import the filtered data in chunks (by country or by month)
4. Assign all checklists to grid cells using spatial join
5. Compute frequency matrix for all 52 weeks
6. Export all 52 weekly JSON files + summaries
7. Update `species.json` with frequency-derived metrics
8. Copy output to `backend/data/weeks/`

**Estimated effort**: 2-3 days (including overnight filtering runs)

### Phase 3: Backend + Frontend Integration (1-2 days)

**Goal**: Update the app to use real frequency data.

1. Update `main.py` to parse the new weekly data format
2. Return real probability values instead of `1.0`
3. Update summary endpoint to use real `max_freq_uint8`
4. Update frontend cell popup to display frequency percentages
5. Verify heatmap gradient colors respond to varying frequencies
6. Update trip planner to sort by actual frequency
7. Test all view modes with real data

**Estimated effort**: 1-2 days

### Phase 4: Refinement (1-2 days)

**Goal**: Polish and validate.

1. Compare frequency values against eBird bar charts for 10-20 species to validate
2. Tune the minimum checklist threshold (5 vs. 10 vs. 20)
3. Decide on year range (all years vs. recent 5-7 years)
4. Optimize JSON file sizes (uint8 encoding, compression)
5. Update `difficultyScore` and `difficultyLabel` based on real data
6. Handle edge cases: species not in EBD, cells with no data, week 53

**Estimated effort**: 1-2 days

### Total Estimated Effort: 5-9 days

### Tools and Dependencies

| Tool | Version | Purpose |
|------|---------|---------|
| R | 4.3+ | Pipeline scripting |
| `auk` | latest CRAN | EBD filtering |
| `sf` | latest | Spatial operations (grid assignment) |
| `dplyr` or `data.table` | latest | Data manipulation |
| `jsonlite` | latest | JSON export |
| Cygwin | latest | AWK for Windows (required by auk) |
| Bowdoin HPC | — | For full dataset processing |

### File Deliverables

| File | Description |
|------|-------------|
| `01_filter_ebd.R` | auk filtering script |
| `02_import_and_assign.R` | Import + grid cell assignment |
| `03_compute_frequency.R` | Frequency calculation |
| `04_export_json.R` | JSON export for app |
| `05_update_species_meta.R` | Species metadata enrichment |
| `config.R` | Shared configuration (paths, thresholds, country list, year range) |
| `README.md` | Pipeline documentation |

### Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Metric | Reporting frequency | Simple, interpretable, no modeling needed |
| Spatial subsampling | Skip for v1 | 27 km grid provides coarse aggregation already |
| Year range | All years (or recent 5-7) | More data = more stable frequencies; decide after testing |
| Min checklist threshold | 5 per cell/week | Balance between coverage and reliability |
| Frequency encoding | uint8 (0-255) | Compact, sufficient precision for heatmap |
| Weekly JSON format | `[[cell_id, [[sp_id, freq_uint8], ...]], ...]` | Backward-compatible structure, adds frequency |
| Processing tool | R with auk | Required for EBD filtering; stay in R for full pipeline |
