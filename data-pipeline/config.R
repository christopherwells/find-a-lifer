# =============================================================================
# config.R — Shared Configuration for Find-A-Lifer Data Pipeline
# =============================================================================
# Edit the paths and parameters below before running the pipeline.
# All other scripts source this file via: source("config.R")
# =============================================================================

# ---------------------------------------------------------------------------
# 1. Input file paths — FILL THESE IN
# ---------------------------------------------------------------------------
# Path to the eBird Basic Dataset (EBD) observations file (.txt)
# Download from: https://ebird.org/data/download
EBD_FILE <- file.path(dirname(getwd()), "data", "ebd_US-ME_smp_relJan-2026.txt")

# Path to the Sampling Event Data (SED) file (.txt)
# Must be downloaded alongside the EBD for the same region/date range
SED_FILE <- file.path(dirname(getwd()), "data", "ebd_US-ME_smp_relJan-2026_sampling.txt")

# ---------------------------------------------------------------------------
# 2. Output directory
# ---------------------------------------------------------------------------
# Where all intermediate and final output files will be written.
# Defaults to an "output" subdirectory alongside these scripts.
OUTPUT_DIR <- file.path(getwd(), "output")

# Subdirectories (created automatically)
FILTERED_DIR  <- file.path(OUTPUT_DIR, "filtered")   # auk-filtered text files
INTERMEDIATE_DIR <- file.path(OUTPUT_DIR, "intermediate") # .rds checkpoints
JSON_DIR      <- file.path(OUTPUT_DIR, "json")        # final JSON for the app

# ---------------------------------------------------------------------------
# 3. Geographic scope
# ---------------------------------------------------------------------------
# For the Maine proof-of-concept, filter to US-ME.
# To run the full North America pipeline later, set:
#   COUNTRY_CODES <- c("US", "CA", "MX")
#   STATE_CODES   <- NULL
COUNTRY_CODES <- c("US")
STATE_CODES   <- c("US-ME")  # Set to NULL for full-country runs

# ---------------------------------------------------------------------------
# 4. H3 hexagonal grid settings
# ---------------------------------------------------------------------------
# Resolution 4 (~1,770 km2, ~22 km edge) is closest to the current 27 km grid.
# Resolution 3 (~12,392 km2, ~60 km edge) gives fewer, larger cells.
# Change this to experiment with different resolutions.
H3_RESOLUTION <- 4

# ---------------------------------------------------------------------------
# 5. Temporal settings
# ---------------------------------------------------------------------------
# Pool observations from this range of years.
YEAR_MIN <- 2006
YEAR_MAX <- 2025

# Number of weeks per year (eBird standard)
N_WEEKS <- 52

# ---------------------------------------------------------------------------
# 6. Effort filters
# ---------------------------------------------------------------------------
# These match eBird best practices for computing reporting frequency.
# Only checklists meeting ALL of these criteria are included.
MAX_DURATION_MINUTES <- 360   # 6 hours
MAX_DISTANCE_KM      <- 10   # 10 km
MAX_OBSERVERS         <- 10   # 10 observers

# Accepted protocols (stationary and traveling only)
PROTOCOLS <- c("Stationary", "Traveling")

# ---------------------------------------------------------------------------
# 7. Minimum checklist threshold
# ---------------------------------------------------------------------------
# A cell x week combination must have at least this many checklists
# to produce a reliable frequency estimate. Cells below this threshold
# are excluded from the output for that week.
MIN_CHECKLISTS <- 5

# ---------------------------------------------------------------------------
# 8. Species filters
# ---------------------------------------------------------------------------
# eBird category filter — keep only full species (no subspecies/hybrids/slashes)
# Set to NULL to include all categories.
SPECIES_CATEGORY <- "species"

# ---------------------------------------------------------------------------
# 9. Frontend compatibility notes
# ---------------------------------------------------------------------------
# The app's composite "any lifer" probability for a cell in a given week is:
#
#   P(any_lifer | cell, week) = 1 - prod(1 - freq_i)
#
# where freq_i is the reporting frequency of unseen species i in that cell/week.
# This computation happens in the frontend using the user's personal life list.
# The pipeline provides the per-species freq_i values that make it possible.
#
# Output formats must match what the backend (main.py) expects:
#   - Weekly data:    [[cell_id, [[species_id, freq_uint8], ...]], ...]
#   - Weekly summary: [[cell_id, n_species, max_freq_uint8], ...]
#   - Species meta:   [{species_id, speciesCode, comName, ...}, ...]
#   - Grid geometry:  GeoJSON FeatureCollection with cell_id property

# ---------------------------------------------------------------------------
# 10. Create output directories
# ---------------------------------------------------------------------------
for (d in c(OUTPUT_DIR, FILTERED_DIR, INTERMEDIATE_DIR, JSON_DIR)) {
  if (!dir.exists(d)) {
    dir.create(d, recursive = TRUE)
    message("Created directory: ", d)
  }
}

message("Config loaded. H3 resolution: ", H3_RESOLUTION,
        ", years: ", YEAR_MIN, "-", YEAR_MAX,
        ", scope: ", paste(STATE_CODES %||% COUNTRY_CODES, collapse = ", "))
