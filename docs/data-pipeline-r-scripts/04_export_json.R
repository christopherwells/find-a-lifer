# =============================================================================
# 04_export_json.R — Export to JSON for the Find-A-Lifer App
# =============================================================================
# Converts the computed frequency data into the JSON formats expected by the
# backend server (main.py) and frontend.
#
# Output files (all written to JSON_DIR):
#   weeks/week_01.json ... week_52.json     — per-species frequency per cell
#   weeks/week_01_summary.json ... etc      — species count + max freq per cell
#   species.json                            — species metadata
#   grid_h3.geojson                         — H3 cell polygons as GeoJSON
#   cell_mapping.json                       — H3 index <-> integer ID lookup
#
# Usage:  Rscript 04_export_json.R
# =============================================================================

source("config.R")

library(data.table)
library(jsonlite)
library(sf)
library(h3jsr)

cat("=== Step 4: Export to JSON ===\n\n")

# ---------------------------------------------------------------------------
# 1. Load frequency data and cell mapping
# ---------------------------------------------------------------------------
cat("Loading frequency data...\n")

freq <- readRDS(file.path(INTERMEDIATE_DIR, "frequency.rds"))
cell_mapping <- readRDS(file.path(INTERMEDIATE_DIR, "cell_mapping.rds"))
effort <- readRDS(file.path(INTERMEDIATE_DIR, "effort.rds"))

cat(sprintf("  %s frequency records\n", format(nrow(freq), big.mark = ",")))
cat(sprintf("  %d H3 cells\n", nrow(cell_mapping)))

# ---------------------------------------------------------------------------
# 2. Build species ID mapping
# ---------------------------------------------------------------------------
# Assign sequential integer IDs to each species, sorted by taxonomic order
# if available, otherwise alphabetically by species code.
cat("Building species ID mapping...\n")

# Get unique species with metadata
species_cols <- intersect(
  c("species_code", "common_name", "scientific_name", "taxonomic_order"),
  names(freq)
)
species_meta <- unique(freq[, ..species_cols])

# Sort by taxonomic order if available, else by species code
if ("taxonomic_order" %in% names(species_meta)) {
  species_meta <- species_meta[order(taxonomic_order, na.last = TRUE)]
} else {
  species_meta <- species_meta[order(species_code)]
}

species_meta[, species_id := .I]

cat(sprintf("  %d unique species\n", nrow(species_meta)))

# Join species_id into frequency table
freq <- merge(freq, species_meta[, .(species_code, species_id)],
              by = "species_code", all.x = TRUE)

# ---------------------------------------------------------------------------
# 3. Compute species-level derived metrics
# ---------------------------------------------------------------------------
cat("Computing species-level metrics...\n")

species_stats <- freq[, .(
  # Difficulty: inverse of max frequency across all cells/weeks
  # Higher frequency = easier to find = lower difficulty
  max_freq = max(frequency),
  mean_freq = mean(frequency),
  n_cells = uniqueN(cell_id),
  n_weeks = uniqueN(week),

  # Peak week: the week with highest mean frequency across cells
  peak_week = {
    weekly_means <- .SD[, .(wk_mean = mean(frequency)), by = week]
    weekly_means[which.max(wk_mean), week]
  },

  # Seasonality score: coefficient of variation of weekly mean frequencies
  # Higher = more seasonal, lower = year-round
  seasonality_score = {
    weekly_means <- .SD[, .(wk_mean = mean(frequency)), by = week]
    if (nrow(weekly_means) > 1 && mean(weekly_means$wk_mean) > 0) {
      sd(weekly_means$wk_mean) / mean(weekly_means$wk_mean)
    } else {
      0
    }
  }
), by = species_code]

# Difficulty score: 1 - max_freq, scaled to [0, 1]
species_stats[, difficultyScore := round(1 - max_freq, 4)]

# Restricted range: found in few cells relative to the total
total_cells <- nrow(cell_mapping)
species_stats[, isRestrictedRange := n_cells <= max(1, total_cells * 0.1)]

# Normalize seasonality to [0, 1]
if (max(species_stats$seasonality_score) > 0) {
  species_stats[, seasonalityScore := round(
    pmin(seasonality_score / max(seasonality_score, na.rm = TRUE), 1), 4
  )]
} else {
  species_stats[, seasonalityScore := 0]
}

# Difficulty labels
species_stats[, difficultyLabel := fcase(
  difficultyScore <= 0.2, "Very Easy",
  difficultyScore <= 0.4, "Easy",
  difficultyScore <= 0.6, "Moderate",
  difficultyScore <= 0.8, "Hard",
  default = "Very Hard"
)]

# Merge stats into species metadata
species_meta <- merge(species_meta, species_stats,
                      by = "species_code", all.x = TRUE)

# ---------------------------------------------------------------------------
# 4. Export species.json
# ---------------------------------------------------------------------------
cat("Exporting species.json...\n")

species_json <- lapply(seq_len(nrow(species_meta)), function(i) {
  row <- species_meta[i]
  list(
    species_id = row$species_id,
    speciesCode = row$species_code,
    comName = if ("common_name" %in% names(row)) row$common_name else row$species_code,
    sciName = if ("scientific_name" %in% names(row)) row$scientific_name else "",
    familyComName = "",
    taxonOrder = if ("taxonomic_order" %in% names(row)) row$taxonomic_order else row$species_id,
    difficultyScore = round(row$difficultyScore, 4),
    difficultyLabel = row$difficultyLabel,
    isRestrictedRange = row$isRestrictedRange,
    peakWeek = row$peak_week,
    seasonalityScore = round(row$seasonalityScore, 4),
    ebirdUrl = paste0("https://ebird.org/species/", row$species_code),
    photoUrl = ""
  )
})

species_json_file <- file.path(JSON_DIR, "species.json")
write_json(species_json, species_json_file, auto_unbox = TRUE, pretty = FALSE)
cat(sprintf("  Saved: %s (%.1f KB, %d species)\n",
            species_json_file,
            file.size(species_json_file) / 1e3,
            length(species_json)))

# ---------------------------------------------------------------------------
# 5. Export weekly data files
# ---------------------------------------------------------------------------
# Format: [[cell_id, [[species_id, freq_uint8], ...]], ...]
# freq_uint8 = round(frequency * 255), clamped to [0, 255]
cat("Exporting weekly data files...\n")

weeks_dir <- file.path(JSON_DIR, "weeks")
if (!dir.exists(weeks_dir)) dir.create(weeks_dir, recursive = TRUE)

# Convert frequency to uint8
freq[, freq_uint8 := as.integer(pmin(round(frequency * 255), 255L))]

# Only include records where freq_uint8 > 0 (species actually detected)
freq_nonzero <- freq[freq_uint8 > 0]

for (w in 1:N_WEEKS) {
  week_data <- freq_nonzero[week == w]

  if (nrow(week_data) == 0) {
    # Write empty array for weeks with no data
    week_file <- file.path(weeks_dir, sprintf("week_%02d.json", w))
    write_json(list(), week_file)
    summary_file <- file.path(weeks_dir, sprintf("week_%02d_summary.json", w))
    write_json(list(), summary_file)
    next
  }

  # --- Full data: [[cell_id, [[species_id, freq_uint8], ...]], ...] ---
  cells_list <- week_data[, {
    species_entries <- mapply(function(sid, fq) list(sid, fq),
                              species_id, freq_uint8,
                              SIMPLIFY = FALSE, USE.NAMES = FALSE)
    list(data = list(list(.BY$cell_id, species_entries)))
  }, by = cell_id]

  # Unpack into a flat list of [cell_id, [[species_id, freq], ...]]
  week_output <- lapply(cells_list$data, function(x) x)

  week_file <- file.path(weeks_dir, sprintf("week_%02d.json", w))
  write_json(week_output, week_file, auto_unbox = TRUE, pretty = FALSE)

  # --- Summary: [[cell_id, n_species, max_freq_uint8], ...] ---
  summary_data <- week_data[, .(
    n_species = .N,
    max_freq_uint8 = max(freq_uint8)
  ), by = cell_id]

  summary_output <- lapply(seq_len(nrow(summary_data)), function(i) {
    list(
      summary_data$cell_id[i],
      summary_data$n_species[i],
      summary_data$max_freq_uint8[i]
    )
  })

  summary_file <- file.path(weeks_dir, sprintf("week_%02d_summary.json", w))
  write_json(summary_output, summary_file, auto_unbox = TRUE, pretty = FALSE)

  n_sp <- uniqueN(week_data$species_id)
  n_cl <- uniqueN(week_data$cell_id)
  cat(sprintf("  Week %02d: %d species in %d cells (%.1f KB data, %.1f KB summary)\n",
              w, n_sp, n_cl,
              file.size(week_file) / 1e3,
              file.size(summary_file) / 1e3))
}

# ---------------------------------------------------------------------------
# 6. Export H3 grid GeoJSON
# ---------------------------------------------------------------------------
cat("\nExporting H3 grid GeoJSON...\n")

# Get all H3 cells that appear in the data
all_h3_cells <- cell_mapping$cell_h3

# Convert H3 indices to polygons
h3_polys <- cell_to_polygon(all_h3_cells, simple = FALSE)

# Add cell_id as a property (the integer ID used throughout the app)
h3_polys$cell_id <- cell_mapping$cell_id[match(h3_polys$h3_address, cell_mapping$cell_h3)]

# Add the H3 index as a property too (useful for debugging)
h3_polys$h3_index <- h3_polys$h3_address

# Write GeoJSON
grid_file <- file.path(JSON_DIR, "grid_h3.geojson")
st_write(h3_polys[, c("cell_id", "h3_index")], grid_file,
         driver = "GeoJSON", delete_dsn = TRUE, quiet = TRUE)

cat(sprintf("  Saved: %s (%.1f KB, %d cells)\n",
            grid_file,
            file.size(grid_file) / 1e3,
            nrow(h3_polys)))

# ---------------------------------------------------------------------------
# 7. Export cell mapping (for reference/debugging)
# ---------------------------------------------------------------------------
mapping_file <- file.path(JSON_DIR, "cell_mapping.json")
mapping_list <- lapply(seq_len(nrow(cell_mapping)), function(i) {
  list(
    cell_id = cell_mapping$cell_id[i],
    h3_index = cell_mapping$cell_h3[i]
  )
})
write_json(mapping_list, mapping_file, auto_unbox = TRUE, pretty = FALSE)
cat(sprintf("  Saved cell mapping: %s\n", mapping_file))

# ---------------------------------------------------------------------------
# 8. Summary
# ---------------------------------------------------------------------------
total_json_kb <- sum(file.size(list.files(JSON_DIR, full.names = TRUE, recursive = TRUE))) / 1e3

cat(sprintf("\n--- Export Summary ---\n"))
cat(sprintf("  Output directory:    %s\n", JSON_DIR))
cat(sprintf("  Total JSON size:     %.1f KB (%.1f MB)\n", total_json_kb, total_json_kb / 1e3))
cat(sprintf("  Weekly data files:   %d\n", N_WEEKS))
cat(sprintf("  Weekly summary files: %d\n", N_WEEKS))
cat(sprintf("  Species:             %d\n", nrow(species_meta)))
cat(sprintf("  Grid cells:          %d\n", nrow(cell_mapping)))

cat("\n  To use this data with the app:\n")
cat(sprintf("  1. Copy %s/* to backend/data/\n", JSON_DIR))
cat("  2. Rename grid_h3.geojson to grid_27km.geojson (or update main.py)\n")
cat("  3. Restart the backend server\n")

cat("\n=== Step 4 complete. Next: Rscript 05_validate.R ===\n")
