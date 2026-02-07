# ==============================================================================
# UTILITY: GENERATE REGIONAL CHECKLISTS FROM EBIRD
# ==============================================================================
# Purpose:
#   Queries the eBird API to find out which birds are present in specific
#   states/countries. Generates a table you can merge into 'avibase.csv'
#   to populate the 'reg_RegionName' columns automatically.
# ==============================================================================

library(rebird)
library(dplyr)
library(purrr)
library(readr)
library(tidyr)

# Ensure API Key is set
if(Sys.getenv("EBIRD_KEY") == "") {
  stop("Please set your eBird API key: Sys.setenv(EBIRD_KEY='...')")
}

# ------------------------------------------------------------------------------
# 1. DEFINE REGION MAPPINGS
# Map eBird Region Codes (e.g., 'US-ME', 'MX') to your App Region Names
# ------------------------------------------------------------------------------

region_map <- list(
  # --- CONUS ---
  # Removed PA, MD, DC from Northeast
  US_Northeast = c("US-ME", "US-VT", "US-NH", "US-MA", "US-CT", "US-RI", 
                   "US-NY", "US-NJ", "US-DE"),
  
  # Added PA, MD, DC to Southeast
  US_Southeast = c("US-PA", "US-MD", "US-DC", "US-VA", "US-WV", "US-NC", "US-SC", "US-GA", "US-FL", 
                   "US-AL", "US-MS", "US-TN", "US-KY", "US-LA", "US-AR"),
  
  US_Midwest   = c("US-OH", "US-IN", "US-IL", "US-MI", "US-WI", "US-MN", 
                   "US-IA", "US-MO", "US-ND", "US-SD", "US-NE", "US-KS"),
  
  US_Rockies   = c("US-MT", "US-WY", "US-CO", "US-ID", "US-UT", "US-NV"),
  
  US_Southwest = c("US-AZ", "US-NM", "US-TX", "US-OK"),
  
  US_WestCoast = c("US-CA", "US-OR", "US-WA"),
  
  # --- NON-CONUS ---
  Alaska       = c("US-AK"),
  Hawaii       = c("US-HI"),
  
  Canada_Greenland = c("CA", "GL", "PM"), # Canada, Greenland, St. Pierre/Miquelon
  
  Central_America  = c("MX", "BZ", "GT", "HN", "SV", "NI", "CR", "PA"),
  
  # Expanded Caribbean list (Added BM for Bermuda)
  Caribbean        = c("BS", "CU", "HT", "DO", "JM", "PR", "KY", "TC", "VI", "VG",
                       "AI", "AG", "AW", "BB", "BQ", "CW", "DM", "GD", "GP", "MQ",
                       "MS", "KN", "LC", "VC", "SX", "MF", "BL", "TT", "BM") 
)

# ------------------------------------------------------------------------------
# 2. FETCH DATA FROM EBIRD API
# ------------------------------------------------------------------------------
message("Fetching species lists from eBird API...")

# Pre-load taxonomy to identify categories (species vs hybrid)
# ebirdregionspecies() does not return the 'category' column, so we need to join this.
taxonomy_ref <- ebirdtaxonomy() %>% select(speciesCode, category)

all_records <- list()

for (app_region in names(region_map)) {
  sub_regions <- region_map[[app_region]]
  message(sprintf("Processing %s (%d sub-regions)...", app_region, length(sub_regions)))
  
  # Fetch species for each sub-region (e.g., each state)
  # ebirdregionspecies returns ALL species ever reported there
  region_species <- map_dfr(sub_regions, function(r_code) {
    tryCatch({
      # Sleep slightly to avoid hitting API rate limits
      Sys.sleep(0.2) 
      
      # Pass key explicitly to ensure it's picked up
      res <- rebird::ebirdregionspecies(r_code, key = Sys.getenv("EBIRD_KEY"))
      
      if(nrow(res) > 0) {
        res %>% 
          inner_join(taxonomy_ref, by = "speciesCode") %>% # Join to get 'category'
          filter(category == "species") %>% # Filter out hybrids, slashes, and spuhs
          select(speciesCode) %>%
          mutate(region_code = r_code)
      } else {
        warning(paste("No data returned for:", r_code))
        data.frame()
      }
    }, error = function(e) {
      warning(paste("Failed to fetch:", r_code, "-", e$message))
      return(data.frame())
    })
  })
  
  if (nrow(region_species) > 0) {
    # Deduplicate: If bird is in ANY state in the region, it is "Present"
    unique_codes <- unique(region_species$speciesCode)
    
    all_records[[app_region]] <- data.frame(
      speciesCode = unique_codes,
      App_Region = app_region,
      Status = "Present" # You can manually change this to 'Native' later
    )
    message(sprintf("  -> Found %d unique species.", length(unique_codes)))
  } else {
    message("  -> No species found for this region.")
  }
}

# ------------------------------------------------------------------------------
# 3. PIVOT AND EXPORT
# ------------------------------------------------------------------------------
message("Compiling master table...")

if (length(all_records) == 0) {
  stop("CRITICAL ERROR: No data was retrieved from eBird. Check your API key and internet connection.")
}

full_table <- bind_rows(all_records)

# Check if we actually have data before pivoting
if (nrow(full_table) == 0) {
  stop("CRITICAL ERROR: Data table is empty. API calls may have failed.")
}

# Pivot to Wide Format: One row per bird, columns for each region
# Columns will be named 'reg_US_Northeast', 'reg_Alaska', etc.
wide_table <- full_table %>%
  pivot_wider(
    names_from = App_Region,
    values_from = Status,
    names_prefix = "reg_"
  )

# Fetch Common/Sci Names and Taxon Order for sorting
taxonomy <- ebirdtaxonomy() %>% select(speciesCode, comName, sciName, taxonOrder)

final_output <- taxonomy %>%
  inner_join(wide_table, by = "speciesCode") %>%
  arrange(taxonOrder) %>% # Sort by taxonomic order
  select(-taxonOrder)     # Remove taxonOrder column for cleaner CSV

# Save
write_csv(final_output, "regional_presence_ebird.csv", na = "")

message("Done! Saved to 'regional_presence_ebird.csv'.")
message("You can now copy these 'reg_*' columns into your main 'avibase.csv'.")