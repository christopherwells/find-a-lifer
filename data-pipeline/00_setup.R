# =============================================================================
# 00_setup.R — Install and Check Required Packages
# =============================================================================
# Run this once before running the pipeline to ensure all dependencies are
# installed and the system environment is correctly configured.
#
# Usage:  Rscript 00_setup.R
# =============================================================================

cat("=== Find-A-Lifer Data Pipeline: Environment Setup ===\n\n")

# ---------------------------------------------------------------------------
# 1. Required packages
# ---------------------------------------------------------------------------
required_packages <- c(
  "auk",         # eBird data filtering and import
  "sf",          # spatial operations, GeoJSON export
  "dplyr",       # data manipulation (used alongside data.table for readability)
  "data.table",  # fast aggregation for large datasets
  "h3jsr",       # H3 hexagonal grid (R interface to H3 via V8)
  "jsonlite",    # JSON export
  "lubridate"    # date/week calculations
)

# Optional but recommended
optional_packages <- c(
  "fst",         # fast .fst file I/O (alternative to .rds)
  "ggplot2",     # for validation plots
  "knitr"        # for HTML report generation
)

# ---------------------------------------------------------------------------
# 2. Install missing packages
# ---------------------------------------------------------------------------
install_if_missing <- function(pkgs, optional = FALSE) {
  label <- if (optional) "optional" else "required"
  for (pkg in pkgs) {
    if (requireNamespace(pkg, quietly = TRUE)) {
      ver <- as.character(packageVersion(pkg))
      cat(sprintf("  [OK]  %-14s v%s\n", pkg, ver))
    } else {
      if (optional) {
        cat(sprintf("  [--]  %-14s not installed (optional)\n", pkg))
      } else {
        cat(sprintf("  [..]  %-14s installing...\n", pkg))
        tryCatch({
          install.packages(pkg, quiet = TRUE)
          ver <- as.character(packageVersion(pkg))
          cat(sprintf("  [OK]  %-14s v%s (just installed)\n", pkg, ver))
        }, error = function(e) {
          cat(sprintf("  [!!]  %-14s FAILED to install: %s\n", pkg, e$message))
        })
      }
    }
  }
}

cat("Checking required packages:\n")
install_if_missing(required_packages, optional = FALSE)

cat("\nChecking optional packages:\n")
install_if_missing(optional_packages, optional = TRUE)

# ---------------------------------------------------------------------------
# 3. Check h3jsr / V8 engine
# ---------------------------------------------------------------------------
cat("\nChecking H3 engine:\n")
tryCatch({
  library(h3jsr)
  # Quick test: convert a known lat/lon to H3 index
  test_h3 <- point_to_cell(
    sf::st_sfc(sf::st_point(c(-69.0, 44.0)), crs = 4326),
    res = 4
  )
  cat(sprintf("  [OK]  h3jsr working. Test cell: %s\n", test_h3))
}, error = function(e) {
  cat(sprintf("  [!!]  h3jsr error: %s\n", e$message))
  cat("  h3jsr requires the V8 JavaScript engine.\n")
  cat("  Try: install.packages('V8')\n")
  cat("  On Linux you may need: sudo apt-get install libv8-dev\n")
})

# ---------------------------------------------------------------------------
# 4. Check auk / AWK availability (critical on Windows)
# ---------------------------------------------------------------------------
cat("\nChecking AWK for auk:\n")
tryCatch({
  library(auk)
  awk_path <- auk_get_awk_path()
  if (is.null(awk_path) || awk_path == "") {
    cat("  [!!]  AWK not found. auk requires gawk.\n")
    if (.Platform$OS.type == "windows") {
      cat("\n  === Windows Setup Instructions ===\n")
      cat("  auk needs Cygwin's gawk to filter EBD files.\n")
      cat("  1. Install Cygwin from https://www.cygwin.com/\n")
      cat("  2. During install, search for and select the 'gawk' package\n")
      cat("  3. After install, run in R:\n")
      cat('     auk_set_awk_path("C:/cygwin64/bin/gawk.exe")\n')
      cat("  4. Restart R and re-run this script\n")
    }
  } else {
    cat(sprintf("  [OK]  AWK found at: %s\n", awk_path))
  }
}, error = function(e) {
  cat(sprintf("  [!!]  auk error: %s\n", e$message))
})

# ---------------------------------------------------------------------------
# 5. System diagnostics
# ---------------------------------------------------------------------------
cat("\nSystem info:\n")
cat(sprintf("  R version:  %s\n", R.version.string))
cat(sprintf("  Platform:   %s\n", R.version$platform))
cat(sprintf("  OS type:    %s\n", .Platform$OS.type))
cat(sprintf("  Cores:      %d\n", parallel::detectCores()))
cat(sprintf("  RAM:        (check with your system monitor)\n"))
cat(sprintf("  Working dir: %s\n", getwd()))

# ---------------------------------------------------------------------------
# 6. Windows-specific notes
# ---------------------------------------------------------------------------
if (.Platform$OS.type == "windows") {
  cat("\n=== Windows Notes ===\n")
  cat("  - auk requires Cygwin gawk (see above)\n")
  cat("  - File paths: use forward slashes or double backslashes\n")
  cat("  - If using Bowdoin HPC, the Linux environment avoids these issues\n")
}

cat("\n=== Setup check complete ===\n")
cat("If all required packages show [OK], you're ready to run the pipeline.\n")
cat("Next step: edit config.R with your EBD/SED file paths, then run 01_filter_ebd.R\n")
