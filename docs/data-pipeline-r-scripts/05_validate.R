# =============================================================================
# 05_validate.R — Validation and Diagnostics
# =============================================================================
# Checks the pipeline output against known patterns for well-known Maine
# species. Flags anomalies and prints summary statistics.
#
# Input:  frequency.rds, cell_mapping.rds, effort.rds from step 03
# Output: Console report + optional HTML report
#
# Usage:  Rscript 05_validate.R
# =============================================================================

source("config.R")

library(data.table)

cat("=== Step 5: Validation and Diagnostics ===\n\n")

# ---------------------------------------------------------------------------
# 1. Load data
# ---------------------------------------------------------------------------
freq <- readRDS(file.path(INTERMEDIATE_DIR, "frequency.rds"))
cell_mapping <- readRDS(file.path(INTERMEDIATE_DIR, "cell_mapping.rds"))
effort <- readRDS(file.path(INTERMEDIATE_DIR, "effort.rds"))

cat(sprintf("Loaded %s frequency records\n", format(nrow(freq), big.mark = ",")))
cat(sprintf("  %d species, %d cells, %d weeks\n",
            uniqueN(freq$species_code), uniqueN(freq$cell_id), uniqueN(freq$week)))

# ---------------------------------------------------------------------------
# 2. Validation: Maine indicator species
# ---------------------------------------------------------------------------
# These species have well-known seasonal patterns in Maine that we can use
# to sanity-check the frequency values.

cat("\n--- Indicator Species Validation ---\n\n")

# Helper: get frequency summary for a species
validate_species <- function(code_pattern, expected_pattern, freq_dt) {
  # Try exact match first, then partial match on common name
  sp_data <- freq_dt[grepl(code_pattern, species_code, ignore.case = TRUE) |
                     grepl(code_pattern, common_name, ignore.case = TRUE)]

  if (nrow(sp_data) == 0) {
    cat(sprintf("  [??] '%s' — NOT FOUND in data\n", code_pattern))
    return(invisible(NULL))
  }

  species_name <- sp_data$common_name[1]
  species_cd <- sp_data$species_code[1]

  # Use only this species
  sp_data <- sp_data[species_code == species_cd]

  # Weekly summary
  weekly <- sp_data[, .(
    mean_freq = mean(frequency),
    max_freq = max(frequency),
    n_cells = uniqueN(cell_id)
  ), by = week][order(week)]

  # Seasonal breakdown (rough: winter=Dec-Feb, spring=Mar-May, summer=Jun-Aug, fall=Sep-Nov)
  # Week mapping: weeks 1-8 = winter, 9-22 = spring, 23-35 = summer, 36-48 = fall, 49-52 = winter
  winter_weeks <- c(1:8, 49:52)
  spring_weeks <- 9:22
  summer_weeks <- 23:35
  fall_weeks <- 36:48

  seasonal <- data.table(
    season = c("Winter", "Spring", "Summer", "Fall"),
    mean_freq = c(
      sp_data[week %in% winter_weeks, mean(frequency, na.rm = TRUE)],
      sp_data[week %in% spring_weeks, mean(frequency, na.rm = TRUE)],
      sp_data[week %in% summer_weeks, mean(frequency, na.rm = TRUE)],
      sp_data[week %in% fall_weeks, mean(frequency, na.rm = TRUE)]
    )
  )
  # Replace NaN with 0
  seasonal[is.nan(mean_freq), mean_freq := 0]

  cat(sprintf("  %s (%s)\n", species_name, species_cd))
  cat(sprintf("    Expected: %s\n", expected_pattern))
  cat(sprintf("    Overall:  mean_freq=%.3f, max_freq=%.3f, in %d cells, %d weeks\n",
              mean(sp_data$frequency), max(sp_data$frequency),
              uniqueN(sp_data$cell_id), uniqueN(sp_data$week)))
  cat(sprintf("    Seasonal: Winter=%.3f, Spring=%.3f, Summer=%.3f, Fall=%.3f\n",
              seasonal$mean_freq[1], seasonal$mean_freq[2],
              seasonal$mean_freq[3], seasonal$mean_freq[4]))

  # Simple pattern checks
  peak_season <- seasonal$season[which.max(seasonal$mean_freq)]
  cat(sprintf("    Peak season: %s\n", peak_season))

  return(invisible(list(name = species_name, weekly = weekly, seasonal = seasonal)))
}

# Black-capped Chickadee: should be high frequency year-round
v1 <- validate_species("bkcchi", "High frequency year-round (resident)", freq)

cat("\n")

# Common Loon: high in summer, low/absent in winter (inland)
v2 <- validate_species("comloo", "High in summer, low/absent in winter", freq)

cat("\n")

# Snowy Owl: occasional in winter only (irruptive)
v3 <- validate_species("snoowl", "Occasional in winter only", freq)

cat("\n")

# Atlantic Puffin: summer only, restricted to coastal cells
v4 <- validate_species("atlpuf", "Summer only, coastal cells only", freq)

cat("\n")

# American Robin: common spring-fall, less common in winter
v5 <- validate_species("amerob", "Common spring-fall, reduced in winter", freq)

cat("\n")

# Ruby-throated Hummingbird: summer only (neotropical migrant)
v6 <- validate_species("rthhum", "Summer only (May-Sept migrant)", freq)

# ---------------------------------------------------------------------------
# 3. Coverage statistics
# ---------------------------------------------------------------------------
cat("\n--- Coverage Statistics ---\n\n")

# Checklists per week
week_effort <- effort[, .(total_checklists = sum(n_total),
                          n_cells = .N),
                      by = week][order(week)]
cat("Checklists per week:\n")
cat(sprintf("  Min:    week %02d — %s checklists in %d cells\n",
            week_effort[which.min(total_checklists), week],
            format(min(week_effort$total_checklists), big.mark = ","),
            week_effort[which.min(total_checklists), n_cells]))
cat(sprintf("  Max:    week %02d — %s checklists in %d cells\n",
            week_effort[which.max(total_checklists), week],
            format(max(week_effort$total_checklists), big.mark = ","),
            week_effort[which.max(total_checklists), n_cells]))
cat(sprintf("  Median: %s checklists/week\n",
            format(median(week_effort$total_checklists), big.mark = ",")))

# Cells per week (how many cells meet the threshold)
cat(sprintf("\nCells meeting threshold (>= %d checklists) per week:\n", MIN_CHECKLISTS))
cat(sprintf("  Min:    %d cells (week %02d)\n",
            min(week_effort$n_cells), week_effort[which.min(n_cells), week]))
cat(sprintf("  Max:    %d cells (week %02d)\n",
            max(week_effort$n_cells), week_effort[which.max(n_cells), week]))
cat(sprintf("  Total unique cells: %d\n", nrow(cell_mapping)))

# Species per week
species_per_week <- freq[, .(n_species = uniqueN(species_code)), by = week][order(week)]
cat(sprintf("\nSpecies per week:\n"))
cat(sprintf("  Min:    %d species (week %02d)\n",
            min(species_per_week$n_species),
            species_per_week[which.min(n_species), week]))
cat(sprintf("  Max:    %d species (week %02d)\n",
            max(species_per_week$n_species),
            species_per_week[which.max(n_species), week]))

# ---------------------------------------------------------------------------
# 4. Anomaly detection
# ---------------------------------------------------------------------------
cat("\n--- Anomaly Detection ---\n\n")

# Flag very high frequencies (> 0.95) — may indicate data issues or real pattern
high_freq <- freq[frequency > 0.95]
if (nrow(high_freq) > 0) {
  cat(sprintf("Records with frequency > 0.95: %d\n", nrow(high_freq)))
  high_species <- high_freq[, .N, by = .(species_code, common_name)][order(-N)][1:min(10, .N)]
  cat("  Top species with very high frequency:\n")
  for (i in seq_len(nrow(high_species))) {
    cat(sprintf("    %s (%s): %d records\n",
                high_species$common_name[i],
                high_species$species_code[i],
                high_species$N[i]))
  }
} else {
  cat("No records with frequency > 0.95 (looks clean)\n")
}

# Flag cells with very few qualifying weeks
cells_by_weeks <- freq[, .(n_weeks = uniqueN(week)), by = cell_id]
sparse_cells <- cells_by_weeks[n_weeks < 10]
if (nrow(sparse_cells) > 0) {
  cat(sprintf("\nCells with data in fewer than 10 weeks: %d (of %d total)\n",
              nrow(sparse_cells), nrow(cell_mapping)))
  cat("  These cells may have too little data for reliable patterns.\n")
} else {
  cat("\nAll cells have data for 10+ weeks (good coverage)\n")
}

# Flag species with very few detections overall
rare_species <- freq[, .(total_detections = sum(n_detected),
                         n_cells = uniqueN(cell_id)),
                     by = species_code][total_detections <= 3]
if (nrow(rare_species) > 0) {
  cat(sprintf("\nSpecies with <= 3 total detections: %d\n", nrow(rare_species)))
  cat("  These may be vagrants/accidentals. Consider filtering if needed.\n")
}

# Check for missing weeks (no data at all)
weeks_with_data <- sort(unique(freq$week))
missing_weeks <- setdiff(1:52, weeks_with_data)
if (length(missing_weeks) > 0) {
  cat(sprintf("\nWeeks with NO data: %s\n", paste(missing_weeks, collapse = ", ")))
  cat("  [!!] This is unusual and may indicate a filtering problem.\n")
} else {
  cat("\nAll 52 weeks have data (good)\n")
}

# ---------------------------------------------------------------------------
# 5. Output file size summary
# ---------------------------------------------------------------------------
cat("\n--- Output File Sizes ---\n\n")

json_dir <- file.path(OUTPUT_DIR, "json")
if (dir.exists(json_dir)) {
  all_files <- list.files(json_dir, recursive = TRUE, full.names = TRUE)
  for (f in all_files) {
    size_kb <- file.size(f) / 1e3
    cat(sprintf("  %-45s %8.1f KB\n", basename(f), size_kb))
  }
  total_mb <- sum(file.size(all_files)) / 1e6
  cat(sprintf("\n  Total: %.1f MB\n", total_mb))
}

# ---------------------------------------------------------------------------
# 6. Generate simple HTML report (optional)
# ---------------------------------------------------------------------------
if (requireNamespace("knitr", quietly = TRUE) &&
    requireNamespace("ggplot2", quietly = TRUE)) {

  cat("\n--- Generating HTML Report ---\n")

  library(ggplot2)

  report_dir <- file.path(OUTPUT_DIR, "report")
  if (!dir.exists(report_dir)) dir.create(report_dir, recursive = TRUE)

  # Plot 1: Species count per week
  p1 <- ggplot(species_per_week, aes(x = week, y = n_species)) +
    geom_line(color = "#2196F3", linewidth = 1) +
    geom_point(color = "#2196F3", size = 2) +
    labs(title = "Species Richness by Week", x = "Week", y = "Number of Species") +
    theme_minimal()
  ggsave(file.path(report_dir, "species_per_week.png"), p1,
         width = 8, height = 4, dpi = 150)

  # Plot 2: Checklist effort per week
  p2 <- ggplot(week_effort, aes(x = week, y = total_checklists)) +
    geom_bar(stat = "identity", fill = "#4CAF50", alpha = 0.7) +
    labs(title = "Checklist Effort by Week", x = "Week", y = "Total Checklists") +
    theme_minimal()
  ggsave(file.path(report_dir, "effort_per_week.png"), p2,
         width = 8, height = 4, dpi = 150)

  # Plot 3: Frequency distribution
  p3 <- ggplot(freq, aes(x = frequency)) +
    geom_histogram(bins = 50, fill = "#FF9800", alpha = 0.7) +
    scale_y_log10() +
    labs(title = "Distribution of Reporting Frequencies (log scale)",
         x = "Frequency", y = "Count (log)") +
    theme_minimal()
  ggsave(file.path(report_dir, "frequency_distribution.png"), p3,
         width = 8, height = 4, dpi = 150)

  cat(sprintf("  Plots saved to: %s\n", report_dir))
} else {
  cat("\nSkipping HTML report (install ggplot2 and knitr for plots)\n")
}

cat("\n=== Step 5: Validation complete ===\n")
cat("\nIf the indicator species patterns look correct, the data is ready to use.\n")
cat("Copy the JSON output to your backend/data/ directory.\n")
