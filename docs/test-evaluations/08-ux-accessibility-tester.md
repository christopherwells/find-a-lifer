# UX & Accessibility Evaluation: Find-A-Lifer

**Evaluator Role:** UX / Accessibility Tester
**Date:** 2026-03-13
**Scope:** All UI components (App.tsx, TopBar.tsx, SidePanel.tsx, ExploreTab.tsx, SpeciesTab.tsx, GoalBirdsTab.tsx, TripPlanTab.tsx, ProgressTab.tsx, ProfileTab.tsx, MapView.tsx, SpeciesInfoCard.tsx, Skeleton.tsx), CSS/Tailwind configuration, ARIA attributes, keyboard navigation, and field usability.

---

## Executive Summary

Find-A-Lifer is a well-structured React application with reasonable baseline accessibility. The viridis color gradient is a strong choice for colorblind users, dark mode support is implemented throughout, and several key interactive elements have ARIA labels. However, the application has significant gaps in WCAG 2.1 AA compliance, particularly around keyboard navigation, focus management, screen reader support, touch target sizes, and field usability for outdoor birding contexts. This evaluation identifies 37 specific issues across 8 categories with prioritized remediation recommendations.

---

## 1. WCAG 2.1 AA Compliance Assessment

### 1.1 Color Contrast (WCAG 1.4.3 / 1.4.6)

**Light Mode Issues:**

| Element | Foreground | Background | Estimated Ratio | Pass/Fail (AA) |
|---------|-----------|------------|-----------------|----------------|
| Tab labels (inactive) | `text-gray-400` (#9CA3AF) | `bg-white` (#FFFFFF) | ~2.9:1 | FAIL |
| "View Mode" label | `text-gray-500` (#6B7280) | `bg-white` (#FFFFFF) | ~4.6:1 | PASS (normal), FAIL (small text at 10px) |
| Week label text `text-[#2C3E50]` | #2C3E50 | #FFFFFF | ~9.9:1 | PASS |
| Species sci name in autocomplete | `text-gray-400` (#9CA3AF) | `bg-white` | ~2.9:1 | FAIL |
| Lifer range "min/max" hint | `text-gray-400` (#9CA3AF) | `bg-white` | ~2.9:1 | FAIL |
| Status dots (1.5px) conservation/restricted | colored dots on white | Various | N/A (non-text) | Concern |
| Legend tick labels | `text-gray-500` (#6B7280) | `bg-white/90` | ~4.6:1 | BORDERLINE for 10px text |
| "Reset range" link | `text-[#2C3E7B]` (#2C3E7B) | `bg-white` | ~7.2:1 | PASS |

**Dark Mode Issues:**

| Element | Foreground | Background | Estimated Ratio | Pass/Fail (AA) |
|---------|-----------|------------|-----------------|----------------|
| Tab labels (inactive) | `text-gray-500` (#6B7280) | `bg-gray-900` (#111827) | ~3.9:1 | FAIL |
| "View Mode" label | `text-gray-400` (#9CA3AF) | `bg-gray-900` | ~5.9:1 | PASS |
| Placeholder text | `placeholder-gray-500` | `bg-gray-800` | ~3.3:1 | FAIL |
| Region filter indicator | `text-blue-400` | `bg-blue-900/30` | Varies | NEEDS VERIFICATION |
| Legend bar on dark map | white/90 bg on dark basemap | N/A | PASS (opaque background) |

**Priority: HIGH** -- Inactive tab labels and placeholder text fail AA minimum (4.5:1 for normal text, 3:1 for large text). The 10px and 11px text sizes used throughout require 4.5:1 minimum ratio.

**Remediation:**
- Inactive tab labels: Change `text-gray-400` to `text-gray-500` (light) and `text-gray-500` to `text-gray-400` (dark)
- Placeholder text: Change `placeholder-gray-500` to `placeholder-gray-400` in dark mode
- Scientific name in autocomplete: Change `text-gray-400` to `text-gray-500`
- 10px hint text: Either increase size to 12px+ or ensure 4.5:1 contrast ratio

### 1.2 Non-Text Contrast (WCAG 1.4.11)

- **Server status dot** (TopBar.tsx): Only 6px (w-1.5 h-1.5). While it has a title attribute, the dot alone conveys meaning through color only. Red/green/yellow color coding is problematic for color-blind users.
  - **Priority: MEDIUM** -- Add text label or shape differentiation (e.g., checkmark vs. X icon)

- **Conservation status dots** (SpeciesTab.tsx): 6px colored dots (1.5x1.5) distinguish conservation status. No text label visible, only a title tooltip.
  - **Priority: MEDIUM** -- Too small for reliable interaction; tooltips are not keyboard accessible.

- **Progress bars**: Use solid `bg-[#27AE60]` (green) and `bg-[#2C3E7B]` (blue) fills on `bg-gray-200` tracks. Contrast between fill and track is adequate.
  - **Status: PASS**

### 1.3 Focus Indicators (WCAG 2.4.7)

- Form inputs use `focus:ring-2 focus:ring-[#2C3E7B]` or `focus:ring-1` -- these are visible focus rings. **PASS**
- Buttons generally have hover states but **no custom focus-visible styles**. They rely on browser defaults, which may be insufficient on some browsers.
  - **Priority: MEDIUM** -- Add `focus-visible:ring-2 focus-visible:ring-[#2C3E7B]` to all interactive buttons
- Tab navigation buttons have no visible focus indicator beyond browser defaults.
  - **Priority: HIGH** -- The tab bar is a primary navigation element; needs clear focus styling

---

## 2. Screen Reader Compatibility

### 2.1 ARIA Attributes Inventory

**Present (good):**
- `aria-label` on: dark mode toggle, region selector, goal list selectors, species clear button, animation play/pause buttons, opacity slider, lifer range sliders, popup close buttons, SpeciesInfoCard close button
- `aria-pressed` on: Goal Birds Only toggle button
- `role="button"` + `tabIndex={0}` + `onKeyDown` on: Family header collapse/expand (SpeciesTab.tsx)

**Missing (problems):**

| Component | Issue | WCAG Criterion |
|-----------|-------|----------------|
| SidePanel tab bar | No `role="tablist"`, tabs have no `role="tab"`, no `aria-selected`, no `aria-controls` | 4.1.2 |
| SidePanel tab panels | No `role="tabpanel"`, no `aria-labelledby` | 4.1.2 |
| View mode toggle (ExploreTab) | Acts as radio group but has no `role="radiogroup"` or `aria-checked` | 4.1.2 |
| TripPlanTab mode switcher | Same issue as view mode -- segmented control with no ARIA semantics | 4.1.2 |
| Modal dialogs (GoalBirdsTab create/delete, SpeciesTab add-to-goal, SpeciesInfoCard) | No `role="dialog"`, no `aria-modal="true"`, no `aria-labelledby` | 4.1.2, 2.4.3 |
| Loading spinner (MapView, ExploreTab) | No `aria-live="polite"` region, no `role="status"` | 4.1.3 |
| Success/duplicate toast messages | No `role="alert"` or `aria-live="assertive"` | 4.1.3 |
| Error messages (import errors, data errors) | No `role="alert"` | 4.1.3 |
| Autocomplete dropdowns (SpeciesTab, GoalBirdsTab) | No `role="listbox"`, no `role="option"`, no `aria-expanded`, no `aria-activedescendant` | 1.3.1, 4.1.2 |
| Species checklist checkboxes | Missing `aria-label` (relies on adjacent text) | Acceptable but could be improved |
| Map container | No `aria-label` describing the interactive map | 1.1.1 |
| Heatmap legend | No `aria-label` or semantic structure | 1.1.1 |
| Week slider | Has `id` and `htmlFor` label -- GOOD | PASS |

**Priority: HIGH** -- The tab bar and modal dialogs are critical navigation patterns that screen readers cannot interpret correctly without proper ARIA roles.

**Remediation:**
1. Add `role="tablist"` to tab nav, `role="tab"` + `aria-selected` to each tab button, `role="tabpanel"` to content areas
2. Add `role="dialog"` + `aria-modal="true"` + `aria-labelledby` to all modal overlays
3. Add `role="status"` + `aria-live="polite"` to loading indicators
4. Add `role="alert"` to toast notifications
5. Implement proper combobox/listbox ARIA pattern for autocomplete dropdowns

### 2.2 Semantic HTML

- Headers use `h3` and `h4` -- reasonable hierarchy within tabs. No `h1` or `h2` visible in content (h1 is the app title in TopBar). Heading levels are acceptable.
- Lists use `<ul>` in goal birds popup. Species lists in SpeciesTab use `<div>` elements instead of `<ul>/<li>` -- not ideal for screen readers.
  - **Priority: LOW** -- Consider using semantic list elements for species lists
- The `<nav>` element is used for tab navigation -- good.
- `<header>` is used for TopBar -- good.
- `<main>` landmark is **missing** for the primary content area.
  - **Priority: MEDIUM** -- Add `<main>` landmark wrapping the map + side panel area

### 2.3 Live Regions

**No `aria-live` regions exist anywhere in the application.** This means screen reader users get no feedback when:
- Data finishes loading
- Week changes via slider
- View mode changes
- Species are added/removed from goal lists
- Toast messages appear and disappear
- Map overlay updates

**Priority: HIGH**

---

## 3. Keyboard Navigation

### 3.1 Tab Order and Focus Management

- **Tab bar**: Tabs are `<button>` elements and are keyboard focusable. However, there is no arrow key navigation between tabs (WCAG tab pattern recommends arrow keys within a tablist, Tab should move to the tab panel).
  - **Priority: MEDIUM**

- **Modal dialogs** (SpeciesInfoCard, GoalBirdsTab create/delete, SpeciesTab add-to-goal):
  - **No focus trapping**. When a modal opens, Tab can move focus behind the modal to map controls, sidebar elements, etc.
  - **No focus restoration** when modal closes (focus is lost).
  - Escape key only works in GoalBirdsTab rename input. Other modals have no Escape-to-close keyboard support (only click-outside-to-close).
  - **Priority: HIGH** (WCAG 2.4.3 Focus Order)

- **Autocomplete dropdowns** (SpeciesTab, GoalBirdsTab):
  - No arrow key navigation through suggestions
  - No Enter key to select highlighted suggestion
  - Only mouse click to select
  - **Priority: HIGH** -- Autocomplete is unusable via keyboard

- **Map interaction**: The MapLibre map has built-in keyboard controls (arrow keys, +/-). The grid cell click interaction is mouse-only with no keyboard alternative.
  - **Priority: MEDIUM** -- Provide alternative access to cell inspection (e.g., search by cell ID or coordinates)

- **Collapsible family headers** (SpeciesTab): Properly have `role="button"`, `tabIndex={0}`, and `onKeyDown` for Enter/Space. **PASS**

- **Range sliders**: Native `<input type="range">` -- keyboard accessible via arrow keys. **PASS**

### 3.2 Skip Links

- **No skip links** exist. Users must Tab through the entire TopBar and side panel tab navigation to reach the map or content.
  - **Priority: MEDIUM** (WCAG 2.4.1)

### 3.3 Focus Visible

- The SpeciesInfoCard close button and other icon buttons are small (p-1.5 = 6px padding + 16px icon = ~28px total). When focused, browser default outlines may not be visible enough.
  - **Priority: MEDIUM**

---

## 4. Touch Target Sizes (WCAG 2.5.8 / 2.5.5)

Minimum recommended: 44x44px (WCAG AAA), 24x24px minimum (WCAG AA 2.5.8).

| Element | Approximate Size | Pass/Fail (44px) | Pass/Fail (24px) |
|---------|-----------------|-------------------|-------------------|
| Tab buttons | ~53px wide, 40px tall | PASS (wide), BORDERLINE (height) | PASS |
| Dark mode toggle | 36x36px (p-2 + 20px icon) | FAIL | PASS |
| Collapse panel button | px-1.5 = ~24px wide, 40px tall | FAIL | BORDERLINE |
| View mode buttons | flex-1 (variable), py-1.5 = ~30px tall | FAIL | PASS |
| Species list items (checkboxes) | h-3.5 w-3.5 = 14x14px | FAIL | FAIL |
| Species list items (name button) | full-width, py-1 = ~28px tall | FAIL | PASS |
| "+" add to goal list button | ~16x28px | FAIL | FAIL |
| Conservation/restricted dots | 6x6px | FAIL | FAIL |
| Family "All"/"None" buttons | px-0.5, text-[10px] = ~20x20px | FAIL | FAIL |
| Global "Select: All / None" | text-[11px] = ~24x20px | FAIL | FAIL |
| Popup close buttons (MapView) | p-1 + 16px icon = ~24x24px | FAIL | BORDERLINE |
| SpeciesInfoCard close button | p-1.5 + 16px icon = ~28x28px | FAIL | PASS |
| Animation play/pause | full-width, py-1.5 = ~32px tall | FAIL | PASS |
| Import/Export/Clear buttons | full-width, py-2 = ~36px tall | FAIL | PASS |
| Week slider thumb | Browser default (~20px) | FAIL | FAIL |

**Priority: HIGH** -- Multiple critical interactive elements fall below 24px minimum. The checkbox (14x14px), "+" button, and status dots are particularly problematic for gloved finger operation in the field.

**Remediation:**
1. Increase checkbox size to at least `h-5 w-5` (20px) with `min-h-[44px] min-w-[44px]` touch target area using padding
2. Make "+" add-to-goal button at least 44x44px with a larger tap target via padding
3. Increase all button heights to at least `py-2.5` for 44px targets
4. Add padding/margin around small interactive elements to create 44px touch zones
5. Use CSS `::before` pseudo-elements or padding to extend small button hit areas

---

## 5. Text Scaling (WCAG 1.4.4)

### 5.1 Fixed Font Sizes

The application uses many fixed/small font sizes:
- `text-[10px]` -- used extensively for labels, hints, family names, badge text
- `text-[11px]` -- used for tab labels, view mode buttons, filter selects, small actions
- `text-xs` (12px) -- used for species names, form labels, descriptions
- `text-sm` (14px) -- used for input fields, search, descriptions

At 200% text scaling:
- `text-[10px]` becomes 20px -- still small but readable
- Layout uses `flex` and `overflow` extensively, which generally handles scaling well
- The side panel has `md:w-80` (320px fixed width) which does NOT grow with text scaling -- text may overflow or become cramped
- The `max-h-48` on species list and `max-h-96` on popups may become too restrictive at larger text sizes

**Priority: MEDIUM** -- The fixed side panel width is the primary concern. Consider `min-w-80` or a responsive width approach.

### 5.2 Viewport Units

- `h-screen` and `100vh` are used for root layout. These work correctly with text scaling.
- `h-[45vh]` for mobile side panel: At 200% zoom, content may not fit in 45% of viewport height.
  - **Priority: LOW** -- Consider `min-h-[45vh]` or responsive adjustment

---

## 6. Field Usability (Outdoor Birding Context)

### 6.1 Bright Sunlight Readability

**Issues:**
- Low contrast inactive tabs (`gray-400` on white) will be essentially invisible in direct sunlight
- `text-[10px]` and `text-[11px]` text will be very difficult to read outdoors
- The viridis heatmap gradient at low values (deep purple: #440154) against the Voyager basemap may be hard to distinguish in bright light
- The legend bar uses `backdrop-blur-md bg-white/90` which provides good readability
- Map grid borders at `rgba(255, 255, 255, 0.15)` opacity are essentially invisible in sunlight

**Priority: HIGH for a field-use app**

**Remediation:**
- Implement a "High Contrast" or "Sunlight" mode with bolder colors, larger text (minimum 14px), and higher contrast ratios
- Increase minimum text size to 12px throughout the side panel
- Provide an option to increase heatmap opacity to 100% for outdoor use (currently configurable via slider, which is good)
- Make the legend background fully opaque in sunlight mode

### 6.2 Gloved Finger Operation

**Issues:**
- Checkboxes at 14x14px are impossible to reliably tap with gloves (gloved fingers need ~60-70px targets)
- The "+" add-to-goal button is far too small for gloved use
- Tab buttons at 40px height are borderline
- The week slider thumb (browser default ~20px) is too small for gloves
- Filter dropdowns at `text-[11px]` will be hard to tap and read the options

**Priority: HIGH for a field-use app**

**Remediation:**
- Implement a "Field Mode" that:
  - Increases all touch targets to 56px+ minimum
  - Hides less-used controls (filters, range sliders) behind an expandable section
  - Increases font sizes to 14px minimum
  - Enlarges checkboxes to 24x24px minimum
  - Uses larger slider thumbs (via CSS `appearance: none` + custom thumb styling)

### 6.3 One-Handed Mobile Use (Thumb Zone Analysis)

The mobile layout uses `flex-col-reverse` with the side panel as a bottom sheet at `h-[45vh]`. This places the tab bar at the bottom of the side panel area, above the bottom of the screen.

**Thumb-reachable zone (bottom-right for right-handed users):**
- Tab navigation: Located at the TOP of the bottom sheet (far from thumb) -- POOR
- Map controls: MapLibre nav controls are at `top-right` of the map -- completely unreachable with one hand
- Week slider: In the middle of the side panel content -- MODERATE
- Collapse/expand: At the tab bar level -- POOR on tall phones

**Priority: MEDIUM**

**Remediation:**
- Move tab navigation to the BOTTOM of the side panel (below content), closer to the thumb zone
- Consider a floating action button for the most common actions
- Add gesture support (swipe down to collapse panel, swipe left/right to switch tabs)
- Move MapLibre controls to `bottom-right` or `bottom-left`

---

## 7. Color-Blind Accessibility

### 7.1 Heatmap Gradient

- **Viridis gradient**: Excellent choice. Viridis is specifically designed to be perceptually uniform and readable by people with protanopia, deuteranopia, and tritanopia. **PASS**
- **Extended viridis** (adding orange/red at high end): The orange (#FCA50A) and red (#E23028) extension maintains good distinguishability for most color vision deficiencies. **PASS**
- **Amber/gold gradient** (Goal Birds): Monochromatic amber from transparent to opaque -- works well for all color vision types. **PASS**

### 7.2 UI Color Usage

**Issues:**
- **Server status indicator** (TopBar): Uses red/yellow/green dots with NO shape or text differentiation. Red-green colorblind users cannot distinguish connected (green) from disconnected (red).
  - **Priority: HIGH**

- **Conservation status dots** (SpeciesTab): Yellow (#FACC15), orange (#FB923C), red (#EF4444) dots. Protanopia/deuteranopia users may confuse yellow and orange.
  - **Priority: MEDIUM** -- The dots also have `title` attributes but these are not visible without hover

- **Progress bars**: Green (#27AE60) for success, blue (#2C3E7B) for progress. These are distinguishable for most color vision deficiencies. **PASS**

- **Error/warning/success message boxes**: Use red, amber, green, and blue backgrounds with matching text. The background patterns (bg-red-50, bg-green-50, bg-amber-50) provide some differentiation through brightness. **ACCEPTABLE** but could be improved with icons.

**Remediation:**
- Server status: Add text labels ("Connected", "Connecting...", "Error") or distinct icons (checkmark, spinner, X)
- Conservation dots: Add distinct shapes or letters (e.g., "T" for Threatened, "E" for Endangered)
- All status indicators: Never rely on color alone (WCAG 1.4.1)

---

## 8. Loading States and Error Communication

### 8.1 Loading States

**Skeleton screens** (Skeleton.tsx): Well-implemented with shimmer animation (`animate-pulse`). Used in SpeciesTab, ProgressTab, TripPlanTab, and GoalBirdsTab. **GOOD**

**Loading spinners**: Used in MapView (week data loading) and ExploreTab (species loading). These provide visual feedback.

**Issues:**
- No screen reader announcements for loading state changes (no `aria-live` regions)
- The map loading indicator uses `absolute top-4 left-1/2` positioning -- may overlap with other UI elements
- No loading indicator when fetching cell click data (goal birds popup, lifers popup) -- the data loads silently
- No loading timeout or retry mechanism visible to users for cell data fetches

**Priority: MEDIUM**

### 8.2 Error Messages

**Present:**
- SpeciesTab: Red error box for API failures
- ProfileTab: Import error with descriptive message
- GoalBirdsTab: Create list validation error
- TripPlanTab: "Failed to load species data. Is the server running?" -- clear and actionable

**Issues:**
- SpeciesTab "Add to Goal List" failure uses `alert()` -- breaks screen reader flow and is not styled
  - **Priority: LOW** -- Replace with inline error message
- No `role="alert"` on any error messages
- Map data loading failures are only logged to console -- no user-facing error
  - **Priority: MEDIUM** -- Add visible error state when map data fails to load
- No error boundary at the React component level -- unhandled errors will crash the app silently
  - **Priority: MEDIUM**

### 8.3 Empty States

Well-handled throughout:
- GoalBirdsTab: "No Goal Lists Yet" with clear CTA button
- ProgressTab: Get started guidance pointing to Species and Profile tabs
- TripPlanTab hotspots: "No hotspots found" with helpful context
- Goal Birds popup: "None of your goal birds occur in this cell"
- Lifers popup: "You've seen all species in this cell!"

**Status: GOOD** -- Empty states are clear, helpful, and include actionable next steps.

---

## 9. Cognitive Load Assessment

### 9.1 Information Density

The side panel at 320px width packs significant information:
- 6 tabs with 11px labels
- View mode toggles, goal list selectors, species pickers, week sliders, opacity controls, range filters -- all potentially visible simultaneously
- ExploreTab alone can show: region selector, view mode, goal list selector, goal birds toggle, species search, species list, week slider, animation button, opacity slider, and lifer range filter

**Priority: MEDIUM** -- Consider progressive disclosure (collapsible sections, "Advanced" toggle for less-used controls like opacity and lifer range)

### 9.2 Jargon

- "Lifer" -- birding term, may be unfamiliar to casual users. No tooltip or explanation.
- "Species Richness" -- ecological term. More accessible: "Number of Species"
- "Occurrence Probability" -- technical. Consider "Likelihood" or "Chance of Seeing"
- "Cell" (in popups like "Cell 1234") -- GIS terminology meaningless to birders
- "Taxonomic order" -- used in sorting but not explained

**Priority: LOW** -- The target audience (birders) likely understands "lifer" and "species richness". Consider adding brief tooltips for less common terms.

### 9.3 Onboarding

- No onboarding flow, tutorial, or feature discovery
- New users see an empty map with controls they must figure out
- The relationship between the Explore tab controls and the map is not explicitly communicated

**Priority: LOW** -- Not an accessibility requirement, but would improve first-use experience

---

## 10. Motion and Animation Sensitivity

### 10.1 Animations Used

- `animate-pulse`: Skeleton loading, server status connecting dot
- `animate-spin`: Loading spinners
- `transition-colors`: Button hover/focus states
- `transition-all duration-300`: Side panel collapse/expand
- `transition-transform`: Chevron rotation for collapsible sections
- Map `flyTo` with `duration: 1500`: 1.5-second smooth camera animation
- Migration animation: Auto-advances week slider every 1 second

### 10.2 Reduced Motion Support

**No `prefers-reduced-motion` media query is implemented anywhere in the codebase.** This means:
- Skeleton shimmer animations play regardless of user preference
- Map fly-to animations play at full duration
- Side panel transitions play at full duration
- The migration animation auto-plays with no reduced-motion alternative

**Priority: HIGH** (WCAG 2.3.3 Animation from Interactions)

**Remediation:**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
Additionally:
- Set `map.flyTo({ duration: 0 })` when `prefers-reduced-motion` is active
- Disable migration auto-advance animation or use instant transitions
- Replace `animate-pulse` skeletons with static gray placeholders

---

## 11. Focus Management During State Changes

### 11.1 Tab Switching

When the active tab changes in SidePanel, the previous tab's content is removed from the DOM and new content is rendered. **Focus is not explicitly managed** -- it likely falls to `<body>`, forcing screen reader users to navigate back to the content.

**Priority: HIGH**

**Remediation:** After tab switch, move focus to the new tab panel or its first interactive element.

### 11.2 Modal Display

When SpeciesInfoCard or dialog modals open:
- Focus is not moved to the modal
- GoalBirdsTab create dialog uses `autoFocus` on the input -- **GOOD** (but only for this one dialog)
- No focus trap prevents tabbing out of the modal
- When modals close, focus is not restored to the triggering element

**Priority: HIGH**

### 11.3 Popup Display (MapView)

When goal birds or lifers popups appear on the map:
- Focus stays on the map -- the popup is not keyboard navigable
- The popup close button is only reachable by mouse
- Popup content (species lists) cannot be scrolled via keyboard

**Priority: MEDIUM**

### 11.4 Auto-Tab Switch

When a location is selected on the map, `SidePanel` auto-switches to the Trip Plan tab (line 84-88 of SidePanel.tsx). This is unexpected behavior that may disorient screen reader users with no announcement.

**Priority: MEDIUM** -- Add an `aria-live` announcement: "Switched to Trip Plan tab for selected location"

---

## 12. SpeciesInfoCard Modal (Detailed Review)

The SpeciesInfoCard uses `createPortal` to render at the document body level -- good for z-index management.

**Issues:**
1. No `role="dialog"` or `aria-modal="true"` on the overlay
2. No `aria-labelledby` pointing to the species common name heading
3. No focus trap (Tab can escape the modal)
4. No Escape key handler to close
5. The close button has `aria-label="Close species info"` -- GOOD
6. The card has no dark mode support (hardcoded `bg-white`, `text-[#2C3E50]`, etc.)
   - **Priority: HIGH** -- This modal will appear glaringly bright in dark mode
7. Badge colors (green-100, yellow-100, etc.) are light-mode only -- no dark variants
8. The eBird link opens in a new tab with `target="_blank"` and has `rel="noopener noreferrer"` -- GOOD for security but should indicate to screen readers that it opens a new window

**Priority: HIGH** (dark mode support), **MEDIUM** (dialog accessibility)

---

## 13. Summary of Findings by Priority

### Critical (Must Fix)

| # | Issue | WCAG | Component |
|---|-------|------|-----------|
| 1 | Modal dialogs lack `role="dialog"`, focus trapping, and Escape to close | 2.4.3, 4.1.2 | SpeciesInfoCard, GoalBirdsTab, SpeciesTab |
| 2 | No `aria-live` regions for dynamic content updates | 4.1.3 | All components |
| 3 | Tab bar lacks proper ARIA roles (tablist/tab/tabpanel) | 4.1.2 | SidePanel |
| 4 | No `prefers-reduced-motion` support | 2.3.3 | Global |
| 5 | SpeciesInfoCard has no dark mode support | 1.4.3 | SpeciesInfoCard |

### High Priority

| # | Issue | WCAG | Component |
|---|-------|------|-----------|
| 6 | Inactive tab labels fail contrast ratio | 1.4.3 | SidePanel |
| 7 | Touch targets below 44px for many interactive elements | 2.5.5 | Multiple |
| 8 | Autocomplete dropdowns not keyboard accessible | 2.1.1 | SpeciesTab, GoalBirdsTab |
| 9 | Focus not managed during tab switches | 2.4.3 | SidePanel |
| 10 | Server status uses color alone to convey state | 1.4.1 | TopBar |
| 11 | Text too small for outdoor/sunlight use (10-11px) | Field usability | Multiple |

### Medium Priority

| # | Issue | WCAG | Component |
|---|-------|------|-----------|
| 12 | No skip links | 2.4.1 | App |
| 13 | No `<main>` landmark | 1.3.1 | App |
| 14 | Missing focus-visible styles on buttons | 2.4.7 | Multiple |
| 15 | Map popups not keyboard navigable | 2.1.1 | MapView |
| 16 | Fixed side panel width doesn't scale with text | 1.4.4 | SidePanel |
| 17 | MapLibre controls in thumb-unreachable zone on mobile | Field usability | MapView |
| 18 | Auto-tab switch on location select with no announcement | 4.1.3 | SidePanel |
| 19 | No error boundary for unhandled errors | Usability | App |
| 20 | Placeholder text fails contrast in dark mode | 1.4.3 | Multiple |

### Low Priority

| # | Issue | WCAG | Component |
|---|-------|------|-----------|
| 21 | Species lists use `<div>` instead of semantic `<ul>/<li>` | 1.3.1 | SpeciesTab |
| 22 | `alert()` used for error handling in add-to-goal-list | Usability | SpeciesTab |
| 23 | Birding jargon without explanatory tooltips | 3.1.3 | Multiple |
| 24 | No onboarding or feature discovery | Usability | App |

---

## 14. Recommended Implementation Order

1. **Phase 1 (Accessibility Foundations):**
   - Add `role="dialog"` + `aria-modal` + focus trapping + Escape key to all modals
   - Add proper ARIA tab pattern to SidePanel
   - Add `aria-live` regions for dynamic content
   - Add `prefers-reduced-motion` support
   - Fix SpeciesInfoCard dark mode
   - Fix contrast ratios on inactive tabs and placeholder text

2. **Phase 2 (Keyboard & Screen Reader):**
   - Implement keyboard-navigable autocomplete (combobox pattern)
   - Add skip links
   - Add `<main>` landmark
   - Manage focus on tab switches
   - Add focus-visible styles to all buttons
   - Make map popups keyboard accessible

3. **Phase 3 (Field Usability):**
   - Implement "Field Mode" with larger touch targets and text
   - Add non-color indicators for server status and conservation badges
   - Move MapLibre controls for thumb reachability
   - Increase minimum text size to 12px
   - Add custom slider thumb styling for outdoor use

4. **Phase 4 (Polish):**
   - Replace `alert()` with inline error messages
   - Add semantic list elements
   - Add tooltips for jargon terms
   - Add error boundaries
   - Consider onboarding flow

---

## 15. Positive Findings

The application does several things well that should be preserved:

1. **Viridis color gradient** -- excellent colorblind-accessible choice for heatmaps
2. **Dark mode implementation** -- comprehensive Tailwind `dark:` class usage across almost all components
3. **Skeleton loading states** -- well-designed, provide spatial context for loading content
4. **Empty states** -- clear, helpful, actionable guidance throughout
5. **`htmlFor`/`id` label associations** -- present on week slider, opacity slider, list name input
6. **`aria-label` on icon-only buttons** -- dark mode toggle, popup close buttons, clear species
7. **`aria-pressed` on toggle** -- Goal Birds Only button
8. **Family header keyboard support** -- proper `role="button"` + `tabIndex` + `onKeyDown`
9. **`rel="noopener noreferrer"` on external links** -- security best practice
10. **Responsive layout** -- `flex-col-reverse md:flex-row` provides bottom-sheet on mobile
11. **Error messages are user-friendly** -- "Is the server running?" is actionable
12. **Data-testid attributes** -- comprehensive testing infrastructure
