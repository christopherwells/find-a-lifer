# ==============================================================================
# MASTER PIPELINE: FIND-A-LIFER DATA ENGINEERING
# Version: 4.0 (Unmasked Grid + Regional Filtering)
# ==============================================================================
# DESCRIPTION:
#   This script executes the Extract, Transform, Load (ETL) workflow.
#   It generates a global/unmasked map grid for display, BUT it also processes
#   your custom Shapefile to create "Region" filters and zoom bounds for the App.
#
# INPUTS:
#   - avibase.csv: Species list.
#   - main_regions_starter.shp: Your custom region polygons (ArcGIS).
#
# OUTPUTS (Targeted to FindALifer_App/app_data/):
#   - grid_unified.tif: The spatial template (Web Mercator, Unmasked).
#   - regions_polygons.rds: The shapes used for the "Focus Region" dropdown.
#   - species_regions.rds: Lookup table for which birds are in which region.
#   - species_extended.rds: Cleaned metadata.
#   - weeks/week_*.rds: Partitioned abundance data.
# ==============================================================================

# Initialize Environment
rm(list = ls())

# --- CONFIGURATION PARAMETERS ---
TEST_MODE <- TRUE                 
Sys.setenv(EBIRD_KEY = "ar8ei8j24plp")
SHAPEFILE_NAME <- "main_regions_starter.shp"

# --- LIBRARY IMPORTS ---
library(dplyr)
library(purrr)
library(readr)
library(tidyr)
library(sf)
library(terra)
library(rebird)
library(ebirdst)

# --- DIRECTORY SETUP ---
# Forces all output to the nested deployment folder
DEPLOY_DIR <- "FindALifer_App"
DATA_DIR   <- file.path(DEPLOY_DIR, "app_data")

if (!dir.exists(DEPLOY_DIR)) dir.create(DEPLOY_DIR)
if (!dir.exists(DATA_DIR)) dir.create(DATA_DIR)

message(sprintf("Output directory set to: %s", DATA_DIR))

# ==============================================================================
# SECTION 1: REGION & SHAPEFILE PROCESSING
# ==============================================================================
message("\n--- STEP 1: Processing Regions (Shapefile) ---")

if (!file.exists(SHAPEFILE_NAME)) {
  stop(paste("Critical Error:", SHAPEFILE_NAME, "not found. Please export it from ArcGIS."))
}

# 1. Load Shapefile
# We keep it as 'sf' for the App (Leaflet uses sf)
regions_sf <- read_sf(SHAPEFILE_NAME) %>% 
  st_make_valid() 

# 2. Save for App (Lat/Lon for Leaflet)
# The app uses this to zoom to specific bounding boxes
regions_latlon <- st_transform(regions_sf, 4326)
saveRDS(regions_latlon, file.path(DATA_DIR, "regions_polygons.rds"))

# 3. Create Vector for Analysis (Meters)
# We use this later to determine if a bird is "present" in a region
regions_vect <- vect(st_transform(regions_sf, 3857))

# Get list of region names (Assumes 1st column is name)
region_names <- unique(values(regions_vect)[[1]])
message(sprintf("Loaded %d regions: %s", length(region_names), paste(region_names, collapse=", ")))

# ==============================================================================
# SECTION 2: SPECIES LIST INGESTION
# ==============================================================================
message("\n--- STEP 2: Processing Species List ---")

if (!file.exists("avibase.csv")) stop("avibase.csv not found!")

raw_targets <- read_csv("avibase.csv", show_col_types = FALSE) 

# Sanitize Metadata
processed_targets <- raw_targets %>%
  mutate(
    invasionStatus = ifelse(is.na(invasionStatus) | invasionStatus == "", "Unknown", invasionStatus),
    conservStatus = ifelse(is.na(conservStatus) | conservStatus == "", "Unknown", conservStatus)
  )

# Taxonomy Reconciliation
ebird_tax <- ebirdtaxonomy() %>% 
  select(speciesCode, comName, sciName, familyComName, taxonOrder)

matched_sci <- processed_targets %>%
  inner_join(ebird_tax, by = "sciName") %>%
  rename(comName = comName.y) %>% 
  select(-comName.x)

unmatched_sci <- processed_targets %>% filter(!sciName %in% matched_sci$sciName)
if (nrow(unmatched_sci) > 0) {
  matched_com <- unmatched_sci %>%
    select(-sciName) %>% 
    inner_join(ebird_tax, by = "comName")
  matched_targets <- bind_rows(matched_sci, matched_com)
} else {
  matched_targets <- matched_sci
}

# Filter for S&T
runs <- ebirdst_runs %>% select(species_code)
map_list <- matched_targets %>%
  semi_join(runs, by = c("speciesCode" = "species_code")) %>%
  arrange(taxonOrder)

target_codes <- map_list$speciesCode
checklist_list <- matched_targets %>% arrange(taxonOrder)

if (TEST_MODE) {
  message("!!! TEST MODE ACTIVE: Sampling species !!!")
  preferred_tests <- c("zebdov", "commyn", "pagplo", "sooshe", "bkfalb", "baleag", "comrav", "yerwar")
  target_codes <- intersect(target_codes, preferred_tests)
  if (length(target_codes) < 8) {
    needed <- 8 - length(target_codes)
    others <- setdiff(map_list$speciesCode, target_codes)
    if (length(others) > 0) target_codes <- c(target_codes, head(others, needed))
  }
  checklist_codes <- unique(c(target_codes, preferred_tests))
  checklist_codes <- intersect(checklist_codes, checklist_list$speciesCode)
  checklist_list <- checklist_list %>% filter(speciesCode %in% checklist_codes)
}

message(paste("Final processing count:", length(target_codes), "species."))

# ==============================================================================
# SECTION 3: INITIALIZE REGIONAL STATUS (MANUAL OVERRIDES)
# ==============================================================================
message("\n--- STEP 3: Initializing Regional Status from CSV ---")

status_map <- list()

# 1. Check for manual overrides in CSV (reg_RegionName columns)
targets_with_regions <- matched_targets %>%
  filter(speciesCode %in% checklist_list$speciesCode) %>%
  left_join(raw_targets %>% select(sciName, starts_with("reg_")), by="sciName")

for (i in 1:nrow(targets_with_regions)) {
  row <- targets_with_regions[i, ]
  sp_code <- row$speciesCode
  
  for (reg in region_names) {
    col_name <- paste0("reg_", reg)
    if (col_name %in% names(row)) {
      val <- row[[col_name]]
      if (!is.na(val) && val != FALSE && val != "" && val != "Absent") {
        status_map[[length(status_map)+1]] <- data.frame(
          speciesCode = sp_code,
          region = reg,
          status = as.character(val)
        )
      }
    }
  }
}

message(sprintf("Initialized %d manual region records.", length(status_map)))

# ==============================================================================
# SECTION 4: UNIFIED GRID GENERATION
# ==============================================================================
message("\n--- STEP 4: Creating Unified 27km Grid (Web Mercator) ---")

ref_species <- target_codes[1]
tryCatch({
  load_raster(ref_species, product = "abundance", resolution = "27km")
}, error = function(e) {
  ebirdst_download_status(ref_species, pattern = "abundance_median_27km")
})

ref_rast <- load_raster(ref_species, product = "abundance", resolution = "27km")

# Project to Web Mercator (EPSG:3857) - No Masking
template_grid <- project(ref_rast[[1]], "EPSG:3857", method = "near")
values(template_grid) <- 1:ncell(template_grid)
names(template_grid) <- "cell_id"

writeRaster(template_grid, file.path(DATA_DIR, "grid_unified.tif"), 
            overwrite = TRUE, datatype = "INT4U", gdal = c("COMPRESS=DEFLATE"))

message("Unified Grid Created.")

# ==============================================================================
# SECTION 5: DATA EXTRACTION LOOP
# ==============================================================================
message("\n--- STEP 5: Processing Species Data (27km) ---")

species_occurrence_list <- list()
counter <- 0

for (code in target_codes) {
  counter <- counter + 1
  is_verbose <- (counter %% 10 == 0 || counter == 1)
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
  
  # --- 5a. Auto-Detect Regional Presence ---
  # Check if the bird is present in any of the custom regions
  year_max <- max(r_proj, na.rm=TRUE)
  
  # Extract max value per polygon
  # returns a matrix with 2 columns: ID, value
  reg_vals <- extract(year_max, regions_vect, fun=max, na.rm=TRUE)
  
  for(k in 1:nrow(reg_vals)) {
    val <- reg_vals[k, 2] # The max abundance value
    if (!is.na(val) && val > 0) {
      r_name <- region_names[k]
      
      # Check if already manually set
      is_manual <- any(sapply(status_map, function(x) x$speciesCode == code && x$region == r_name))
      
      if (!is_manual) {
        status_map[[length(status_map)+1]] <- data.frame(
          speciesCode = code,
          region = r_name,
          status = "Native" # Default auto-detected status
        )
      }
    }
  }
  
  # --- 5b. Extract Weekly Data ---
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
  rm(r, r_proj, year_max); gc()
}

message("Aggregating master lookup table...")
master_lookup <- bind_rows(species_occurrence_list)
rm(species_occurrence_list); gc()

# ==============================================================================
# SECTION 6: FINAL PACKAGING
# ==============================================================================
message("\n--- STEP 6: Final Packaging ---")

# Save Metadata
final_meta <- checklist_list %>%
  mutate(species_id = 1:n()) %>% 
  mutate(
    familyComName = ifelse(is.na(familyComName) | familyComName == "", "Other", familyComName),
    invasionStatus = ifelse(is.na(invasionStatus) | invasionStatus == "", "Unknown", invasionStatus),
    conservStatus = ifelse(is.na(conservStatus) | conservStatus == "", "Unknown", conservStatus)
  )
saveRDS(final_meta, file.path(DATA_DIR, "species_extended.rds"))

# Save Regional Status Map
all_region_presence <- bind_rows(status_map) %>% distinct(speciesCode, region, .keep_all = TRUE)
saveRDS(all_region_presence, file.path(DATA_DIR, "species_regions.rds"))

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

# Ensure lists directory exists
LISTS_DIR <- file.path(DATA_DIR, "lists")
if (!dir.exists(LISTS_DIR)) dir.create(LISTS_DIR)

if (!file.exists(file.path(DATA_DIR, "my_life_list.rds"))) {
  saveRDS(character(0), file.path(DATA_DIR, "my_life_list.rds"))
}

rm(master_lookup_integers); gc()

message("SUCCESS! Pipeline Complete.")
message(sprintf("All assets saved to: %s", DATA_DIR))