# =============================================================================
# 01_filter_ebd.R — Filter Raw EBD with auk
# =============================================================================
# Applies effort filters, geographic scope, date range, and protocol filters
# to the raw EBD and SED files. This is the slowest step (can take 30+ min
# for full NA data) because auk reads the entire text file line by line.
#
# Input:  Raw EBD + SED text files (paths from config.R)
# Output: Filtered EBD + SED text files in FILTERED_DIR
#
# Usage:  Rscript 01_filter_ebd.R
# =============================================================================

source("config.R")
library(auk)

cat("=== Step 1: Filter EBD with auk ===\n\n")

# ---------------------------------------------------------------------------
# 1. Validate input files exist
# ---------------------------------------------------------------------------
if (!file.exists(EBD_FILE)) {
  stop("EBD file not found: ", EBD_FILE,
       "\nEdit config.R and set EBD_FILE to your downloaded EBD path.")
}
if (!file.exists(SED_FILE)) {
  stop("SED file not found: ", SED_FILE,
       "\nEdit config.R and set SED_FILE to your downloaded SED path.")
}

ebd_size_gb <- file.size(EBD_FILE) / 1e9
sed_size_gb <- file.size(SED_FILE) / 1e9
cat(sprintf("EBD file: %s (%.1f GB)\n", basename(EBD_FILE), ebd_size_gb))
cat(sprintf("SED file: %s (%.1f GB)\n", basename(SED_FILE), sed_size_gb))

# ---------------------------------------------------------------------------
# 2. Define output file paths
# ---------------------------------------------------------------------------
filtered_ebd_file <- file.path(FILTERED_DIR, "ebd_filtered.txt")
filtered_sed_file <- file.path(FILTERED_DIR, "sed_filtered.txt")

# Check if already filtered (skip if so)
if (file.exists(filtered_ebd_file) && file.exists(filtered_sed_file)) {
  cat("\nFiltered files already exist:\n")
  cat("  ", filtered_ebd_file, "\n")
  cat("  ", filtered_sed_file, "\n")
  cat("Delete them to re-run filtering, or proceed to 02_import_and_assign.R\n")
  cat("Skipping filtering step.\n")
  quit(save = "no", status = 0)
}

# ---------------------------------------------------------------------------
# 3. Set up auk filter pipeline
# ---------------------------------------------------------------------------
cat("\nSetting up auk filter...\n")

# Start with the EBD and SED pair
filters <- auk_ebd(EBD_FILE, file_sampling = SED_FILE)

# Date range filter
filters <- auk_date(filters, date = c(
  paste0(YEAR_MIN, "-01-01"),
  paste0(YEAR_MAX, "-12-31")
))
cat(sprintf("  Date range: %d-01-01 to %d-12-31\n", YEAR_MIN, YEAR_MAX))

# Geographic filter: state or country level
if (!is.null(STATE_CODES)) {
  filters <- auk_state(filters, state = STATE_CODES)
  cat(sprintf("  State filter: %s\n", paste(STATE_CODES, collapse = ", ")))
} else if (!is.null(COUNTRY_CODES)) {
  filters <- auk_country(filters, country = COUNTRY_CODES)
  cat(sprintf("  Country filter: %s\n", paste(COUNTRY_CODES, collapse = ", ")))
}

# Protocol filter (stationary + traveling only)
filters <- auk_protocol(filters, protocol = PROTOCOLS)
cat(sprintf("  Protocols: %s\n", paste(PROTOCOLS, collapse = ", ")))

# Duration filter
filters <- auk_duration(filters, duration = c(0, MAX_DURATION_MINUTES))
cat(sprintf("  Max duration: %d minutes\n", MAX_DURATION_MINUTES))

# Distance filter (only applies to traveling counts; stationary = 0 km)
filters <- auk_distance(filters, distance = c(0, MAX_DISTANCE_KM))
cat(sprintf("  Max distance: %d km\n", MAX_DISTANCE_KM))

# Complete checklists only (required for reporting frequency)
filters <- auk_complete(filters)
cat("  Complete checklists only: yes\n")

# ---------------------------------------------------------------------------
# 4. Run the filter
# ---------------------------------------------------------------------------
cat("\nRunning auk filter (this may take a while)...\n")
cat(sprintf("  Started at: %s\n", Sys.time()))

t_start <- proc.time()

filtered <- auk_filter(
  filters,
  file = filtered_ebd_file,
  file_sampling = filtered_sed_file,
  overwrite = TRUE
)

t_elapsed <- (proc.time() - t_start)["elapsed"]
cat(sprintf("  Finished at: %s\n", Sys.time()))
cat(sprintf("  Elapsed time: %.1f minutes\n", t_elapsed / 60))

# ---------------------------------------------------------------------------
# 5. Report output sizes
# ---------------------------------------------------------------------------
ebd_out_mb <- file.size(filtered_ebd_file) / 1e6
sed_out_mb <- file.size(filtered_sed_file) / 1e6

cat(sprintf("\nFiltered EBD: %s (%.1f MB)\n", filtered_ebd_file, ebd_out_mb))
cat(sprintf("Filtered SED: %s (%.1f MB)\n", filtered_sed_file, sed_out_mb))

# Quick line count to estimate number of checklists
n_lines_ebd <- as.integer(system2("wc", args = c("-l", shQuote(filtered_ebd_file)),
                                   stdout = TRUE, stderr = FALSE))
n_lines_sed <- as.integer(system2("wc", args = c("-l", shQuote(filtered_sed_file)),
                                   stdout = TRUE, stderr = FALSE))
# wc -l output may include filename, extract just the number
if (!is.na(n_lines_ebd)) {
  cat(sprintf("  ~%s observation lines\n", format(n_lines_ebd, big.mark = ",")))
}
if (!is.na(n_lines_sed)) {
  cat(sprintf("  ~%s checklist lines\n", format(n_lines_sed, big.mark = ",")))
}

cat("\n=== Step 1 complete. Next: Rscript 02_import_and_assign.R ===\n")
