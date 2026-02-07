# ==============================================================================
# UTILITY: GENERATE REGION STARTER PACK
# Creates a base map of regions for you to edit in ArcGIS Pro
# ==============================================================================

library(sf)
library(rnaturalearth)
library(dplyr)

# 1. Load Data
us_states <- ne_states(country = "United States of America", returnclass = "sf")
can_provs <- ne_states(country = "Canada", returnclass = "sf")
countries <- ne_countries(scale = "medium", returnclass = "sf")

# 2. Define Region Groupings (Modify these definitions if needed)
# A. CONUS Regions
ne_states <- c("Maine", "Vermont", "New Hampshire", "Massachusetts", "Connecticut",
               "Rhode Island", "New York", "New Jersey", "Pennsylvania", "New Jersey",
               "Delaware")
se_states <- c("Virginia", "West Virginia", "North Carolina", "South Carolina",
               "Georgia", "Florida", "Alabama", "Mississippi", "Tennessee", 
               "Kentucky", "Louisiana", "Arkansas", "Maryland", "District of Columbia")
mw_states <- c("Ohio", "Indiana", "Illinois", "Michigan", "Wisconsin", "Minnesota",
               "Iowa", "Missouri", "North Dakota", "South Dakota", "Nebraska", "Kansas")
rk_states <- c("Montana", "Wyoming", "Colorado", "Idaho", "Utah", "Nevada")
sw_states <- c("Arizona", "New Mexico", "Texas", "Oklahoma")
wc_states <- c("California", "Oregon", "Washington")

# B. International
# "Alaska & Canada & Greenland"
north_north_am <- c("Canada", "Greenland") 

# "Mainland Latin America"
central_am <- c("Mexico", "Belize", "Guatemala", "Honduras", "El Salvador", "Nicaragua", "Costa Rica", "Panama")

# "Caribbean Islands"
caribbean <- c("The Bahamas", "Cuba", "Haiti", "Dominican Republic", "Jamaica", "Puerto Rico") # Add others as needed

# 3. Build Polygons
regions_list <- list()

# Helper to merge
merge_polys <- function(sf_data, name) {
  st_union(sf_data) %>% st_as_sf() %>% mutate(region = name)
}

# --- Build CONUS ---
regions_list[[1]] <- us_states %>% filter(name %in% ne_states) %>% merge_polys("US_Northeast")
regions_list[[2]] <- us_states %>% filter(name %in% se_states) %>% merge_polys("US_Southeast")
regions_list[[3]] <- us_states %>% filter(name %in% mw_states) %>% merge_polys("US_Midwest")
regions_list[[4]] <- us_states %>% filter(name %in% rk_states) %>% merge_polys("US_Rockies")
regions_list[[5]] <- us_states %>% filter(name %in% sw_states) %>% merge_polys("US_Southwest")
regions_list[[6]] <- us_states %>% filter(name %in% wc_states) %>% merge_polys("US_WestCoast")

# --- Build International ---
# Alaska (Extract from US)
regions_list[[7]] <- us_states %>% filter(name == "Alaska") %>% merge_polys("Alaska")
# Canada/Greenland
regions_list[[8]] <- countries %>% filter(admin %in% north_north_am) %>% merge_polys("Canada_Greenland")
# Central Am
regions_list[[9]] <- countries %>% filter(admin %in% central_am) %>% merge_polys("Central_America")
# Caribbean
regions_list[[10]] <- countries %>% filter(admin %in% caribbean) %>% merge_polys("Caribbean")
# Hawaii
regions_list[[11]] <- us_states %>% filter(name == "Hawaii") %>% merge_polys("Hawaii")

# 4. Combine and Save
all_regions <- do.call(rbind, regions_list) %>%
  st_transform(3857) # Web Mercator for easy editing

# Save
st_write(all_regions, "regions_starter.gpkg", delete_layer = TRUE)

message("Created 'regions_starter.gpkg'.")
message("INSTRUCTIONS:")
message("1. Open this file in ArcGIS Pro.")
message("2. Use the 'Edit' tool to drag the coastal edges out into the ocean.")
message("3. DO NOT rename the 'region' column.")
message("4. Save it as 'regions_final.gpkg' in your project folder.")