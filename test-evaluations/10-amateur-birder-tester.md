# Amateur Birder / New User Tester Evaluation

**Tester Persona:** Casual/beginner birder who enjoys watching birds at the feeder and local park, has maybe heard of eBird but never exported a life list, and does not know birding jargon.

**Date:** 2026-03-13

---

## 1. First Impression

When the app loads, I see a blue header bar that says "Find-A-Lifer" with a tiny colored dot and a moon icon, then a side panel on the left defaulting to the Explore tab, and a large interactive map on the right.

**What works:** The map is immediately engaging -- colored grid squares across North America are visually interesting and invite exploration. The side panel layout with labeled tabs (Explore, Species, Goals, Plan, Stats, Profile) is clean and compact. Dark mode toggle is a nice touch.

**What does not work:** There is no welcome message, no explanation of what the app does, no hint about what to do first. The title "Find-A-Lifer" assumes I know what a "lifer" is. I see colored squares on a map but have no idea what they represent without reading the legend. The tiny green/yellow/red status dot in the header is unexplained unless I hover for a tooltip -- and even then, "Connected" does not tell me what it is connected to.

**Verdict:** First impression is visually polished but opaque. A new user would think "this looks cool" followed immediately by "what am I supposed to do?"

---

## 2. Onboarding

**There is no onboarding.** No welcome screen, no guided tour, no "getting started" steps, no first-time-user detection, no tooltip walkthrough. The app drops you into a fully functional interface with zero context.

This is the single biggest gap for amateur birders. Compare this to apps like Merlin (which asks "Where do you bird?" on first launch) or Duolingo (which walks you through a first lesson). Find-A-Lifer asks nothing and explains nothing.

**Recommendation:** Add a simple first-time welcome overlay or modal with 3-4 sentences: what the app does, what a "lifer" is, and a suggested first action ("Import your eBird life list in the Profile tab, or start checking off birds you have seen in the Species tab").

---

## 3. Jargon Audit

The following terms would confuse a beginner birder:

| Term | Where It Appears | Confusion Level | Suggestion |
|------|-----------------|----------------|------------|
| **Lifer** | App title, legend ("Lifer Density"), Explore tab ("Lifer Range"), Trip Plan ("lifers"), hotspots ("X lifers") | HIGH | Add a one-line explanation somewhere: "A lifer is a bird species you have never seen before" |
| **Life list** | Profile tab | MEDIUM | Most casual birders don't maintain one formally. Brief explanation would help |
| **Species Richness** | Map legend (when no life list imported) | HIGH | "Number of species" or "How many bird species are found here" |
| **Occurrence probability** | Map legend percentages | HIGH | "Chance of seeing this bird" or "How likely you are to find this species" |
| **Goal Birds** | Tab name, view mode | MEDIUM | Concept is intuitive once explained, but never defined in the UI |
| **Taxonomic order** | Species list sort order (implicit) | LOW | Species are listed in taxonomic order by default without explanation |
| **Restricted range** | Blue dots in species list, SpeciesInfoCard badge | HIGH | Never explained; the tiny blue dot has no visible label without hovering |
| **Conservation status** | Filter dropdown, species badges | MEDIUM | Terms like "Near Threatened" vs "Vulnerable" are IUCN categories unfamiliar to beginners |
| **S&T data** | Not visible in UI but in code docs | N/A | Good that this is not exposed to users |
| **Hotspots** | Trip Plan tab mode | MEDIUM | In birding, "hotspot" means a known birding location; here it means "grid cell with many lifers" -- slightly different meaning |
| **Window** | Trip Plan tab mode label | HIGH | "Window" with no further context is cryptic. It means "window of opportunity" -- the best time of year to find a species |
| **Cell ID** | Hotspot sort option, popup text | HIGH | Internal data concept leaked into the UI. Users don't think in "cells" |
| **LBJs** | Goal Birds suggestions section | HIGH | "Little Brown Jobs" is insider birding slang. Beginners would be completely lost |
| **Difficulty Score / Label** | Species filters, badges | LOW | Intuitive labels (Easy, Moderate, Hard) but the criteria are never explained |
| **Invasion Status** | Species filter ("All Origins") | MEDIUM | "Introduced" and "Rare/Accidental" need context |
| **Heatmap Opacity** | Explore tab slider | MEDIUM | "Opacity" is a technical term; "Map overlay transparency" is clearer |

---

## 4. Discoverability

**Can users figure out what to do without instructions?**

Partially. The tab labels provide some guidance, and the layout is standard enough that users will click around. However:

- The connection between importing a life list (Profile tab) and the map changing (Explore tab) is not explained anywhere. A user who checks off 200 birds in the Species tab would not know the map automatically adjusts to show only un-seen species in "Lifer Density" mode.
- The view mode toggle (Richness / Range / Goals) uses shorthand labels that require trial and error to understand.
- The "Animate Migration" button is delightful but unexpected -- a nice discovery moment.
- Clicking on the map to select a location auto-switches to the Trip Plan tab, which is smart behavior but might be disorienting if the user didn't expect the tab to change.
- The "+" button next to each species in the checklist (for adding to goal lists) is so subtle (gray, small) that many users would miss it entirely.

**Best discovery moment:** Clicking a grid cell and seeing a popup of species in that area is intuitive and rewarding.

**Worst discovery moment:** The "Window" mode in Trip Planning. Even after selecting it, the label "Select Target Species" gives little indication of what this feature actually does (find the best weeks of the year to see a particular species).

---

## 5. Empty States

**No life list imported:**
- Species tab: All checkboxes are unchecked. The counter shows "0/2490". This is fine but slightly intimidating -- 2,490 species is a LOT. No message suggests where to start.
- Progress tab: Shows an amber banner: "Get started: Visit the Species tab to mark birds you've seen, or import your eBird life list from the Profile tab." -- this is GOOD and is one of the best empty state messages in the app.
- Map legend: Shows "Species Richness" instead of "Lifer Density" -- a smart dynamic label, though the switch is invisible to the user.

**No goal lists:**
- Goal Birds tab: Shows a large target emoji, "No Goal Lists Yet" heading, and a "Create Your First List" button. This is well-designed and welcoming.
- Explore tab in Goals view: Shows amber banner "No goal lists yet. Create one in the Goal Birds tab." -- clear and actionable.

**No location selected in Trip Plan:**
- Location mode: "Click on the map to select a location" -- good, clear instruction.
- Compare mode: Similar prompts for Location A and Location B.

**Overall:** Empty states are handled well in most places. The Progress tab and Goal Birds tab are standouts. The Species tab (2,490 unchecked species) is the most overwhelming starting point.

---

## 6. Information Hierarchy

**What is most prominent:** The map dominates the viewport, which is appropriate. The side panel is compact but informative.

**Issues:**
- The tab labels are very small (11px) and use no icons, just text. On mobile, 6 tabs crammed into a narrow bar could be hard to tap accurately. The tab labels are cryptic abbreviations: "Goals" (not "Goal Birds"), "Plan" (not "Trip Plan"), "Stats" (not "Progress").
- The Explore tab packs a lot of controls into a small space: Region selector, View Mode toggle, Goal Birds Only toggle, Species picker (conditional), Week slider, Animate button, Opacity slider, Lifer Range filter (conditional). For a new user, this is overwhelming. There is no visual grouping or progressive disclosure.
- In the Species tab, the 2x2 filter grid (Family, Conservation Status, Origin, Difficulty) has no labels -- only placeholder text in dropdowns. This works but violates accessibility guidelines.

---

## 7. Error Recovery

**Undo support:** The app uses `window.confirm()` for destructive actions like clearing the entire life list and deleting goal lists. These are appropriate safety nets.

**Mistakes that are hard to recover from:**
- Accidentally marking a species as "seen" in the Species tab is easy to fix (just uncheck it).
- Accidentally clicking "Clear All Species" in Profile has a confirmation dialog -- good.
- Removing a species from a goal list shows a success toast but has no undo option. Mistakes here require re-searching and re-adding the species.
- The "Select: All | None" buttons in the Species tab are dangerous. Clicking "All" marks all 2,490 species as seen with no confirmation dialog and no undo. Clicking "None" un-marks everything. These should have confirmation dialogs given their scope.

---

## 8. Learning Curve

**Session 1 (15-30 minutes):** A new user would explore the map, click some cells, maybe find the Species tab and check off a few birds. They would likely not discover Trip Planning, Goal Lists, or the migration animation. They would probably be confused by "Richness" vs "Range" vs "Goals" view modes.

**Session 2 (15-30 minutes):** If the user returns, they might explore more tabs. Importing an eBird life list (if they have one) would be the breakthrough moment where the map suddenly becomes personalized.

**Session 3+:** Goal lists and trip planning would become useful once the user understands the core concepts.

**Estimated time to productivity:** 2-3 sessions for a moderately tech-savvy birder. For a true beginner, possibly more, because the app does not teach birding concepts -- it assumes you know what a life list is and why you want one.

---

## 9. Motivation

**What encourages continued use:**
- The Progress tab with milestones (100, 250, 500, ... species) is motivating. The visual progress bars by family are satisfying.
- The Goal Birds tab suggestions sections (Easy Wins, Rarest in North America, Regional Icons, Colorful Characters, Owls & Nightbirds, Raptors, LBJs, etc.) are genuinely engaging and make you want to go birding.
- The "Top Families to Target" section in Progress is a smart nudge.
- The migration animation is visually stunning and could hook someone who is curious about seasonal patterns.

**What discourages continued use:**
- No social features (no sharing, no leaderboards, no community).
- No integration with actual birding activity (no way to log a sighting from the field -- you have to manually check off species).
- The initial empty state (2,490 unchecked species) is daunting rather than inviting.
- No push notifications or reminders ("Migration season starting in your area!").

---

## 10. Visual Clarity

**Map colors:** The viridis gradient (purple to teal to green to yellow to orange to red) is a good scientific choice for colorblind accessibility. However, beginners will not intuitively know that "purple = fewer species" and "red = more species" without studying the legend.

**Legend:** The gradient bar with numeric ticks is compact and unobtrusive, positioned in the bottom-left. The legend title changes dynamically ("Species Richness" vs "Lifer Density" vs species name), which is smart. However, the legend does not explain what the numbers mean -- are they counts? Percentages? A beginner would wonder.

**Icons:** The app uses very few icons. Tab navigation is text-only. The species checklist uses tiny colored dots (yellow/orange/red for conservation status, blue for restricted range) that are only 1.5px wide -- barely visible, and their meaning is only discoverable via hover tooltip.

**Dark mode:** Present and functional but does not appear to affect the map tiles, which could create contrast issues.

---

## 11. Feature Discovery

**Would a new user find Trip Plan?** Eventually, yes -- clicking the map auto-switches to the Plan tab, which is a clever shortcut. But the four sub-modes (Location, Hotspots, Window, Compare) within Trip Plan are advanced features that a beginner would not explore without guidance.

**Would a new user find Progress tracking?** Only if they click the "Stats" tab. The label "Stats" is less intuitive than "Progress" or "My Progress."

**Would a new user find Goal Lists?** The "Goals" tab label is clear enough, and the empty state is welcoming. The suggestion sections (Easy Wins, Regional Icons, etc.) are a fantastic discovery mechanism -- they teach the user what goal lists are for by showing interesting birds to target.

**Would a new user find the eBird import?** Only if they visit the Profile tab, which is the last tab. Many users might never click it. This is a problem because importing a life list is arguably the most important first step.

---

## 12. Help and Documentation

**In-app help:** There is essentially none. No help button, no "?" icons, no FAQ, no glossary, no contextual help text. The only guidance comes from empty state messages and label text.

**Tooltips:** Used sparingly and effectively (dark mode toggle, server status dot, species dots), but most interactive elements lack tooltips. The view mode buttons (Richness, Range, Goals) have no tooltips explaining what each mode shows.

**External documentation:** No visible link to documentation, user guide, or help page from within the app.

---

## 13. Emotional Design

**Welcoming elements:**
- The Goal Birds empty state with the target emoji and "Create Your First List" CTA is warm and inviting.
- The suggestion categories in Goal Birds (with emojis for regions, owls, raptors, etc.) add personality.
- The completion message on the Progress tab ("Congratulations! You have seen all X species!") with a party emoji is delightful.
- The migration animation is a "wow" moment.

**Intimidating elements:**
- The Species Checklist with 2,490 unchecked species feels like homework.
- The Explore tab with 7+ controls visible simultaneously is overwhelming.
- Technical language throughout (opacity, richness, occurrence probability) creates a cold, data-driven feel.
- No images or illustrations of birds appear until you click on a species info card. The main experience is abstract colored grid cells, which is less emotionally engaging than seeing actual bird photos.

**Overall emotional tone:** The app feels more like a data analysis tool than a birding companion. It is powerful but not warm. Compare with Merlin Bird ID, which leads with bird photos and sounds, or eBird, which celebrates submissions with streaks and badges.

---

## 14. Comparison to eBird

**Advantages over eBird:**
- The "where should I go to find new lifers" question is answered directly by the map, which eBird does not do as intuitively.
- Goal list management with curated suggestions is unique and valuable.
- The migration animation is not available on eBird.
- The Week-by-week granularity of species occurrence is more accessible here than navigating eBird Status & Trends directly.
- Comparing two locations side-by-side is a clever feature eBird lacks.

**Disadvantages compared to eBird:**
- No community aspect (checklists, hotspot descriptions, recent sightings, other birders' reports).
- No actual birding in the field -- no checklist submission, no GPS integration, no bird ID help.
- Requires a separate eBird export/import step to use life list data.
- No bird photos, sounds, or ID resources (Merlin integration would be powerful).
- Limited to North America (US only, based on the 5 region options).
- The grid-based system is less precise than eBird's hotspot-level detail.

**Best complementary use:** Find-A-Lifer works best as a trip planning companion to eBird, not a replacement. The value proposition should be: "Use Find-A-Lifer to decide WHERE and WHEN to go birding, then use eBird in the field."

---

## 15. Top Recommendations for Beginners (Without Dumbing Down for Experts)

### Must-Have Improvements

1. **Add a first-time welcome overlay** -- 3-4 sentences explaining what the app does, what a "lifer" is, and where to start. Show once, dismissible, with a "Don't show again" option. Include a "Quick Start" suggestion (import life list or start checking off species).

2. **Add a glossary or help panel** -- A "?" icon in the header that opens a glossary of terms (lifer, richness, goal bird, hotspot, window of opportunity, etc.) with brief, friendly definitions.

3. **Rename "Window" to "Best Time"** in Trip Plan modes. "Window of opportunity" is opaque; "Best Time to See [Species]" immediately communicates the value.

4. **Remove "Cell ID" from user-facing UI** -- Replace hotspot sort option "Cell ID" with "Location" or simply remove it. Cell IDs are internal implementation details.

5. **Add confirmation to "Select: All / None"** in the Species tab -- These bulk operations affect 2,490 species with a single click and have no undo.

### Nice-to-Have Improvements

6. **Reorder tabs** -- Put Profile (with import) earlier in the tab order, or add a "Get Started" prompt on the Explore tab that links to Profile > Import.

7. **Add brief descriptions to view modes** -- When a user first switches to a new view mode, show a one-line tooltip: "Richness: See how many bird species are in each area" / "Range: See where a specific species lives" / "Goals: See where your goal birds are found."

8. **Explain the color gradient on first view** -- A small annotation on the legend: "Darker colors = fewer species, brighter colors = more species" (for Richness mode).

9. **Add bird photos to the species list** -- Even small thumbnails next to species names would make the checklist more engaging and help beginners who identify birds visually.

10. **Expand "LBJs" to "Little Brown Birds (LBJs)"** -- If keeping the insider term, at least explain it inline for newcomers.

11. **Progressive disclosure on Explore tab** -- Group advanced controls (opacity, lifer range filter) under an "Advanced" toggle so the default view is simpler: Region, View Mode, Week, Animate.

12. **Add a "What is this?" link or tooltip to the legend** -- Explain what the numbers/percentages mean in context.

---

## Summary Scorecard

| Dimension | Rating (1-5) | Notes |
|-----------|:---:|-------|
| First impression | 3 | Visually polished but no context for beginners |
| Onboarding | 1 | No onboarding whatsoever |
| Jargon accessibility | 2 | Heavy use of birding and technical jargon throughout |
| Discoverability | 3 | Tab layout helps, but advanced features are hidden |
| Empty states | 4 | Well-handled in most places, especially Goals and Progress |
| Information hierarchy | 3 | Map prominence is good; side panel is dense |
| Error recovery | 3 | Confirmation dialogs for destructive actions, but no undo and bulk Select All/None has no guard |
| Learning curve | 2 | 2-3 sessions minimum; no guidance to accelerate |
| Motivation | 3 | Progress tracking and suggestions are good; lacks social/gamification |
| Visual clarity | 3 | Good color choices; tiny status dots and no icons hurt readability |
| Feature discovery | 3 | Auto-switch to Trip Plan is clever; Window mode is opaque |
| Help/documentation | 1 | No in-app help, no glossary, no tooltips on key controls |
| Emotional design | 2 | Feels like a data tool, not a birding companion |
| Comparison to eBird | 4 | Strong complementary value for trip planning |

**Overall Beginner-Friendliness: 2.5 / 5**

The app is powerful and well-built, but it currently serves experienced birders who already understand life lists, goal species, and occurrence data. With a welcome overlay, a glossary, and some label improvements, it could become accessible to a much wider audience without sacrificing any depth for experts.
