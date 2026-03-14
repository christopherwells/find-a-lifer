# =============================================================================
# 02_import_and_assign.R — Import Filtered Data, Assign H3 Cells and Weeks
# =============================================================================
# Reads the auk-filtered EBD and SED text files, assigns each checklist to
# an H3 hex cell and a week number, then saves intermediate .rds files for
# fast loading in subsequent steps.
#
# Input:  Filtered EBD + SED text files from step 01
# Output: checklists.rds  — one row per checklist with cell_h3 and week
#         observations.rds — one row per species observation with cell_h3 and week
#
# Usage:  Rscript 02_import_and_assign.R
# =============================================================================

source("config.R")

library(auk)
library(data.table)
library(sf)
library(h3jsr)
library(lubridate)

cat("=== Step 2: Import and Assign H3 Cells ===\n\n")

# ---------------------------------------------------------------------------
# 1. Check for filtered files
# ---------------------------------------------------------------------------
filtered_ebd_file <- file.path(FILTERED_DIR, "ebd_filtered.txt")
filtered_sed_file <- file.path(FILTERED_DIR, "sed_filtered.txt")

if (!file.exists(filtered_ebd_file) || !file.exists(filtered_sed_file)) {
  stop("Filtered files not found. Run 01_filter_ebd.R first.")
}

# ---------------------------------------------------------------------------
# 2. Import the sampling events (checklists)
# ---------------------------------------------------------------------------
cat("Importing sampling events (SED)...\n")
t0 <- proc.time()

sed <- read_sampling(filtered_sed_file)
sed <- as.data.table(sed)

cat(sprintf("  Loaded %s checklists in %.1f seconds\n",
            format(nrow(sed), big.mark = ","),
            (proc.time() - t0)["elapsed"]))

# ---------------------------------------------------------------------------
# 3. Import the observations (EBD)
# ---------------------------------------------------------------------------
cat("Importing observations (EBD)...\n")
t0 <- proc.time()

ebd <- read_ebd(filtered_ebd_file)
ebd <- as.data.table(ebd)

cat(sprintf("  Loaded %s observations in %.1f seconds\n",
            format(nrow(ebd), big.mark = ","),
            (proc.time() - t0)["elapsed"]))

# ---------------------------------------------------------------------------
# 4. Filter to species-level taxa only (if configured)
# ---------------------------------------------------------------------------
if (!is.null(SPECIES_CATEGORY)) {
  n_before <- nrow(ebd)
  ebd <- ebd[category == SPECIES_CATEGORY]
  cat(sprintf("  Species filter ('%s'): %s -> %s observations\n",
              SPECIES_CATEGORY,
              format(n_before, big.mark = ","),
              format(nrow(ebd), big.mark = ",")))
}

# ---------------------------------------------------------------------------
# 5. Filter observers count (auk doesn't filter this directly in all versions)
# ---------------------------------------------------------------------------
if ("number_observers" %in% names(sed)) {
  n_before <- nrow(sed)
  sed <- sed[!is.na(number_observers) & number_observers <= MAX_OBSERVERS]
  cat(sprintf("  Observer filter (<= %d): %s -> %s checklists\n",
              MAX_OBSERVERS,
              format(n_before, big.mark = ","),
              format(nrow(sed), big.mark = ",")))

  # Also filter observations to only include checklists that passed
  ebd <- ebd[checklist_id %in% sed$checklist_id]
  cat(sprintf("  Observations after observer filter: %s\n",
              format(nrow(ebd), big.mark = ",")))
}

# ---------------------------------------------------------------------------
# 6. Assign week numbers (1-52)
# ---------------------------------------------------------------------------
# Week = ceiling(day_of_year / 7), capped at 52.
# Days 358-366 all fall in week 52.
cat("Assigning week numbers...\n")

sed[, observation_date := as.Date(observation_date)]
sed[, day_of_year := yday(observation_date)]
sed[, week := pmin(ceiling(day_of_year / 7), 52L)]

# Verify week distribution
week_counts <- sed[, .N, by = week][order(week)]
cat(sprintf("  Weeks covered: %d-%d (of 52)\n", min(week_counts$week), max(week_counts$week)))
cat(sprintf("  Checklists per week: min=%s, median=%s, max=%s\n",
            format(min(week_counts$N), big.mark = ","),
            format(median(week_counts$N), big.mark = ","),
            format(max(week_counts$N), big.mark = ",")))

# ---------------------------------------------------------------------------
# 7. Assign H3 hex cells
# ---------------------------------------------------------------------------
cat(sprintf("Assigning H3 cells (resolution %d)...\n", H3_RESOLUTION))
t0 <- proc.time()

# Convert checklist coordinates to sf points
# auk imports as 'longitude' and 'latitude' columns
checklist_pts <- st_as_sf(sed, coords = c("longitude", "latitude"), crs = 4326)

# Convert to H3 cell indices
sed$cell_h3 <- point_to_cell(checklist_pts, res = H3_RESOLUTION)

t_h3 <- (proc.time() - t0)["elapsed"]

n_cells <- uniqueN(sed$cell_h3)
cat(sprintf("  Assigned %s checklists to %d H3 cells in %.1f seconds\n",
            format(nrow(sed), big.mark = ","), n_cells, t_h3))

# ---------------------------------------------------------------------------
# 8. Create integer cell_id mapping for compact output
# ---------------------------------------------------------------------------
# The app uses integer cell IDs internally. Create a mapping from H3 index
# strings to sequential integers. Save the mapping for use in export.
cat("Creating cell_id mapping...\n")

unique_cells <- sort(unique(sed$cell_h3))
cell_mapping <- data.table(
  cell_h3 = unique_cells,
  cell_id = seq_along(unique_cells)
)

# Join integer cell_id back to checklists
sed <- merge(sed, cell_mapping, by = "cell_h3", all.x = TRUE)

cat(sprintf("  %d unique H3 cells mapped to integer IDs 1-%d\n",
            nrow(cell_mapping), nrow(cell_mapping)))

# ---------------------------------------------------------------------------
# 9. Propagate cell_h3, cell_id, and week to observations
# ---------------------------------------------------------------------------
cat("Joining cell and week info to observations...\n")

# Keep only the columns we need from SED for the join
sed_join <- sed[, .(checklist_id, cell_h3, cell_id, week)]

ebd <- merge(ebd, sed_join, by = "checklist_id", all.x = FALSE)

cat(sprintf("  Observations with cell+week: %s\n",
            format(nrow(ebd), big.mark = ",")))

# ---------------------------------------------------------------------------
# 10. Save intermediate files
# ---------------------------------------------------------------------------
cat("Saving intermediate .rds files...\n")

# Checklists: one row per checklist
checklists_file <- file.path(INTERMEDIATE_DIR, "checklists.rds")
saveRDS(sed, checklists_file)
cat(sprintf("  Saved checklists: %s (%.1f MB)\n",
            checklists_file,
            file.size(checklists_file) / 1e6))

# Observations: one row per species x checklist
observations_file <- file.path(INTERMEDIATE_DIR, "observations.rds")
saveRDS(ebd, observations_file)
cat(sprintf("  Saved observations: %s (%.1f MB)\n",
            observations_file,
            file.size(observations_file) / 1e6))

# Cell mapping: H3 index <-> integer ID
mapping_file <- file.path(INTERMEDIATE_DIR, "cell_mapping.rds")
saveRDS(cell_mapping, mapping_file)
cat(sprintf("  Saved cell mapping: %s (%d cells)\n",
            mapping_file, nrow(cell_mapping)))

# ---------------------------------------------------------------------------
# 11. Summary
# ---------------------------------------------------------------------------
n_species <- uniqueN(ebd$scientific_name)
cat(sprintf("\n--- Summary ---\n"))
cat(sprintf("  Total checklists:  %s\n", format(nrow(sed), big.mark = ",")))
cat(sprintf("  Total observations: %s\n", format(nrow(ebd), big.mark = ",")))
cat(sprintf("  Unique species:    %d\n", n_species))
cat(sprintf("  H3 cells:          %d (resolution %d)\n", n_cells, H3_RESOLUTION))
cat(sprintf("  Weeks:             %d-%d\n", min(sed$week), max(sed$week)))
cat(sprintf("  Year range:        %d-%d\n", YEAR_MIN, YEAR_MAX))

cat("\n=== Step 2 complete. Next: Rscript 03_compute_frequency.R ===\n")
