# Functional Test Evaluation: Find-A-Lifer

**Role:** Senior Functional Tester
**Date:** 2026-03-13
**Scope:** Search, filtering, species lists, life list management, goal lists, trip planning, progress tracking, state management

---

## 1. Existing Test Coverage Analysis

### 1.1 Unit Tests (Vitest + React Testing Library)

| File | What It Tests | Coverage Quality |
|------|--------------|-----------------|
| `TopBar.test.tsx` | Title rendering, dark mode toggle, server status indicator | Adequate for a simple component |
| `ExploreTab.test.tsx` | Region selector, view mode buttons, week slider, opacity slider, animation button, lifer range filter visibility | Good breadth, covers conditional rendering |
| `Skeleton.test.tsx` | Skeleton placeholder components render correctly | Adequate |

**Total unit test files:** 3
**Components with zero unit test coverage:** SpeciesTab, GoalBirdsTab, TripPlanTab, ProgressTab, ProfileTab, MapView, SidePanel, SpeciesInfoCard, LifeListContext, goalListsDB

### 1.2 E2E Tests (Playwright)

File: `frontend/e2e/app.spec.ts` -- 11 tests covering:
- App loads, side panel visible, default Explore tab
- View mode switching, tab switching (Species, Stats, Profile)
- Dark mode toggle, week slider, region selector options
- Animation play/pause, side panel collapse/expand

**E2E coverage gaps:** No tests for species search, life list CRUD, goal list management, trip planning, CSV import/export, species info cards, or any data-dependent flows.

### 1.3 Overall Coverage Assessment

**Coverage Score: ~15%** of core user flows are tested. The existing tests verify basic rendering and UI interactions but do not test any business logic, data flows, or state management. The most critical features -- life list management, goal lists, search, and filtering -- have zero automated test coverage.

---

## 2. Test Cases: Species Search & Filtering

### TC-SEARCH-001: Species search by common name
- **Priority:** P0 (Critical)
- **Component:** `SpeciesTab.tsx` (lines 190-200, 366-375)
- **Steps:**
  1. Navigate to Species tab
  2. Type "Cardinal" in the search input (`data-testid="species-search-input"`)
  3. Observe autocomplete suggestions (`data-testid="autocomplete-suggestions"`)
- **Expected:** Autocomplete dropdown shows species with "Cardinal" in common name (e.g., Northern Cardinal). Suggestions limited to 10 items. Main list also filters to matching species.
- **Edge Cases:** Empty string clears filter; single character shows matches; special characters don't crash

### TC-SEARCH-002: Species search by scientific name
- **Priority:** P1
- **Component:** `SpeciesTab.tsx` (lines 193-197)
- **Steps:**
  1. Navigate to Species tab
  2. Type "Cardinalis" in search input
- **Expected:** Species with "Cardinalis" in sciName appear in both autocomplete and filtered list

### TC-SEARCH-003: Autocomplete suggestion selection scrolls to species
- **Priority:** P1
- **Component:** `SpeciesTab.tsx` (lines 203-227)
- **Steps:**
  1. Search for a species in a collapsed family
  2. Click suggestion from autocomplete dropdown
- **Expected:** Search clears, family expands if collapsed, species item scrolls into view with yellow highlight that auto-clears after 3 seconds

### TC-SEARCH-004: Close autocomplete on outside click
- **Priority:** P2
- **Component:** `SpeciesTab.tsx` (lines 237-251)
- **Steps:**
  1. Type search term to show suggestions
  2. Click outside the search input and suggestions dropdown
- **Expected:** Suggestions dropdown closes

### TC-SEARCH-005: Species Range search in ExploreTab
- **Priority:** P1
- **Component:** `ExploreTab.tsx` (lines 54-70, 250-257)
- **Steps:**
  1. Switch to "Range" view mode
  2. Type species name in search input (`data-testid="species-range-search"`)
- **Expected:** Species list filters by common name and scientific name. When goalBirdsOnlyFilter is active, list is pre-filtered to goal species before text search applies.

### TC-SEARCH-006: Species Range search with Goal Birds Only filter
- **Priority:** P1
- **Component:** `ExploreTab.tsx` (lines 57-59)
- **Steps:**
  1. Switch to Range view, activate Goal Birds Only toggle
  2. Set up a goal list with known species
  3. Search for a species NOT in the goal list
- **Expected:** No results shown. Only goal list species are searchable when filter is active.

---

## 3. Test Cases: Filtering

### TC-FILTER-001: Family filter
- **Priority:** P0
- **Component:** `SpeciesTab.tsx` (lines 254-258, 401-414)
- **Steps:**
  1. Navigate to Species tab, wait for data to load
  2. Select a family from the family dropdown (`data-testid="family-filter"`)
- **Expected:** Only species from selected family are displayed. Filtered count updates in header. Family dropdown shows count per family.

### TC-FILTER-002: Conservation status filter
- **Priority:** P1
- **Component:** `SpeciesTab.tsx` (lines 268-269, 415-431)
- **Steps:**
  1. Select "Endangered" from conservation filter (`data-testid="conservation-filter"`)
- **Expected:** Only species with conservStatus === "Endangered" are shown

### TC-FILTER-003: Invasion status filter
- **Priority:** P1
- **Component:** `SpeciesTab.tsx` (lines 271-272, 432-443)
- **Steps:**
  1. Select "Introduced" from invasion filter (`data-testid="invasion-filter"`)
- **Expected:** Only introduced species shown

### TC-FILTER-004: Difficulty filter
- **Priority:** P1
- **Component:** `SpeciesTab.tsx` (lines 274-275, 444-456)
- **Steps:**
  1. Select "Hard" from difficulty filter (`data-testid="difficulty-filter"`)
- **Expected:** Only species with difficultyLabel === "Hard" shown

### TC-FILTER-005: Combined filters (AND logic)
- **Priority:** P0
- **Component:** `SpeciesTab.tsx` (lines 260-281)
- **Steps:**
  1. Select Family "Hawks, Eagles, and Kites", Conservation "Least Concern", Difficulty "Moderate"
  2. Also type a search term
- **Expected:** All four filters apply simultaneously (AND logic). Only species matching ALL criteria appear.

### TC-FILTER-006: Clear all filters
- **Priority:** P1
- **Component:** `SpeciesTab.tsx` (lines 320-327, 336-345)
- **Steps:**
  1. Set multiple filters
  2. Click "Clear Filters" button (`data-testid="clear-filters-btn"`)
- **Expected:** All four filter dropdowns reset to default ("All"). Badge showing active filter count disappears. Full species list shown again.

### TC-FILTER-007: Region filtering
- **Priority:** P1
- **Component:** `SpeciesTab.tsx` (lines 104-144)
- **Steps:**
  1. Select "US Northeast" region in ExploreTab
  2. Switch to Species tab
- **Expected:** Species list filtered to species present in that region. Region indicator banner (`data-testid="region-filter-indicator"`) shows "Filtered to US Northeast". Species count updates.

### TC-FILTER-008: Region filter clears when "All Regions" selected
- **Priority:** P2
- **Component:** `SpeciesTab.tsx` (lines 106-111)
- **Steps:**
  1. Select a region, verify filtering
  2. Change region back to "All Regions"
- **Expected:** regionSpeciesCodes set to null, all species shown again, region indicator disappears

### TC-FILTER-009: Lifer range filter in density mode
- **Priority:** P1
- **Component:** `ExploreTab.tsx` (lines 395-449)
- **Steps:**
  1. Ensure density view mode with dataRange > 0
  2. Adjust min slider (`data-testid="lifer-range-min-slider"`) upward
  3. Adjust max slider (`data-testid="lifer-range-max-slider"`) downward
- **Expected:** liferCountRange updates. Min cannot exceed max. "Reset range" button (`data-testid="reset-lifer-range"`) appears when range differs from dataRange.

### TC-FILTER-010: Lifer range hidden when goalBirdsOnly active
- **Priority:** P2
- **Component:** `ExploreTab.tsx` (line 395)
- **Steps:**
  1. In density mode, activate Goal Birds Only
- **Expected:** Lifer Range section is not rendered (already covered by existing test `ExploreTab.test.tsx` line 69-72)

---

## 4. Test Cases: Life List CRUD

### TC-LIFE-001: Mark species as seen (toggle on)
- **Priority:** P0
- **Component:** `LifeListContext.tsx` (lines 101-117), `SpeciesTab.tsx` (line 574)
- **Steps:**
  1. Navigate to Species tab
  2. Click checkbox next to an unseen species
- **Expected:** Checkbox becomes checked. Species added to IndexedDB `lifeList` store with source="manual". seenSpecies Set updated. Total count increments.

### TC-LIFE-002: Mark species as unseen (toggle off)
- **Priority:** P0
- **Component:** `LifeListContext.tsx` (lines 119-133)
- **Steps:**
  1. Check a species checkbox (mark as seen)
  2. Uncheck the same checkbox
- **Expected:** Species removed from IndexedDB. seenSpecies Set updated. Total count decrements.

### TC-LIFE-003: Bulk select all species in a family
- **Priority:** P1
- **Component:** `SpeciesTab.tsx` (lines 532-535)
- **Steps:**
  1. Click "All" button on a family header (`data-testid="family-select-all-{familyName}"`)
- **Expected:** All species in that family marked as seen. Checkbox states update immediately.

### TC-LIFE-004: Bulk deselect all species in a family
- **Priority:** P1
- **Component:** `SpeciesTab.tsx` (lines 541-544)
- **Steps:**
  1. Mark several species in a family as seen
  2. Click "None" on the family header (`data-testid="family-select-none-{familyName}"`)
- **Expected:** All species in that family marked as unseen

### TC-LIFE-005: Global select all (filtered)
- **Priority:** P1
- **Component:** `SpeciesTab.tsx` (lines 463-467)
- **Steps:**
  1. Apply a filter (e.g., family filter)
  2. Click global "All" button (`data-testid="global-select-all"`)
- **Expected:** Only the currently filtered species are marked as seen, not all 2,490 species

### TC-LIFE-006: Global select none (filtered)
- **Priority:** P1
- **Component:** `SpeciesTab.tsx` (lines 475-478)
- **Steps:**
  1. Mark several species as seen
  2. Apply a filter that includes those species
  3. Click global "None" (`data-testid="global-select-none"`)
- **Expected:** Only filtered species are unmarked. Species outside the filter remain unchanged.

### TC-LIFE-007: Life list persists across page reload
- **Priority:** P0
- **Component:** `LifeListContext.tsx` (lines 79-95)
- **Steps:**
  1. Mark 3 species as seen
  2. Reload the page
  3. Navigate to Species tab
- **Expected:** Same 3 species still checked. IndexedDB data survives reload.

### TC-LIFE-008: Clear all species
- **Priority:** P1
- **Component:** `ProfileTab.tsx` (lines 164-173), `LifeListContext.tsx` (lines 143-153)
- **Steps:**
  1. Mark several species as seen
  2. Go to Profile tab, click "Clear All Species" (`data-testid="clear-all-button"`)
  3. Confirm the browser confirm dialog
- **Expected:** All species removed from IndexedDB. seenSpecies becomes empty Set. Total count = 0. Cancel on confirm dialog does nothing.

### TC-LIFE-009: CSV import with valid eBird file
- **Priority:** P0
- **Component:** `ProfileTab.tsx` (lines 17-126)
- **Steps:**
  1. Go to Profile tab
  2. Click "Import CSV" (`data-testid="import-csv-button"`)
  3. Select a valid CSV with "Common Name" column header
- **Expected:** Species matched against API data by common name (case-insensitive). Import result shows matched/unmatched/new/existing counts (`data-testid="import-success"`, `data-testid="import-merge-stats"`). Importing flag shows progress indicator.

### TC-LIFE-010: CSV import with scientific name fallback
- **Priority:** P1
- **Component:** `ProfileTab.tsx` (lines 85-93)
- **Steps:**
  1. Import CSV with only "Scientific Name" column (no "Common Name")
- **Expected:** Species matched by scientific name. Matched count reflects successful scientific name lookups.

### TC-LIFE-011: CSV import with invalid file (no name columns)
- **Priority:** P1
- **Component:** `ProfileTab.tsx` (lines 35-37)
- **Steps:**
  1. Import a CSV without "Common Name" or "Scientific Name" columns
- **Expected:** Error message displayed (`data-testid="import-error"`): 'CSV file must contain either "Common Name" or "Scientific Name" column'

### TC-LIFE-012: CSV import merge behavior (idempotent)
- **Priority:** P1
- **Component:** `ProfileTab.tsx` (lines 100-107), `LifeListContext.tsx` (lines 155-197)
- **Steps:**
  1. Mark species A and B as seen manually
  2. Import CSV containing species B and C
- **Expected:** Result shows: 1 new (C), 1 already existed (B). Species A remains. Total = 3.

### TC-LIFE-013: CSV export
- **Priority:** P1
- **Component:** `ProfileTab.tsx` (lines 128-162)
- **Steps:**
  1. Mark several species as seen
  2. Click "Export Life List as CSV" (`data-testid="export-csv-button"`)
- **Expected:** Downloads file "life-list-export.csv" with header "Common Name,Scientific Name,Species Code,Family". Only seen species included. Fields with commas properly quoted.

### TC-LIFE-014: Export button hidden when no species seen
- **Priority:** P2
- **Component:** `ProfileTab.tsx` (lines 249-258)
- **Steps:**
  1. Clear all species, go to Profile tab
- **Expected:** Export button not rendered (conditional on getTotalSeen() > 0)

---

## 5. Test Cases: Goal List Management

### TC-GOAL-001: Create a new goal list
- **Priority:** P0
- **Component:** `GoalBirdsTab.tsx` (lines 284-321)
- **Steps:**
  1. Navigate to Goals tab
  2. Click "+ New List"
  3. Enter list name, confirm creation
- **Expected:** New list created in IndexedDB with UUID, empty speciesCodes array, timestamps. List appears in selector. Becomes active list.

### TC-GOAL-002: Create goal list with empty name
- **Priority:** P1
- **Component:** `GoalBirdsTab.tsx` (lines 285-288)
- **Steps:**
  1. Click "+ New List", leave name blank, click create
- **Expected:** Error message "Please enter a list name" shown. No list created.

### TC-GOAL-003: Create goal list with duplicate name
- **Priority:** P1
- **Component:** `GoalBirdsTab.tsx` (lines 291-298)
- **Steps:**
  1. Create list "My Goals"
  2. Try creating another list "my goals" (case-insensitive match)
- **Expected:** Error message 'A list named "My Goals" already exists'. No duplicate created.

### TC-GOAL-004: Rename a goal list
- **Priority:** P1
- **Component:** `GoalBirdsTab.tsx` (lines 324-358)
- **Steps:**
  1. Click rename button (`data-testid="rename-list-btn"`)
  2. Enter new name in inline input (`data-testid="rename-input"`)
  3. Click Save (`data-testid="rename-save-btn"`)
- **Expected:** List name updated in IndexedDB and UI. updatedAt timestamp refreshed. Escape key cancels rename.

### TC-GOAL-005: Delete a goal list
- **Priority:** P0
- **Component:** `GoalBirdsTab.tsx` (lines 360-398)
- **Steps:**
  1. Create two lists, delete the active one
- **Expected:** Confirmation dialog appears. On confirm: list removed from IndexedDB and state. Active list switches to first remaining list. If no lists remain, activeListId = null.

### TC-GOAL-006: Add species to goal list via search
- **Priority:** P0
- **Component:** `GoalBirdsTab.tsx` (lines 400-452, 482-492)
- **Steps:**
  1. Create a goal list, make it active
  2. Type species name in search box
  3. Click a suggestion
- **Expected:** Species code added to list's speciesCodes array in IndexedDB. Success toast shown. Search cleared. List count increments.

### TC-GOAL-007: Add duplicate species to goal list
- **Priority:** P1
- **Component:** `GoalBirdsTab.tsx` (lines 422-428)
- **Steps:**
  1. Add "Northern Cardinal" to a goal list
  2. Search and try adding "Northern Cardinal" again
- **Expected:** Duplicate toast message shown (e.g., "Northern Cardinal is already in My Goals"). Species not duplicated.

### TC-GOAL-008: Remove species from goal list
- **Priority:** P0
- **Component:** `GoalBirdsTab.tsx` (lines 454-480)
- **Steps:**
  1. Add species to list
  2. Click remove button on the species item
- **Expected:** Species code removed from list. IndexedDB updated. Success toast shown. List count decrements.

### TC-GOAL-009: Switch between multiple goal lists
- **Priority:** P1
- **Component:** `GoalBirdsTab.tsx` (lines 538-588)
- **Steps:**
  1. Create List A with species X,Y; List B with species Z
  2. Switch active list from A to B via selector (`data-testid="goal-list-selector"`)
- **Expected:** Display updates to show List B's species. activeListId saved to localStorage. List filter term resets.

### TC-GOAL-010: Add species from SpeciesTab to goal list
- **Priority:** P1
- **Component:** `SpeciesTab.tsx` (lines 158-187, 598-605)
- **Steps:**
  1. In Species tab, click "+" button (`data-testid="add-to-goal-{speciesCode}"`)
  2. Select a goal list from dialog
- **Expected:** Species added to selected list. Success toast appears. Goal lists state refreshed with updated counts.

### TC-GOAL-011: Goal list with multiple lists shows list picker
- **Priority:** P1
- **Component:** `GoalBirdsTab.tsx` (lines 400-411)
- **Steps:**
  1. Create 2+ goal lists
  2. Search and click a species to add
- **Expected:** List picker popup appears to select which list. Single list: species added directly without picker.

### TC-GOAL-012: Active goal list persists across reload
- **Priority:** P1
- **Component:** `GoalBirdsTab.tsx` (lines 237-266), `App.tsx` (lines 47-56)
- **Steps:**
  1. Create two lists, select the second one
  2. Reload page
- **Expected:** Previously active list restored from localStorage key `activeGoalListId`. If saved ID no longer exists, falls back to first list.

### TC-GOAL-013: Filter within current goal list
- **Priority:** P2
- **Component:** `GoalBirdsTab.tsx` (lines 497-511)
- **Steps:**
  1. Add 5+ species to a goal list
  2. Type filter term in the list filter input
- **Expected:** Only species matching the filter term (by comName, sciName, or code) are displayed

---

## 6. Test Cases: View Mode & Week Slider

### TC-VIEW-001: Switch view modes (density/species/goal-birds)
- **Priority:** P0
- **Component:** `ExploreTab.tsx` (lines 148-181), `App.tsx` (lines 100-106)
- **Steps:**
  1. Click "Range" button (`data-testid="view-mode-species"`)
  2. Click "Goals" button (`data-testid="view-mode-goal-birds"`)
  3. Click "Richness" button (`data-testid="view-mode-density"`)
- **Expected:** Each mode activates correctly. Switching away from species mode clears selectedSpecies. Switching to non-density/non-species mode resets goalBirdsOnlyFilter.

### TC-VIEW-002: Species picker appears only in Range mode
- **Priority:** P1
- **Component:** `ExploreTab.tsx` (lines 244-320)
- **Steps:**
  1. Switch to Range mode
- **Expected:** Species picker with search and list appears. Switching away hides it.

### TC-VIEW-003: Goal list selector appears in Goals mode
- **Priority:** P1
- **Component:** `ExploreTab.tsx` (lines 185-212)
- **Steps:**
  1. Switch to Goals mode
- **Expected:** Active Goal List dropdown shown. If no lists exist, warning message displayed.

### TC-VIEW-004: Goal Birds Only toggle appears in density and species modes only
- **Priority:** P1
- **Component:** `ExploreTab.tsx` (lines 215-241)
- **Steps:**
  1. In density mode: Goal Birds Only toggle visible
  2. In species mode: toggle visible
  3. In goal-birds mode: toggle not visible
- **Expected:** Toggle rendered conditionally based on viewMode

### TC-VIEW-005: Week slider range and label
- **Priority:** P0
- **Component:** `ExploreTab.tsx` (lines 76-84, 322-342)
- **Steps:**
  1. Move week slider to week 1
  2. Move to week 52
  3. Move to week 26
- **Expected:** Slider range 1-52. Label shows "Week N (~Mon DD)" with correct approximate date. Week 1 ~ Jan 4, Week 26 ~ Jun 29, Week 52 ~ Dec 28.

### TC-VIEW-006: Migration animation play/pause
- **Priority:** P1
- **Component:** `ExploreTab.tsx` (lines 92-117)
- **Steps:**
  1. Click "Animate Migration" (`data-testid="animation-play-button"`)
  2. Wait 3 seconds
  3. Click "Pause" (`data-testid="animation-pause-button"`)
- **Expected:** Week auto-advances every 1 second. Loops from 52 back to 1. Pause stops interval. Play button re-appears after pause.

### TC-VIEW-007: Opacity slider
- **Priority:** P2
- **Component:** `ExploreTab.tsx` (lines 371-392)
- **Steps:**
  1. Adjust opacity slider (`data-testid="opacity-slider"`)
- **Expected:** Value displayed as percentage. Callback receives value/100. Range 0-100.

---

## 7. Test Cases: Trip Plan Tab

### TC-TRIP-001: Auto-switch to Trip Plan on location select
- **Priority:** P1
- **Component:** `SidePanel.tsx` (lines 83-88)
- **Steps:**
  1. Click a grid cell on the map
- **Expected:** SidePanel auto-switches to Trip Plan tab (activeTab = 'trip')

### TC-TRIP-002: Hotspots mode loads top locations
- **Priority:** P1
- **Component:** `TripPlanTab.tsx`
- **Steps:**
  1. Navigate to Plan tab
  2. Ensure "Hotspots" mode is active
- **Expected:** Fetches weekly data, computes lifer counts per cell excluding seen species, displays ranked list of hotspot locations

### TC-TRIP-003: Location mode shows lifers at selected cell
- **Priority:** P1
- **Component:** `TripPlanTab.tsx`
- **Steps:**
  1. Click a map cell to select a location
  2. View Plan tab in Location mode
- **Expected:** Shows list of potential life birds at that cell for the date range, with probability and difficulty. Sortable by probability/name/family.

### TC-TRIP-004: Region filter affects hotspots
- **Priority:** P2
- **Component:** `TripPlanTab.tsx` (lines 7-13)
- **Steps:**
  1. Select a region (e.g., US Northeast)
  2. View hotspots
- **Expected:** Hotspots filtered to bounding box of selected region

---

## 8. Test Cases: Progress Tab

### TC-PROG-001: Overall progress calculation
- **Priority:** P0
- **Component:** `ProgressTab.tsx` (lines 33-36)
- **Steps:**
  1. Mark 100 species as seen (via import or manual)
  2. Navigate to Stats tab
- **Expected:** Progress shows "100 of {total} species seen". Percentage = (100/total)*100 formatted to 1 decimal. Progress bar width matches percentage.

### TC-PROG-002: Family breakdown
- **Priority:** P1
- **Component:** `ProgressTab.tsx` (lines 38-51)
- **Steps:**
  1. Mark species from various families as seen
  2. View Stats tab
- **Expected:** Each family shows seen/total count. Progress bars per family. Families sorted by total species count descending.

### TC-PROG-003: Quick stats accuracy
- **Priority:** P1
- **Component:** `ProgressTab.tsx` (lines 54-55)
- **Steps:**
  1. Mark all species in one family as seen, one species in another, zero in a third
- **Expected:** "Families Started" = 2. "Families Completed" = 1.

### TC-PROG-004: Milestones tracking
- **Priority:** P2
- **Component:** `ProgressTab.tsx` (lines 64-69)
- **Steps:**
  1. Mark 250 species as seen
- **Expected:** 100 milestone shows checkmark. 250 milestone shows checkmark. 500 milestone is "next" with progress bar showing 250/500.

### TC-PROG-005: Empty state message
- **Priority:** P2
- **Component:** `ProgressTab.tsx` (lines 231-237)
- **Steps:**
  1. Clear all species, navigate to Stats
- **Expected:** Amber info box with "Get started" message directing to Species tab or Profile import

### TC-PROG-006: Completion message
- **Priority:** P2
- **Component:** `ProgressTab.tsx` (lines 220-228)
- **Steps:**
  1. Mark all species as seen
- **Expected:** Green celebration box with "Congratulations!" message

---

## 9. Test Cases: State Management Edge Cases

### TC-STATE-001: Goal species codes update when active list changes
- **Priority:** P0
- **Component:** `App.tsx` (lines 68-81)
- **Steps:**
  1. Create List A with 5 species, List B with 3 species
  2. Switch active list from A to B
- **Expected:** goalSpeciesCodes Set updates to contain only List B's 3 species codes. Map view re-renders with new goal filter.

### TC-STATE-002: Goal species codes empty when no active list
- **Priority:** P1
- **Component:** `App.tsx` (lines 69-72)
- **Steps:**
  1. Delete all goal lists
- **Expected:** goalSpeciesCodes = empty Set. Goal-birds view shows empty state.

### TC-STATE-003: View mode reset clears related state
- **Priority:** P0
- **Component:** `App.tsx` (lines 100-106)
- **Steps:**
  1. In species mode, select a species
  2. Switch to density mode
  3. Switch back to species mode
- **Expected:** selectedSpecies is null after switching away. goalBirdsOnlyFilter resets when switching to non-density/non-species mode.

### TC-STATE-004: Dark mode persists across reload
- **Priority:** P1
- **Component:** `App.tsx` (lines 16-18, 35-38)
- **Steps:**
  1. Enable dark mode
  2. Reload page
- **Expected:** Dark mode restored from localStorage. `dark` class on `<html>` element.

### TC-STATE-005: Multiple tabs share life list state via context
- **Priority:** P1
- **Component:** `LifeListContext.tsx`
- **Steps:**
  1. Mark species as seen in Species tab
  2. Switch to Stats tab
- **Expected:** Stats tab reflects updated count immediately (shared via React context, no additional fetch needed)

### TC-STATE-006: IndexedDB loading gate
- **Priority:** P0
- **Component:** `LifeListContext.tsx` (lines 215-221)
- **Steps:**
  1. Load app (life list loads asynchronously)
- **Expected:** Loading spinner shown until IndexedDB read completes. Children not rendered until loading = false. Prevents flash of empty state.

### TC-STATE-007: useLifeList outside provider throws
- **Priority:** P2
- **Component:** `LifeListContext.tsx` (lines 230-236)
- **Steps:**
  1. Render a component using useLifeList without LifeListProvider ancestor
- **Expected:** Error thrown: "useLifeList must be used within a LifeListProvider"

---

## 10. Test Cases: Error Handling

### TC-ERR-001: Species API failure
- **Priority:** P0
- **Component:** `SpeciesTab.tsx` (lines 81-84, 299-308)
- **Steps:**
  1. Mock /api/species to return 500
  2. Navigate to Species tab
- **Expected:** Error message displayed in red box with the error text. Loading skeleton replaced by error state.

### TC-ERR-002: Weekly data API failure
- **Priority:** P1
- **Component:** `MapView.tsx`, `TripPlanTab.tsx`
- **Steps:**
  1. Mock /api/weeks/26/summary to return 404
- **Expected:** Map handles gracefully (no crash). Console error logged. Heatmap shows no data.

### TC-ERR-003: Region API failure
- **Priority:** P2
- **Component:** `SpeciesTab.tsx` (lines 136-140)
- **Steps:**
  1. Mock /api/regions to fail
  2. Select a region
- **Expected:** regionSpeciesCodes set to null (no filter applied). regionName set to null. Console error logged. No crash.

### TC-ERR-004: IndexedDB unavailable
- **Priority:** P1
- **Component:** `LifeListContext.tsx` (lines 82-88), `goalListsDB.ts` (lines 25-27)
- **Steps:**
  1. Mock indexedDB.open to fail
- **Expected:** Error caught, console.error logged. App still renders (graceful degradation). Life list operations throw errors that are caught by calling code.

### TC-ERR-005: Goal list not found on add/remove species
- **Priority:** P2
- **Component:** `goalListsDB.ts` (lines 133-135, 149-151)
- **Steps:**
  1. Call addSpeciesToList with non-existent listId
- **Expected:** Error thrown: "Goal list not found"

---

## 11. Test Cases: SpeciesInfoCard

### TC-INFO-001: Species info card opens with correct data
- **Priority:** P1
- **Component:** `SpeciesInfoCard.tsx`, `SpeciesTab.tsx` (line 580-581)
- **Steps:**
  1. Click a species name in the Species tab
- **Expected:** Modal opens via createPortal to document.body. Shows common name, scientific name, family, photo (or placeholder), conservation badge, difficulty badge, restricted range badge (if applicable), invasion status badge (if not Native), eBird link.

### TC-INFO-002: Species info card close
- **Priority:** P2
- **Component:** `SpeciesInfoCard.tsx` (lines 58-67)
- **Steps:**
  1. Open species info card
  2. Click close button or click overlay background
- **Expected:** Modal closes. Clicking inside card content does not close (stopPropagation).

### TC-INFO-003: Conservation badge colors
- **Priority:** P2
- **Component:** `SpeciesInfoCard.tsx` (lines 12-19)
- **Steps:**
  1. Open info card for species with "Endangered" status
- **Expected:** Badge shows red-100 background, red-800 text color

---

## 12. Priority Summary

| Priority | Count | Description |
|----------|-------|-------------|
| P0 (Critical) | 14 | Core flows that must work: search, life list CRUD, goal list CRUD, view modes, progress display, state sync |
| P1 (High) | 28 | Important flows: filtering, import/export, persistence, region filtering, trip planning |
| P2 (Low) | 13 | Edge cases, UI polish: error handling edge cases, conditional rendering, badge colors |

---

## 13. Recommended Testing Strategy

### Unit Tests to Add (highest impact)
1. **LifeListContext.tsx** -- Test all CRUD operations with mocked IndexedDB (markSpeciesSeen, markSpeciesUnseen, toggleSpecies, clearAllSpecies, importSpeciesList)
2. **goalListsDB.ts** -- Test all DB operations with fake-indexeddb (getAllLists, saveList, deleteList, addSpeciesToList, removeSpeciesFromList, renameList, duplicate detection)
3. **SpeciesTab.tsx** -- Test search/filter logic, family collapse/expand, select all/none, add-to-goal-list dialog
4. **GoalBirdsTab.tsx** -- Test create/rename/delete list, add/remove species, duplicate detection, list switching
5. **ProfileTab.tsx** -- Test CSV parsing logic (valid file, missing columns, merge behavior)
6. **ProgressTab.tsx** -- Test calculation accuracy (percentage, family breakdown, milestones)

### E2E Tests to Add (highest value integration tests)
1. Full life list flow: Import CSV -> verify counts -> export -> verify file
2. Goal list flow: Create list -> add species -> switch view to Goals -> verify map reflects goal species
3. Search and navigate: Search species -> select from autocomplete -> verify scroll and highlight
4. Cross-tab state: Mark species in Species tab -> verify Progress tab updates -> verify map density changes

### Testing Infrastructure Gaps
- No IndexedDB mock in test setup (needed for LifeListContext and goalListsDB unit tests) -- consider `fake-indexeddb` package
- No API mocking strategy beyond basic fetch mock -- consider MSW (Mock Service Worker) for consistent API mocking
- E2E tests lack seed data -- need fixture data or API mocking in Playwright for deterministic tests
- No visual regression testing for map rendering (would need screenshot comparison)

---

## 14. Key Risk Areas

1. **IndexedDB dual-connection race condition:** Both `LifeListContext.tsx` and `goalListsDB.ts` independently open the same IndexedDB database with `DB_VERSION = 2`. They each have their own connection cache (`dbInstance`). If both attempt to open simultaneously on first load, one may trigger `onversionchange` on the other, closing the connection. The `goalListsDB.ts` handles this via `onclose` and `onversionchange` handlers (lines 32-35), but `LifeListContext.tsx` does not handle `onversionchange` on its `idb`-managed connection.

2. **Species list truncation in ExploreTab:** The species range picker shows only the first 100 results (line 295). If a user searches broadly and their target species is beyond item 100, they cannot select it without further narrowing the search. This is documented but could confuse users.

3. **No debounce on search inputs:** Both `SpeciesTab.tsx` and `GoalBirdsTab.tsx` filter on every keystroke against the full species array (2,490 items). While this is small enough to be fast, the autocomplete suggestion generation runs synchronously on each input change.

4. **Goal list state split between App.tsx and GoalBirdsTab.tsx:** App.tsx maintains `goalLists` and `activeGoalListId` at the top level, while GoalBirdsTab.tsx independently loads its own `goalLists` from IndexedDB. Changes made in GoalBirdsTab (create, rename, delete, add/remove species) do NOT propagate back to App.tsx's state. The App.tsx `goalLists` is only loaded once on mount. This means the map's goalSpeciesCodes may become stale until page reload.

5. **CSV import does not deduplicate within the imported file:** If the CSV has the same species listed twice, both entries are processed (though `db.put` is idempotent by key, so no actual duplication in storage). The import count may report slightly misleading numbers.
