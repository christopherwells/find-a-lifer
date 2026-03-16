# =============================================================================
# 03_compute_frequency.R — Compute Reporting Frequency
# =============================================================================
# Computes reporting frequency (proportion of checklists detecting a species)
# for each species x H3 cell x week combination.
#
#   frequency = n_checklists_detecting / n_total_checklists
#
# Cells with fewer than MIN_CHECKLISTS for a given week are excluded.
#
# Input:  checklists.rds, observations.rds from step 02
# Output: frequency.rds — data.table with columns:
#           cell_id, week, species_code, scientific_name, common_name,
#           n_detected, n_total, frequency
#
# Usage:  Rscript 03_compute_frequency.R
# =============================================================================

source("config.R")

library(data.table)

cat("=== Step 3: Compute Reporting Frequency ===\n\n")

# ---------------------------------------------------------------------------
# 1. Load intermediate data
# ---------------------------------------------------------------------------
cat("Loading intermediate data...\n")
t0 <- proc.time()

checklists <- readRDS(file.path(INTERMEDIATE_DIR, "checklists.rds"))
observations <- readRDS(file.path(INTERMEDIATE_DIR, "observations.rds"))

cat(sprintf("  Checklists:    %s rows\n", format(nrow(checklists), big.mark = ",")))
cat(sprintf("  Observations:  %s rows\n", format(nrow(observations), big.mark = ",")))
cat(sprintf("  Loaded in %.1f seconds\n", (proc.time() - t0)["elapsed"]))

# ---------------------------------------------------------------------------
# 2. Count total checklists per cell x week
# ---------------------------------------------------------------------------
cat("\nCounting total checklists per cell x week...\n")

effort <- checklists[, .(n_total = .N), by = .(cell_id, week)]
cat(sprintf("  %s cell-week combinations\n", format(nrow(effort), big.mark = ",")))

# Apply minimum checklist threshold
effort_filtered <- effort[n_total >= MIN_CHECKLISTS]
cat(sprintf("  After threshold (>= %d checklists): %s cell-week combos (%d excluded)\n",
            MIN_CHECKLISTS,
            format(nrow(effort_filtered), big.mark = ","),
            nrow(effort) - nrow(effort_filtered)))

# ---------------------------------------------------------------------------
# 3. Count detecting checklists per species x cell x week
# ---------------------------------------------------------------------------
# A checklist "detects" a species if that species appears in the observation
# records for that checklist. Since we filtered to complete checklists,
# absence = not detected.
cat("Counting detections per species x cell x week...\n")
t0 <- proc.time()

# Get one row per unique checklist-species combination (deduplicate if needed)
# Then count how many checklists detected each species in each cell-week
detections <- observations[, .(checklist_id = unique(checklist_id)),
                           by = .(cell_id, week, species_code = common_name)]

# Wait — we need species_code, not common_name. Let's use the actual columns.
# auk imports as: scientific_name, common_name, species_code (the 6-letter code)
# Let's check what columns are available:
obs_cols <- names(observations)
cat(sprintf("  Observation columns: %s\n", paste(obs_cols[1:min(15, length(obs_cols))], collapse = ", ")))

# Use the correct species identifier column
# auk uses 'species_code' for the eBird species code (e.g., "bkcchi")
species_col <- if ("species_code" %in% obs_cols) "species_code" else "scientific_name"
cat(sprintf("  Using species identifier column: %s\n", species_col))

# Count unique detecting checklists per species x cell x week
detections <- observations[, .(n_detected = uniqueN(checklist_id)),
                           by = c("cell_id", "week", species_col)]

# Rename for consistency
if (species_col != "species_code") {
  setnames(detections, species_col, "species_code")
}

cat(sprintf("  %s species-cell-week detection counts in %.1f seconds\n",
            format(nrow(detections), big.mark = ","),
            (proc.time() - t0)["elapsed"]))

# ---------------------------------------------------------------------------
# 4. Join effort and compute frequency
# ---------------------------------------------------------------------------
cat("Computing reporting frequency...\n")

# Inner join: only keep cell-weeks that meet the minimum checklist threshold
freq <- merge(detections, effort_filtered, by = c("cell_id", "week"), all = FALSE)

# Compute frequency
freq[, frequency := n_detected / n_total]

cat(sprintf("  %s frequency records\n", format(nrow(freq), big.mark = ",")))

# ---------------------------------------------------------------------------
# 5. Add species metadata
# ---------------------------------------------------------------------------
# Build a species lookup from the observations (common name, scientific name)
cat("Adding species metadata...\n")

species_lookup_cols <- intersect(
  c("species_code", "common_name", "scientific_name", "taxonomic_order", "category"),
  obs_cols
)
species_lookup <- unique(observations[, ..species_lookup_cols])

# If species_code wasn't the column name used, adapt
if (species_col == "scientific_name") {
  setnames(species_lookup, "scientific_name", "species_code")
}

# Deduplicate (in case of minor variations)
species_lookup <- unique(species_lookup, by = "species_code")

freq <- merge(freq, species_lookup, by = "species_code", all.x = TRUE)

# ---------------------------------------------------------------------------
# 6. Frequency statistics
# ---------------------------------------------------------------------------
cat("\n--- Frequency Statistics ---\n")
cat(sprintf("  Unique species:    %d\n", uniqueN(freq$species_code)))
cat(sprintf("  Unique cells:      %d\n", uniqueN(freq$cell_id)))
cat(sprintf("  Frequency range:   %.4f - %.4f\n", min(freq$frequency), max(freq$frequency)))
cat(sprintf("  Median frequency:  %.4f\n", median(freq$frequency)))
cat(sprintf("  Mean frequency:    %.4f\n", mean(freq$frequency)))

# Distribution of frequencies
breaks <- c(0, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0)
freq_hist <- cut(freq$frequency, breaks = breaks, include.lowest = TRUE)
cat("\n  Frequency distribution:\n")
print(table(freq_hist))

# Top species by mean frequency (most commonly detected)
top_species <- freq[, .(mean_freq = mean(frequency),
                        n_cells = uniqueN(cell_id),
                        n_weeks = uniqueN(week)),
                    by = species_code][order(-mean_freq)][1:20]
cat("\n  Top 20 species by mean reporting frequency:\n")
print(top_species)

# ---------------------------------------------------------------------------
# 7. Demonstrate the composite "any lifer" probability
# ---------------------------------------------------------------------------
# This computation happens in the FRONTEND with the user's personal life list,
# but here's how it works conceptually:
#
#   P(any_lifer | cell, week) = 1 - prod(1 - freq_i)
#
# For example, if a cell in week 25 has these unseen species:
#   Species A: freq = 0.30
#   Species B: freq = 0.15
#   Species C: freq = 0.05
#
# Then: P(any lifer) = 1 - (1-0.30) * (1-0.15) * (1-0.05)
#                     = 1 - 0.70 * 0.85 * 0.95
#                     = 1 - 0.56525
#                     = 0.43475
#
# So there's a ~43.5% chance of seeing at least one new life bird.
#
# The pipeline provides the per-species freq_i values; the frontend applies
# the user's life list filter and computes this product.

cat("\n  --- Composite Probability Demo ---\n")
cat("  Example: cell with 3 unseen species (freq 0.30, 0.15, 0.05)\n")
demo_freqs <- c(0.30, 0.15, 0.05)
p_any_lifer <- 1 - prod(1 - demo_freqs)
cat(sprintf("  P(any lifer) = 1 - prod(1 - freq_i) = %.4f (%.1f%%)\n",
            p_any_lifer, p_any_lifer * 100))
cat("  The frontend computes this for each cell using the user's life list.\n")

# ---------------------------------------------------------------------------
# 8. Save frequency data
# ---------------------------------------------------------------------------
cat("\nSaving frequency data...\n")

freq_file <- file.path(INTERMEDIATE_DIR, "frequency.rds")
saveRDS(freq, freq_file)
cat(sprintf("  Saved: %s (%.1f MB)\n", freq_file, file.size(freq_file) / 1e6))

# Also save the effort table (useful for validation)
effort_file <- file.path(INTERMEDIATE_DIR, "effort.rds")
saveRDS(effort_filtered, effort_file)
cat(sprintf("  Saved: %s\n", effort_file))

cat("\n=== Step 3 complete. Next: Rscript 04_export_json.R ===\n")
