library(shiny)
library(leaflet)
library(terra)
library(dplyr)
library(sf)
library(viridisLite) 

# ==============================================================================
# 1. SETUP & DATA LOADING
# ==============================================================================

# --- DATA LOADING ---
load_data <- function() {
  tryCatch({
    required_files <- c("app_data/grid_unified.tif", 
                        "app_data/species_extended.rds",
                        "app_data/species_regions.rds",
                        "app_data/regions_polygons.rds")
    
    # Check for missing files
    missing <- required_files[!file.exists(required_files)]
    if (length(missing) > 0) {
      return(list(success = FALSE, error = paste("Missing:", paste(missing, collapse=", "))))
    }
    
    print(paste("Loading Grid from:", normalizePath("app_data/grid_unified.tif")))
    
    # Load assets
    grid_val <- terra::rast("app_data/grid_unified.tif")
    meta_val <- readRDS("app_data/species_extended.rds")
    regions_val <- readRDS("app_data/species_regions.rds")
    polys_val <- readRDS("app_data/regions_polygons.rds")
    
    list(
      success = TRUE,
      grid = grid_val,
      meta = meta_val,
      spec_regions = regions_val,
      region_polys = polys_val
    )
  }, error = function(e) { 
    return(list(success = FALSE, error = e$message)) 
  })
}

# --- 3. EXECUTE LOAD & POPULATE ---
assets <- load_data()

# Initialize Global Variables
grid_template <- NULL
species_meta <- data.frame(
  familyComName=character(), speciesCode=character(), comName=character(), 
  sciName=character(), species_id=integer(), 
  invasionStatus=character(), conservStatus=character()
)
unique_families <- character()
spec_region_map <- data.frame()
region_polys <- NULL
avail_regions <- character()
unique_invasions <- character()
unique_conserv <- character()
loading_error <- NULL

if (isTRUE(assets$success)) {
  grid_template <- assets$grid
  species_meta <- assets$meta
  spec_region_map <- assets$spec_regions
  region_polys <- assets$region_polys
  
  # Populate Lists
  unique_families <- sort(unique(species_meta$familyComName))
  
  # Status lists
  if("invasionStatus" %in% names(species_meta)) {
    unique_invasions <- sort(unique(species_meta$invasionStatus))
  }
  if("conservStatus" %in% names(species_meta)) {
    unique_conserv <- sort(unique(species_meta$conservStatus))
  }
  
  # Region Names
  if(!is.null(region_polys) && inherits(region_polys, "sf")) {
    # Assume first column contains the region names
    avail_regions <- sort(unique(region_polys[[1]]))
  }
} else {
  # Capture error for UI notification
  loading_error <- assets$error
  print(paste("Startup Warning:", loading_error))
}

# Helper: Date String
get_date_label <- function(week_num) {
  date_center <- as.Date("2021-01-04") + (week_num - 1) * 7
  format(date_center, "%B %d")
}

# ==============================================================================
# 2. UI
# ==============================================================================
ui <- bootstrapPage(
  tags$style(type = "text/css", "html, body {width:100%;height:100%}"),
  
  tags$head(
    tags$meta(name = "apple-mobile-web-app-capable", content = "yes"),
    tags$meta(name = "viewport", content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"),
    tags$script("
      $(document).ready(function() {
        $('#controls_panel').draggable({ handle: '#drag_handle', containment: 'window' });
      });
    "),
    tags$style(HTML("
      body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
      #drag_handle { cursor: move; }
      .nav-tabs { border-bottom: 1px solid #ddd; margin-bottom: 10px; }
      .nav-tabs > li > a { padding: 5px 10px; font-size: 0.9em; color: #2c3e50; }
      .nav-tabs > li.active > a { font-weight: bold; color: #000; }
      .tab-content { font-size: 0.9em; color: #2c3e50; }
      .section-label { font-weight: bold; margin-bottom: 5px; display: block; color: #555; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.5px; }
      .scroll-container {
        border: 1px solid #ccc; padding: 5px; border-radius: 4px; background: white; 
        overflow-y: auto; resize: vertical; min-height: 150px; max-height: 500px;
      }
      .fam-controls a { font-size: 0.8em; text-decoration: none; margin-left: 5px; font-weight: normal; color: #007bff; }
      .fam-controls a:hover { text-decoration: underline; }
      .info.legend { background-color: white !important; opacity: 1 !important; box-shadow: 0 0 15px rgba(0,0,0,0.2); border-radius: 5px; }
      .context-list-box {
        margin-top: 10px; padding: 10px; background-color: #f8f9fa;
        border: 1px solid #ddd; border-radius: 4px; border-left: 4px solid #2c3e50;
      }
      details > summary {
        list-style: none; cursor: pointer; font-weight: bold; color: #2c3e50;
        padding: 8px 5px; background-color: #f8f9fa; border-bottom: 1px solid #ddd;
        outline: none; display: flex; justify-content: space-between; align-items: center;
      }
      details > summary::-webkit-details-marker { display: none; }
      .summary-marker::after { content: '+'; font-weight: bold; color: #777; margin-left: 5px; }
      details[open] > summary .summary-marker::after { content: '-'; }
    "))
  ),
  
  leafletOutput("map", width = "100%", height = "100%"),
  
  absolutePanel(
    id = "controls_panel", 
    top = 80, left = 10, 
    draggable = FALSE, 
    style = "width: 340px; padding: 10px; background: rgba(255,255,255,0.98); border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto; overflow-x: hidden; resize: both; min-width: 300px; max-width: 90vw; z-index: 9999;",
    
    div(style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;",
        h4("Find-A-Lifer", id="drag_handle", style="margin:0; color: #2c3e50; font-weight: bold; flex-grow: 1;"),
        actionButton("toggle_panel", "-", style="padding: 2px 8px; font-weight: bold; height: 25px; font-size: 0.8em;")
    ),
    
    conditionalPanel(
      condition = "output.is_panel_open",
      
      tabsetPanel(id = "main_tabs",
                  
                  # --- TAB 1: MAP CONTROLS ---
                  tabPanel("Map", icon = icon("globe"),
                           div(style="padding-top: 10px;",
                               
                               # Region Filter
                               div(title="Zoom to specific region and filter checklist",
                                   selectInput("region_select", "Focus Region:", choices = c("All Regions", avail_regions), width="100%")
                               ),
                               hr(style="margin: 10px 0;"),
                               
                               # Week Slider
                               div(title="Change the week to see migration patterns",
                                   span(class="section-label", "Time of Year"),
                                   sliderInput("week_select", NULL, min = 1, max = 52, value = 1, step = 1, ticks = FALSE),
                                   div(style="text-align: center; margin-top: -10px; font-weight: bold;", textOutput("date_label"))
                               ),
                               hr(style="margin: 10px 0;"),
                               
                               # Filters
                               div(title="Spotlight a single species' range (hides all other data)",
                                   selectizeInput("range_species", "Spotlight Species Range:", 
                                                  choices = NULL, multiple = FALSE, 
                                                  options = list(placeholder = "Type to spotlight..."))
                               ),
                               
                               div(title="Restrict the entire heatmap to only show density for a specific family",
                                   selectizeInput("heatmap_filter", "Filter Map by Family:", 
                                                  choices = c("All Families", sort(unique_families)), 
                                                  multiple = FALSE)
                               ),
                               
                               div(title="Filter areas by lifer count range",
                                   sliderInput("lifer_count_filter", "Lifer Count Range:", 
                                               min = 0, max = 600, value = c(1, 600), step = 1, ticks=FALSE)
                               ),
                               
                               # Context Checklist
                               uiOutput("map_context_checklist_ui"),
                               
                               hr(style="margin: 10px 0;"),
                               
                               div(title="Adjust map transparency to see cities and countries underneath",
                                   sliderInput("opacity_select", "Heatmap Opacity:", min = 0, max = 1, value = 0.7, step = 0.1, ticks=FALSE)
                               )
                           )
                  ),
                  
                  # --- TAB 2: FILTERS ---
                  tabPanel("Filters", icon = icon("filter"),
                           div(style="padding-top: 10px;",
                               
                               div(style="margin-bottom: 15px;",
                                   span(class="section-label", "Invasion Status"),
                                   checkboxGroupInput("filter_invasion", label = NULL, 
                                                      choices = sort(unique_invasions), 
                                                      selected = unique_invasions) 
                               ),
                               hr(style="margin: 10px 0;"),
                               div(
                                 span(class="section-label", "Conservation Status"),
                                 checkboxGroupInput("filter_conserv", label = NULL, 
                                                    choices = sort(unique_conserv), 
                                                    selected = unique_conserv) 
                               )
                           )
                  ),
                  
                  # --- TAB 3: CHECKLIST ---
                  tabPanel("My List", icon = icon("list-check"),
                           div(style="padding-top: 10px;",
                               
                               # Global Checklist Controls
                               div(style="margin-bottom: 8px;",
                                   selectizeInput("family_filter", NULL, choices = c("All Families", sort(unique_families)), width="100%", options=list(placeholder="Jump to family...")),
                                   div(style="display: flex; gap: 5px;",
                                       actionButton("global_select_all", "Select All", style="font-size: 0.8em; padding: 4px 8px; flex-grow: 1;"),
                                       actionButton("global_select_none", "Select None", style="font-size: 0.8em; padding: 4px 8px; flex-grow: 1;")
                                   )
                               ),
                               
                               # Checklist Container (No Search)
                               div(title="Check off birds you have seen.",
                                   div(class="scroll-container", style="height: 350px;",
                                       uiOutput("checklist_ui")
                                   )
                               ),
                               div(style="font-size: 0.8em; color: #666; margin-top: 5px; text-align: right;", textOutput("list_count_msg"))
                           )
                  ),
                  
                  # --- TAB 4: TARGETS ---
                  tabPanel("Targets", value = "Targets", icon = icon("crosshairs"),
                           div(style="padding-top: 10px;",
                               div(title="Click the map to list potential lifers in that specific area.",
                                   span(class="section-label", "Lifers in Selected Area"),
                                   div(class="scroll-container", style="height: 250px;",
                                       uiOutput("click_results_ui")
                                   )
                               )
                           )
                  ),
                  
                  # --- TAB 5: PROFILE ---
                  tabPanel("Profile", icon = icon("floppy-disk"),
                           div(style="padding-top: 10px;",
                               div(style="background: #eef; padding: 10px; border-radius: 5px; border: 1px solid #ccd;",
                                   h5("Save / Load", style="margin-top: 0; font-weight: bold;"),
                                   p(style="font-size: 0.8em; color: #555;", "Save your progress to a file, or upload an eBird Life List (.csv)."),
                                   
                                   downloadButton("download_list", "Save to File (.rds)", class="btn-primary btn-sm", style="width: 100%; margin-bottom: 10px;"),
                                   fileInput("upload_list", label=NULL, buttonLabel = "Upload...", placeholder = "No file selected", accept = c(".rds", ".csv"), width="100%")
                               )
                           )
                  )
      ) # End tabsetPanel
    ) # End conditionalPanel
  ) # End absolutePanel
) # End bootstrapPage

# ==============================================================================
# 3. SERVER LOGIC
# ==============================================================================
server <- function(input, output, session) {
  
  if (!is.null(loading_error)) {
    showNotification(paste("Critical Error:", loading_error), type = "error", duration = NULL)
  }
  
  # --- Initialization ---
  
  # Set slider to current calendar week on startup
  observe({
    current_week <- as.numeric(format(Sys.Date(), "%V"))
    current_week <- max(1, min(52, current_week))
    updateSliderInput(session, "week_select", value = current_week)
  })
  
  user_data <- reactiveValues(seen_codes = character(0))
  ui_initialized <- reactiveVal(FALSE)
  
  # Populate species selector
  observe({
    labels <- paste0(species_meta$comName, " (", species_meta$sciName, ")")
    choices_list <- setNames(species_meta$speciesCode, labels)
    updateSelectizeInput(session, "range_species", choices = c("None" = "", choices_list), server = TRUE)
  })
  
  # --- Helper Functions ---
  
  get_regional_species <- function(reg_input) {
    if(is.null(reg_input) || reg_input == "All Regions") {
      return(species_meta$speciesCode)
    } else {
      codes <- spec_region_map %>% filter(region == reg_input) %>% pull(speciesCode)
      return(codes)
    }
  }
  
  # Zoom map to polygon when region changes
  observeEvent(input$region_select, {
    reg <- input$region_select
    req(reg)
    
    if(reg != "All Regions") {
      # Use first column to match region name
      poly <- region_polys[region_polys[[1]] == reg, ]
      
      if(nrow(poly) > 0) {
        bbox <- sf::st_bbox(poly)
        # FIX: Use numeric indices for bbox to avoid name issues
        leafletProxy("map") %>% 
          fitBounds(lng1 = as.numeric(bbox[1]), 
                    lat1 = as.numeric(bbox[2]), 
                    lng2 = as.numeric(bbox[3]), 
                    lat2 = as.numeric(bbox[4]))
      }
    } else {
      leafletProxy("map") %>% setView(-96, 38, 3)
    }
  })
  
  # Debounce Region for Heavy Calculations
  region_debounced <- reactive(input$region_select) %>% debounce(1000)
  
  update_all_checkboxes <- function(codes) {
    curr_fam_filter <- input$family_filter
    if(is.null(curr_fam_filter)) curr_fam_filter <- "All Families"
    target_fams <- if(curr_fam_filter == "All Families") unique_families else curr_fam_filter
    
    valid_regional_codes <- get_regional_species(input$region_select)
    
    for(fam in target_fams) {
      safe_fam <- gsub("[^a-zA-Z0-9]", "", fam)
      fam_id <- paste0("chk_fam_", safe_fam)
      fam_codes_all <- species_meta %>% filter(familyComName == fam) %>% pull(speciesCode) %>% as.character()
      fam_codes_region <- intersect(fam_codes_all, valid_regional_codes)
      selected_in_fam <- intersect(as.character(codes), fam_codes_region)
      updateCheckboxGroupInput(session, fam_id, choices = setNames(fam_codes_region, species_meta$comName[match(fam_codes_region, species_meta$speciesCode)]), selected = selected_in_fam)
    }
    
    if (!is.null(input$heatmap_filter) && input$heatmap_filter != "All Families") {
      map_fam <- input$heatmap_filter
      fam_codes_map <- species_meta %>% filter(familyComName == map_fam) %>% pull(speciesCode) %>% as.character()
      selected_map <- intersect(as.character(codes), fam_codes_map)
      updateCheckboxGroupInput(session, "chk_map_context", selected = selected_map)
    }
  }
  
  # --- Observers: Global Buttons ---
  observeEvent(input$global_select_all, {
    valid_regional <- get_regional_species(input$region_select)
    if (input$family_filter != "All Families") {
      fam <- input$family_filter
      fam_codes <- species_meta %>% filter(familyComName == fam) %>% pull(speciesCode)
      to_add <- intersect(fam_codes, valid_regional)
      user_data$seen_codes <- unique(c(user_data$seen_codes, to_add))
    } else {
      user_data$seen_codes <- unique(c(user_data$seen_codes, valid_regional))
    }
    update_all_checkboxes(user_data$seen_codes)
  })
  
  observeEvent(input$global_select_none, {
    valid_regional <- get_regional_species(input$region_select)
    if (input$family_filter != "All Families") {
      fam <- input$family_filter
      fam_codes <- species_meta %>% filter(familyComName == fam) %>% pull(speciesCode)
      to_remove <- intersect(fam_codes, valid_regional)
      user_data$seen_codes <- setdiff(user_data$seen_codes, to_remove)
    } else {
      user_data$seen_codes <- setdiff(user_data$seen_codes, valid_regional)
    }
    update_all_checkboxes(user_data$seen_codes)
  })
  
  # --- Observers: Family Buttons ---
  lapply(unique_families, function(fam) {
    safe_fam <- gsub("[^a-zA-Z0-9]", "", fam)
    btn_all_id <- paste0("btn_all_", safe_fam)
    btn_none_id <- paste0("btn_none_", safe_fam)
    chk_id <- paste0("chk_fam_", safe_fam)
    
    observeEvent(input[[btn_all_id]], {
      fam_codes <- species_meta %>% filter(familyComName == fam) %>% pull(speciesCode) %>% as.character()
      valid_regional <- get_regional_species(input$region_select)
      to_add <- intersect(fam_codes, valid_regional)
      user_data$seen_codes <- unique(c(user_data$seen_codes, to_add))
      updateCheckboxGroupInput(session, chk_id, selected = to_add)
    })
    observeEvent(input[[btn_none_id]], {
      fam_codes <- species_meta %>% filter(familyComName == fam) %>% pull(speciesCode) %>% as.character()
      valid_regional <- get_regional_species(input$region_select)
      to_remove <- intersect(fam_codes, valid_regional)
      user_data$seen_codes <- setdiff(user_data$seen_codes, to_remove)
      updateCheckboxGroupInput(session, chk_id, selected = character(0))
    })
  })
  
  # --- EVENT: Download Handler ---
  output$download_list <- downloadHandler(
    filename = function() { paste("lifer_list_", Sys.Date(), ".rds", sep = "") },
    content = function(file) { saveRDS(user_data$seen_codes, file) }
  )
  
  # --- EVENT: Upload Handler ---
  observeEvent(input$upload_list, {
    req(input$upload_list)
    file_path <- input$upload_list$datapath
    ext <- tools::file_ext(input$upload_list$name)
    tryCatch({
      if (tolower(ext) == "csv") {
        df <- read.csv(file_path, stringsAsFactors = FALSE)
        clean_cols <- tolower(gsub("[^a-zA-Z0-9]", "", names(df)))
        sci_col_idx <- which(clean_cols %in% c("scientificname", "sciname", "scientific"))
        if (length(sci_col_idx) > 0) {
          uploaded_names <- df[[sci_col_idx[1]]]
          if (!"sciName" %in% names(species_meta)) { showNotification("Metadata mismatch: sciName missing.", type="error"); return() }
          matched_codes <- species_meta %>% filter(sciName %in% uploaded_names) %>% pull(speciesCode) %>% as.character()
          user_data$seen_codes <- unique(matched_codes)
          update_all_checkboxes(user_data$seen_codes)
          showNotification(paste("Imported", length(unique(matched_codes)), "species."), type = "message")
        } else { showNotification("Could not find 'Scientific Name' column.", type = "error") }
      } else {
        uploaded_data <- readRDS(file_path)
        if (is.character(uploaded_data)) {
          user_data$seen_codes <- uploaded_data
          update_all_checkboxes(uploaded_data)
          showNotification("Profile Loaded Successfully!", type = "message")
        } else { showNotification("Invalid RDS format.", type = "error") }
      }
    }, error = function(e) { showNotification(paste("Error:", e$message), type = "error") })
  })
  
  # --- UI Logic ---
  show_panel <- reactiveVal(TRUE)
  observeEvent(input$toggle_panel, { show_panel(!show_panel()); updateActionButton(session, "toggle_panel", label = if(show_panel()) "-" else "+") })
  output$is_panel_open <- reactive({ show_panel() })
  outputOptions(output, "is_panel_open", suspendWhenHidden = FALSE)
  
  # --- Dynamic Checklist Rendering ---
  output$checklist_ui <- renderUI({
    curr_filter <- input$family_filter
    if (!is.null(curr_filter) && curr_filter != "All Families") { fams_to_show <- curr_filter; start_open <- TRUE } else { fams_to_show <- unique_families; start_open <- FALSE }
    if(length(fams_to_show) == 0) return(div(style="padding:10px; color:#777;", "No families found."))
    
    ui_elements <- lapply(fams_to_show, function(fam) {
      safe_fam <- gsub("[^a-zA-Z0-9]", "", fam)
      fam_id <- paste0("chk_fam_", safe_fam)
      btn_all_id <- paste0("btn_all_", safe_fam)
      btn_none_id <- paste0("btn_none_", safe_fam)
      fam_species <- species_meta %>% filter(familyComName == fam)
      choices_vec <- setNames(fam_species$speciesCode, fam_species$comName)
      selected_vec <- intersect(isolate(user_data$seen_codes), fam_species$speciesCode)
      tags$details(open = start_open,
                   tags$summary(div(style="display:flex; justify-content:space-between; width:100%; align-items:center;",
                                    span(fam), span(class="fam-controls", actionLink(paste0("btn_all_", safe_fam), "All", onclick="event.stopPropagation();"), "|", actionLink(paste0("btn_none_", safe_fam), "None", onclick="event.stopPropagation();")))),
                   div(style="padding-left: 10px;", checkboxGroupInput(paste0("chk_fam_", safe_fam), label = NULL, choices = choices_vec, selected = selected_vec))
      )
    })
    do.call(tagList, ui_elements)
  })
  
  output$map_context_checklist_ui <- renderUI({
    fam <- input$heatmap_filter
    if (is.null(fam) || fam == "All Families") return(NULL)
    fam_species <- species_meta %>% filter(familyComName == fam)
    choices_vec <- setNames(fam_species$speciesCode, fam_species$comName)
    selected_vec <- intersect(isolate(user_data$seen_codes), fam_species$speciesCode)
    div(class="context-list-box",
        div(style="font-weight: bold; margin-bottom: 5px; color: #2c3e50;", paste(fam, "Checklist")),
        div(style="max-height: 200px; overflow-y: auto;",
            checkboxGroupInput("chk_map_context", label = NULL, choices = choices_vec, selected = selected_vec)))
  })
  
  map_context_trigger <- reactive({ input$chk_map_context })
  map_context_debounced <- map_context_trigger %>% debounce(2000)
  
  observe({
    req(input$main_tabs == "Map")
    fam <- input$heatmap_filter
    if (is.null(fam) || fam == "All Families") return()
    new_checked_fam <- map_context_debounced()
    if (is.null(new_checked_fam)) new_checked_fam <- character(0)
    fam_codes_all <- species_meta %>% filter(familyComName == fam) %>% pull(speciesCode) %>% as.character()
    current_fam_checked <- intersect(user_data$seen_codes, fam_codes_all)
    if (setequal(new_checked_fam, current_fam_checked)) return()
    other_codes <- setdiff(user_data$seen_codes, fam_codes_all)
    user_data$seen_codes <- unique(c(other_codes, new_checked_fam))
    safe_fam <- gsub("[^a-zA-Z0-9]", "", fam)
    updateCheckboxGroupInput(session, paste0("chk_fam_", safe_fam), selected = new_checked_fam)
  })
  
  checklist_state_trigger <- reactive({
    input_ids <- paste0("chk_fam_", gsub("[^a-zA-Z0-9]", "", unique_families))
    lapply(input_ids, function(x) input[[x]])
  })
  checklist_state_debounced <- checklist_state_trigger %>% debounce(2000)
  
  observe({
    req(input$main_tabs == "My List")
    raw_inputs <- checklist_state_debounced()
    if (!ui_initialized()) { if (any(!sapply(raw_inputs, is.null)) || length(user_data$seen_codes) == 0) ui_initialized(TRUE) }
    if (ui_initialized()) {
      current_vals <- unlist(raw_inputs)
      if (is.null(current_vals)) current_vals <- character(0)
      
      valid_regional <- get_regional_species(input$region_select)
      hidden_codes <- setdiff(species_meta$speciesCode, valid_regional)
      preserved_hidden <- intersect(user_data$seen_codes, hidden_codes)
      final_codes <- unique(c(current_vals, preserved_hidden))
      
      if (!setequal(final_codes, user_data$seen_codes)) {
        user_data$seen_codes <- final_codes
        if (!is.null(input$heatmap_filter) && input$heatmap_filter != "All Families") {
          fam <- input$heatmap_filter
          fam_codes_all <- species_meta %>% filter(familyComName == fam) %>% pull(speciesCode) %>% as.character()
          selected_map <- intersect(current_vals, fam_codes_all)
          updateCheckboxGroupInput(session, "chk_map_context", selected = selected_map)
        }
      }
    }
  })
  
  output$list_count_msg <- renderText({ paste(length(user_data$seen_codes), "species seen out of", nrow(species_meta), "available") })
  output$date_label <- renderText({ paste("Approximate Center Date:", get_date_label(input$week_select)) })
  
  week_debounced <- reactive(input$week_select) %>% debounce(2000)
  opacity_debounced <- reactive(input$opacity_select) %>% debounce(2000)
  lifer_count_debounced <- reactive(input$lifer_count_filter) %>% debounce(2000)
  invasion_debounced <- reactive(input$filter_invasion) %>% debounce(2000)
  conserv_debounced <- reactive(input$filter_conserv) %>% debounce(2000)
  region_debounced <- reactive(input$region_select) %>% debounce(1000)
  
  current_week_data <- reactive({
    req(week_debounced())
    week_file <- sprintf("app_data/weeks/week_%02d.rds", week_debounced())
    if (!file.exists(week_file)) return(NULL)
    readRDS(week_file)
  })
  
  output$map <- renderLeaflet({ leaflet(options = leafletOptions(worldCopyJump = FALSE, minZoom = 2)) %>% addProviderTiles(providers$CartoDB.Positron) %>% setView(-96, 38, 3) })
  
  observe({
    week_data <- current_week_data()
    if(is.null(week_data)) return()
    
    map_filter_fam <- input$heatmap_filter
    if (!is.null(map_filter_fam) && map_filter_fam != "All Families") {
      allowed_ids <- species_meta %>% filter(familyComName == map_filter_fam) %>% pull(species_id)
      filtered_week_data <- week_data %>% filter(species_id %in% allowed_ids)
    } else { filtered_week_data <- week_data }
    
    sel_inv <- invasion_debounced(); if (is.null(sel_inv)) sel_inv <- character(0)
    inv_ids <- species_meta %>% filter(invasionStatus %in% sel_inv) %>% pull(species_id)
    filtered_week_data <- filtered_week_data %>% filter(species_id %in% inv_ids)
    
    sel_con <- conserv_debounced(); if (is.null(sel_con)) sel_con <- character(0)
    con_ids <- species_meta %>% filter(conservStatus %in% sel_con) %>% pull(species_id)
    filtered_week_data <- filtered_week_data %>% filter(species_id %in% con_ids)
    
    seen_ids <- species_meta$species_id[species_meta$speciesCode %in% user_data$seen_codes]
    
    if (!is.null(input$range_species) && input$range_species != "") {
      spec_id <- species_meta$species_id[species_meta$speciesCode == input$range_species]
      if(length(spec_id) > 0) {
        range_cells <- week_data %>% filter(species_id == spec_id) %>% pull(cell_id)
        filtered_week_data <- filtered_week_data %>% filter(cell_id %in% range_cells)
      }
    }
    
    reg <- region_debounced()
    if(!is.null(reg) && reg != "All Regions") {
      valid_reg_codes <- get_regional_species(reg)
      reg_spec_ids <- species_meta$species_id[species_meta$speciesCode %in% valid_reg_codes]
      filtered_week_data <- filtered_week_data %>% filter(species_id %in% reg_spec_ids)
    }
    
    heatmap_counts <- filtered_week_data %>%
      filter(!species_id %in% seen_ids) %>%
      group_by(cell_id) %>% 
      summarise(count = n(), .groups = "drop") %>%
      filter(count >= lifer_count_debounced()[1], count <= lifer_count_debounced()[2])
    
    leafletProxy("map") %>% clearGroup("Heatmap") %>% clearGroup("RangeOverlay") %>% clearControls()
    
    if(nrow(heatmap_counts) > 0) {
      r_display <- grid_template
      values(r_display) <- NA 
      r_display[heatmap_counts$cell_id] <- heatmap_counts$count
      
      if(!is.null(reg) && reg != "All Regions") {
        poly <- region_polys[region_polys[[1]] == reg, ]
        poly_3857 <- st_transform(poly, 3857)
        r_display <- terra::mask(r_display, vect(poly_3857))
      }
      
      r_trimmed <- terra::trim(r_display)
      r_sqrt <- sqrt(r_trimmed)
      max_val <- max(heatmap_counts$count, na.rm=TRUE)
      pal <- colorNumeric(palette = viridisLite::turbo(256), domain = c(1, sqrt(max_val)), na.color = "transparent")
      
      leafletProxy("map") %>%
        addRasterImage(r_sqrt, colors = pal, opacity = opacity_debounced(), group = "Heatmap", project = FALSE, method = "ngb", maxBytes = 8 * 1024 * 1024) %>% 
        addLegend(pal = pal, values = c(1, sqrt(max_val)), title = "Lifer Count", position = "bottomright", opacity = 1.0, labFormat = labelFormat(transform = function(x) x^2, digits = 0)) 
    }
    gc() 
  })
  
  observeEvent(input$map_click, {
    click <- input$map_click
    updateTabsetPanel(session, "main_tabs", selected = "Targets")
    pt_coords <- st_coordinates(st_sfc(st_point(c(click$lng, click$lat)), crs = 4326) %>% st_transform(3857))
    cell_idx <- terra::cellFromXY(grid_template, pt_coords)
    
    if (!is.na(cell_idx)) {
      cell_val <- grid_template[cell_idx][1,1]
      if (!is.na(cell_val)) {
        week_data <- current_week_data()
        
        map_filter_fam <- input$heatmap_filter
        if (!is.null(map_filter_fam) && map_filter_fam != "All Families") {
          allowed_ids <- species_meta %>% filter(familyComName == map_filter_fam) %>% pull(species_id)
          week_data <- week_data %>% filter(species_id %in% allowed_ids)
        }
        
        sel_inv <- invasion_debounced(); if (is.null(sel_inv)) sel_inv <- character(0)
        inv_ids <- species_meta %>% filter(invasionStatus %in% sel_inv) %>% pull(species_id)
        week_data <- week_data %>% filter(species_id %in% inv_ids)
        
        sel_con <- conserv_debounced(); if (is.null(sel_con)) sel_con <- character(0)
        con_ids <- species_meta %>% filter(conservStatus %in% sel_con) %>% pull(species_id)
        week_data <- week_data %>% filter(species_id %in% con_ids)
        
        reg <- region_debounced()
        if(!is.null(reg) && reg != "All Regions") {
          valid_reg_codes <- get_regional_species(reg)
          reg_spec_ids <- species_meta$species_id[species_meta$speciesCode %in% valid_reg_codes]
          week_data <- week_data %>% filter(species_id %in% reg_spec_ids)
        }
        
        if (!is.null(input$range_species) && input$range_species != "") {
          spec_id <- species_meta$species_id[species_meta$speciesCode == input$range_species]
          if(length(spec_id) > 0) {
            full_week_data <- readRDS(sprintf("app_data/weeks/week_%02d.rds", week_debounced()))
            range_cells <- full_week_data %>% filter(species_id == spec_id) %>% pull(cell_id)
            if (!(cell_val %in% range_cells)) {
              output$click_results_ui <- renderUI({ div(style="padding: 15px; color: #777; font-style: italic;", "Outside spotlight range.") })
              return()
            }
          }
        }
        
        ids_in_cell <- week_data %>% filter(cell_id == cell_val) %>%
          filter(!species_id %in% species_meta$species_id[species_meta$speciesCode %in% user_data$seen_codes]) %>% pull(species_id)
        
        if(length(ids_in_cell) > 0) {
          names_vec <- species_meta %>% filter(species_id %in% ids_in_cell) %>% pull(comName)
          output$click_results_ui <- renderUI({
            tagList(div(style="font-weight: bold; padding: 5px; border-bottom: 1px solid #eee; background-color: #f8f9fa;", paste(length(names_vec), "Species Found")),
                    tags$ul(style="list-style-type: none; padding: 0; margin: 0;", lapply(names_vec, function(n) { tags$li(style="padding: 5px 8px; border-bottom: 1px solid #f0f0f0; font-size: 0.9em;", n) }))
            )
          })
        } else { output$click_results_ui <- renderUI({ div(style="padding: 15px; color: #777; text-align: center; font-style: italic;", "No new lifers here.") }) }
      } else { output$click_results_ui <- renderUI({ div(style="padding: 15px; color: #777; text-align: center; font-style: italic;", "No data (Masked/Ocean)") }) }
    }
  })
}

shinyApp(ui, server)