# ==============================================================================
# MASTER PIPELINE: FIND-A-LIFER APP GENERATOR
# Version: Final Unmasked & Status-Aware (Nested Deployment)
# ==============================================================================
# 1. Reads species list (with statuses) & Matches Taxonomy
# 2. Defines ONE Unified Region (North America + Hawaii)
# 3. Downloads & Processes eBird S&T Data (27km) - RAW / NO MASKING
# 4. Cleans Metadata & Splits Database into 'FindALifer_App/app_data'
# ==============================================================================

# Initialize Environment
rm(list = ls())

# --- CONFIGURATION ---
TEST_MODE <- FALSE
Sys.setenv(EBIRD_KEY = "ar8ei8j24plp")

# --- LIBRARIES ---
library(dplyr)
library(purrr)
library(readr)
library(sf)
library(terra)
library(rebird)
library(ebirdst)

# --- DIRECTORY SETUP ---
# We nest the app data so we can deploy ONLY the 'FindALifer_App' folder.
DEPLOY_DIR <- "FindALifer_App"
DATA_DIR   <- file.path(DEPLOY_DIR, "app_data")

if (!dir.exists(DEPLOY_DIR)) dir.create(DEPLOY_DIR)
if (!dir.exists(DATA_DIR)) dir.create(DATA_DIR)

message(sprintf("Output directory set to: %s", DATA_DIR))

# ==============================================================================
# STEP 1: SPECIES LIST PROCESSING
# ==============================================================================
message("\n--- STEP 1: Processing Species List ---")

if (!file.exists("avibase.csv")) {
  stop("Critical Error: 'avibase.csv' not found in working directory.")
}

# Import Target List (Now including Status columns)
raw_targets <- read_csv("avibase.csv", show_col_types = FALSE) %>% 
  select(sciName, comName, invasionStatus, conservStatus) %>% 
  distinct()

# Retrieve eBird Taxonomy
ebird_tax <- ebirdtaxonomy() %>% 
  select(speciesCode, comName, sciName, familyComName, taxonOrder)

# Primary Match: Scientific Name
matched_sci <- raw_targets %>%
  inner_join(ebird_tax, by = "sciName") %>%
  rename(comName = comName.y) %>% 
  select(-comName.x)

# Secondary Match: Common Name
unmatched_sci <- raw_targets %>%
  filter(!sciName %in% matched_sci$sciName)

if (nrow(unmatched_sci) > 0) {
  matched_com <- unmatched_sci %>%
    select(-sciName) %>% 
    inner_join(ebird_tax, by = "comName")
  
  matched_targets <- bind_rows(matched_sci, matched_com)
} else {
  matched_targets <- matched_sci
}

# Filter for S&T Availability
runs <- ebirdst_runs %>% select(species_code)

# Map Targets
map_list <- matched_targets %>%
  semi_join(runs, by = c("speciesCode" = "species_code")) %>%
  arrange(taxonOrder)

target_codes <- map_list$speciesCode

# Checklist Targets (All Valid Species)
checklist_list <- matched_targets %>% 
  arrange(taxonOrder)

# Apply Test Mode
if (TEST_MODE) {
  message("!!! TEST MODE ACTIVE !!!")
  preferred_tests <- c("zebdov", "commyn", "pagplo", "sooshe", "bkfalb", "baleag", "comrav", "yerwar")
  target_codes <- intersect(target_codes, preferred_tests)
  
  if (length(target_codes) < 8) {
    needed <- 8 - length(target_codes)
    others <- setdiff(map_list$speciesCode, target_codes)
    if (length(others) > 0) {
      target_codes <- c(target_codes, head(others, needed))
    }
  }
  
  checklist_codes <- unique(c(target_codes, preferred_tests))
  checklist_list <- checklist_list %>% filter(speciesCode %in% checklist_codes)
  
  message(paste("Test Mapping Selected:", paste(target_codes, collapse = ", ")))
}

message(paste("Final processing count:", length(target_codes), "species."))

# ==============================================================================
# STEP 2: SPATIAL GRID GENERATION
# ==============================================================================
message("\n--- STEP 2: Creating Unified 27km Grid (Web Mercator) ---")

ref_species <- target_codes[1]

tryCatch({
  load_raster(ref_species, product = "abundance", resolution = "27km")
}, error = function(e) {
  ebirdst_download_status(ref_species, pattern = "abundance_median_27km")
})

ref_rast <- load_raster(ref_species, product = "abundance", resolution = "27km")

# Project to Web Mercator (EPSG:3857) - No Masking/Cropping
template_grid <- project(ref_rast[[1]], "EPSG:3857", method = "near")

# Initialize Values
values(template_grid) <- 1:ncell(template_grid)
names(template_grid) <- "cell_id"

writeRaster(template_grid, file.path(DATA_DIR, "grid_unified.tif"), 
            overwrite = TRUE, datatype = "INT4U", gdal = c("COMPRESS=DEFLATE"))

message("Unified Grid Created.")

# ==============================================================================
# STEP 3: DATA EXTRACTION LOOP
# ==============================================================================
message("\n--- STEP 3: Processing Species Data (27km) ---")

species_occurrence_list <- list()
counter <- 0

for (code in target_codes) {
  counter <- counter + 1
  is_verbose <- (counter %% 5 == 0 || counter == 1 || counter == length(target_codes))
  if (is_verbose) {
    message(sprintf("[%s] Processing %d/%d: %s", 
                    format(Sys.time(), "%H:%M:%S"), counter, length(target_codes), code))
  }
  
  check <- try(load_raster(code, product = "abundance", resolution = "27km"), silent = TRUE)
  if (inherits(check, "try-error")) {
    message(sprintf("   -> Downloading %s...", code))
    try(ebirdst_download_status(code, pattern = "abundance_median_27km", force = TRUE), silent = TRUE)
  }
  
  r <- try(load_raster(code, product = "abundance", resolution = "27km"), silent = TRUE)
  if (inherits(r, "try-error")) next
  
  r_proj <- project(r, template_grid, method = "near")
  
  for (w in 1:52) {
    v <- values(r_proj[[w]])
    idx <- which(v > 0)
    
    if (length(idx) > 0) {
      c_ids <- values(template_grid)[idx]
      c_ids <- c_ids[!is.na(c_ids)]
      
      if (length(c_ids) > 0) {
        species_occurrence_list[[length(species_occurrence_list) + 1]] <- 
          data.frame(cell_id = c_ids, week = w, species_code = code)
      }
    }
  }
  rm(r, r_proj); gc()
}

message("Binding master lookup table...")
master_lookup <- bind_rows(species_occurrence_list)
rm(species_occurrence_list); gc()

# ==============================================================================
# STEP 4: DATA PACKAGING AND OPTIMIZATION
# ==============================================================================
message("\n--- STEP 4: Final Packaging ---")

# Save Extended Metadata
final_meta <- checklist_list %>%
  mutate(species_id = 1:n()) %>% 
  mutate(
    familyComName = ifelse(is.na(familyComName) | familyComName == "", "Other", familyComName),
    invasionStatus = ifelse(is.na(invasionStatus) | invasionStatus == "", "Unknown", invasionStatus),
    conservStatus = ifelse(is.na(conservStatus) | conservStatus == "", "Unknown", conservStatus)
  )

saveRDS(final_meta, file.path(DATA_DIR, "species_extended.rds"))

# Remove valid_cells.rds if it exists in the new location (cleanup)
if (file.exists(file.path(DATA_DIR, "valid_cells.rds"))) {
  file.remove(file.path(DATA_DIR, "valid_cells.rds"))
}

# Partition Database
message("Partitioning database into 52 weekly files...")
WEEKS_DIR <- file.path(DATA_DIR, "weeks")
if (!dir.exists(WEEKS_DIR)) dir.create(WEEKS_DIR)

master_lookup_integers <- master_lookup %>%
  inner_join(final_meta %>% select(speciesCode, species_id), 
             by = c("species_code" = "speciesCode")) %>%
  select(cell_id, week, species_id)

rm(master_lookup); gc()

for (w in 1:52) {
  if (w %% 4 == 0) message(sprintf("  Saving week %d/52...", w))
  week_data <- master_lookup_integers %>% filter(week == w)
  saveRDS(week_data, file.path(WEEKS_DIR, sprintf("week_%02d.rds", w)))
}

# Ensure lists directory exists for local user saves
LISTS_DIR <- file.path(DATA_DIR, "lists")
if (!dir.exists(LISTS_DIR)) dir.create(LISTS_DIR)

# Initialize Default User List
if (!file.exists(file.path(DATA_DIR, "my_life_list.rds"))) {
  saveRDS(character(0), file.path(DATA_DIR, "my_life_list.rds"))
}

rm(master_lookup_integers); gc()

message("SUCCESS! Pipeline Complete.")
message(sprintf("Output saved to: %s", DATA_DIR))