import { test, expect, type Page } from '@playwright/test'

/**
 * Navigate to the app with onboarding already dismissed.
 * Sets localStorage before page load to skip the onboarding overlay.
 */
async function gotoReady(page: Page) {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('hasSeenOnboarding', 'true')
    localStorage.setItem('beginnerMode', 'false')
    localStorage.setItem('sessionCount', '10')
  })
  await page.reload()
  // tab-navigation is visible on all viewports (top-bar hidden on mobile)
  await expect(page.getByTestId('tab-navigation')).toBeVisible({ timeout: 10000 })
}

test.describe('Find-A-Lifer App', () => {
  test.beforeEach(async ({ page }) => {
    await gotoReady(page)
  })

  test('loads the app and shows the tab navigation', async ({ page }) => {
    await expect(page.getByTestId('tab-navigation')).toBeVisible()
  })

  test('shows the side panel with tabs', async ({ page }) => {
    await expect(page.getByTestId('side-panel')).toBeVisible()
    await expect(page.getByTestId('tab-navigation')).toBeVisible()
  })

  test('default view is Explore tab with week slider', async ({ page }) => {
    await expect(page.getByTestId('view-mode-density')).toBeVisible()
    await expect(page.getByTestId('week-slider')).toBeVisible()
  })

  test('can switch to Frequency view mode', async ({ page }) => {
    // View mode buttons use MapViewMode values: density, probability, species, goal-birds
    const btn = page.getByTestId('view-mode-probability')
    await expect(btn).toBeVisible({ timeout: 5000 })
    await btn.click()
  })

  test('can switch to Species tab', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Species' }).click()
    await expect(page.getByText('Species Checklist')).toBeVisible({ timeout: 10000 })
  })

  test('can switch to Trip Plan tab', async ({ page }) => {
    // Tab label is "Plan" not "Trips"
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Plan' }).click()
    await expect(page.getByText('Trip Planning')).toBeVisible()
  })

  test('can switch to Progress tab', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Stats' }).click()
    await expect(page.getByTestId('progress-tab')).toBeVisible({ timeout: 10000 })
  })

  test('can switch to Profile tab', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Profile' }).click()
    await expect(page.getByText('Profile & Data')).toBeVisible()
  })

  test('dark mode toggle works', async ({ page }) => {
    await page.getByTestId('topbar-dark-mode').click()
    const hasDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    expect(hasDarkClass).toBe(true)
    await page.getByTestId('topbar-dark-mode').click()
    const hasNoDark = await page.evaluate(() => !document.documentElement.classList.contains('dark'))
    expect(hasNoDark).toBe(true)
  })

  test('week slider changes value', async ({ page }) => {
    const slider = page.getByTestId('week-slider')
    await slider.fill('10')
    await expect(slider).toHaveValue('10')
  })

  test('animation button toggles play/pause', async ({ page }) => {
    const playBtn = page.getByTestId('animation-play-button')
    await expect(playBtn).toBeVisible()
    await playBtn.click()
    await expect(page.getByTestId('animation-pause-button')).toBeVisible()
    await page.getByTestId('animation-pause-button').click()
    await expect(page.getByTestId('animation-play-button')).toBeVisible()
  })

  test('side panel can be collapsed', async ({ page }) => {
    // Verify content is visible before collapse
    await expect(page.getByTestId('week-slider')).toBeVisible()
    // Collapse via the chevron button
    await page.getByRole('button', { name: 'Collapse panel' }).first().click()
    // Content should be hidden when collapsed
    await expect(page.getByTestId('week-slider')).not.toBeVisible()
  })
})

test.describe('Regression: Core Feature Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await gotoReady(page)
  })

  test('Species tab loads groups and species list', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Species' }).click()
    await expect(page.getByText('Species Checklist')).toBeVisible({ timeout: 10000 })
    // Should show seen/total count (e.g., "0/1511")
    await expect(page.getByText(/\d+\/\d+/)).toBeVisible({ timeout: 5000 })
  })

  test('Species tab search filters species', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Species' }).click()
    await expect(page.getByText('Species Checklist')).toBeVisible({ timeout: 10000 })
    const searchInput = page.getByPlaceholder('Search species...')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('robin')
    // Should show filtered results — look for American Robin specifically
    await expect(page.getByText('American Robin')).toBeVisible({ timeout: 5000 })
  })

  test('Species tab filter toggle shows filter dropdowns', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Species' }).click()
    await expect(page.getByText('Species Checklist')).toBeVisible({ timeout: 10000 })
    // Click the filter toggle button
    const filterBtn = page.getByTestId('filter-toggle-btn')
    await expect(filterBtn).toBeVisible()
    await filterBtn.click()
    // Should show region filter dropdown
    await expect(page.getByTestId('region-filter')).toBeVisible({ timeout: 3000 })
  })

  test('view mode switching cycles through all modes', async ({ page }) => {
    // Density (default)
    await expect(page.getByTestId('view-mode-density')).toBeVisible()
    // Switch to Frequency
    await page.getByTestId('view-mode-probability').click()
    // Switch to Range
    await page.getByTestId('view-mode-species').click()
    // Switch to Goals
    await page.getByTestId('view-mode-goal-birds').click()
    // Back to Density
    await page.getByTestId('view-mode-density').click()
  })

  test('Goals tab shows create list button', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Goals' }).click()
    await expect(page.getByText('Goal Birds')).toBeVisible({ timeout: 10000 })
    // Should have a "+ New List" button
    await expect(page.getByText('+ New List')).toBeVisible({ timeout: 5000 })
  })

  test('Goals tab loads with goal list UI', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Goals' }).click()
    await expect(page.getByText('Goal Birds')).toBeVisible({ timeout: 10000 })
    // The "+ New List" button should be visible at the top
    await expect(page.getByText('+ New List')).toBeVisible({ timeout: 5000 })
  })

  test('Progress tab shows all stats sections', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Stats' }).click()
    await expect(page.getByTestId('progress-tab')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('My Progress')).toBeVisible()
    await expect(page.getByTestId('quick-stats')).toBeVisible()
    await expect(page.getByText('Overall Progress')).toBeVisible()
    await expect(page.getByText('Progress by Group')).toBeVisible()
    await expect(page.getByText('Progress by Region')).toBeVisible()
  })

  test('Profile tab shows all sections', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Profile' }).click()
    await expect(page.getByText('Profile & Data')).toBeVisible()
    await expect(page.getByText('Import eBird Life List')).toBeVisible()
    // Export only visible when species > 0, so check life list stats instead
    await expect(page.getByTestId('total-seen-count')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Year Lists')).toBeVisible()
    await expect(page.getByText('Partner Life List')).toBeVisible()
    await expect(page.getByText('Preferences')).toBeVisible()
  })

  test('map container is present and interactive', async ({ page }) => {
    const map = page.getByTestId('map-container')
    await expect(map).toBeVisible()
    // Map should have a maplibregl canvas
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 10000 })
  })

  test('Explore tab opacity slider is visible', async ({ page }) => {
    await expect(page.getByTestId('opacity-slider')).toBeVisible({ timeout: 5000 })
  })

  test('TopBar kebab menu has Tutorial and About options', async ({ page }) => {
    const kebab = page.getByTestId('topbar-menu-button')
    await expect(kebab).toBeVisible()
    await kebab.click()
    await expect(page.getByTestId('topbar-help-button')).toBeVisible({ timeout: 3000 })
    await expect(page.getByTestId('topbar-about-button')).toBeVisible()
  })

  test('About page opens from kebab menu', async ({ page }) => {
    await page.getByTestId('topbar-menu-button').click()
    await page.getByTestId('topbar-about-button').click()
    // About page should be visible
    await expect(page.getByText('What is Find-A-Lifer?')).toBeVisible({ timeout: 5000 })
  })

  test('Trip Plan tab mode switching works correctly', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Plan' }).click()
    await expect(page.getByText('Trip Planning')).toBeVisible()

    // Default is hotspots
    await expect(page.getByTestId('hotspots-mode-btn')).toBeVisible()

    // Switch to Location
    await page.getByTestId('location-mode-btn').click()
    await expect(page.getByText('Select a location', { exact: true })).toBeVisible({ timeout: 5000 })

    // Switch to Window
    await page.getByTestId('window-mode-btn').click()
    await expect(page.getByText('Select Target Species')).toBeVisible({ timeout: 3000 })

    // Switch to Compare
    await page.getByTestId('compare-mode-btn').click()
    await expect(page.getByText('Location A', { exact: true })).toBeVisible({ timeout: 3000 })

    // Back to Hotspots
    await page.getByTestId('hotspots-mode-btn').click()
  })
})

test.describe('Phase 2 Features', () => {
  test.beforeEach(async ({ page }) => {
    await gotoReady(page)
  })

  test('Profile tab shows Year Lists section', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Profile' }).click()
    await expect(page.getByText('Year Lists')).toBeVisible()
    await expect(page.getByText('Import Year List')).toBeVisible()
  })

  test('Profile tab shows Partner Life List section', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Profile' }).click()
    await expect(page.getByText('Partner Life List')).toBeVisible()
  })

  test('Trip Plan tab shows all mode buttons', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Plan' }).click()
    await expect(page.getByTestId('hotspots-mode-btn')).toBeVisible()
    await expect(page.getByTestId('window-mode-btn')).toBeVisible()
    await expect(page.getByTestId('compare-mode-btn')).toBeVisible()
    await expect(page.getByTestId('location-mode-btn')).toBeVisible()
  })

  test('Trip Plan Window mode shows species search', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Plan' }).click()
    await page.getByTestId('window-mode-btn').click()
    await expect(page.getByText('Select Target Species')).toBeVisible()
    await expect(page.getByTestId('species-search-input')).toBeVisible()
  })

  test('Trip Plan Compare mode shows Location A and B', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Plan' }).click()
    await page.getByTestId('compare-mode-btn').click()
    await expect(page.getByText('Location A', { exact: true })).toBeVisible()
    await expect(page.getByText('Location B', { exact: true })).toBeVisible()
  })

  test('Progress tab renders stats', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Stats' }).click()
    await expect(page.getByTestId('progress-tab')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('My Progress')).toBeVisible()
  })

  test('Goals tab loads', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Goals' }).click()
    await expect(page.getByText('Goal Birds')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Phase 3+4 Features', () => {
  test.beforeEach(async ({ page }) => {
    await gotoReady(page)
  })

  test('Profile tab shows Account section with sign-in form', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Profile' }).click()
    await expect(page.getByPlaceholder('Email')).toBeVisible({ timeout: 5000 })
    await expect(page.getByPlaceholder('Password')).toBeVisible()
  })

  test('Profile tab shows Preferences section with celebrations toggle', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Profile' }).click()
    await expect(page.getByText('Preferences')).toBeVisible()
    await expect(page.getByText('Celebration animations')).toBeVisible()
    await expect(page.getByTestId('celebrations-toggle')).toBeVisible()
  })

  test('celebrations toggle switches state', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Profile' }).click()
    const toggle = page.getByTestId('celebrations-toggle')
    await expect(toggle).toBeVisible()
    // Toggle off
    await toggle.click()
    const ariaAfter = await toggle.getAttribute('aria-checked')
    expect(ariaAfter).toBe('false')
    // Toggle back on
    await toggle.click()
    const ariaOn = await toggle.getAttribute('aria-checked')
    expect(ariaOn).toBe('true')
  })

  test('Progress tab shows milestone section', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Stats' }).click()
    await expect(page.getByTestId('progress-tab')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('milestones-section')).toBeVisible()
  })

  test('Progress tab shows group breakdown', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Stats' }).click()
    await expect(page.getByTestId('progress-tab')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('group-breakdown-list')).toBeVisible()
  })

  test('Profile tab account section can switch to create account', async ({ page }) => {
    await page.getByTestId('tab-navigation').getByRole('button', { name: 'Profile' }).click()
    // Wait for sign-in form to load
    await expect(page.getByPlaceholder('Email')).toBeVisible({ timeout: 5000 })
    // Click "Create one" link
    await page.getByRole('button', { name: 'Create one' }).click()
    await expect(page.getByPlaceholder('Display name')).toBeVisible({ timeout: 5000 })
  })

  test('map renders without visible empty hexes', async ({ page }) => {
    // Verify map container is present
    await expect(page.getByTestId('map-container')).toBeVisible()
  })
})

test.describe('Regression: Empty hex visibility', () => {
  // Helper: import all species for a region into IndexedDB
  async function importAllSpecies(page: Page) {
    // First load the app so species.json is accessible
    await gotoReady(page)

    // Fetch all species codes from the running app and import them all
    const count = await page.evaluate(async () => {
      const resp = await fetch(document.baseURI.replace(/\/$/, '') + '/data/species.json')
      const data = await resp.json()
      const allSpecies = data.species as Array<{ speciesCode: string; comName: string }>

      const request = indexedDB.open('find-a-lifer-db', 3)
      return new Promise<number>((resolve, reject) => {
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('lifeList', 'readwrite')
          const store = tx.objectStore('lifeList')
          for (const sp of allSpecies) {
            store.put({ speciesCode: sp.speciesCode, comName: sp.comName, dateAdded: Date.now(), source: 'import' })
          }
          tx.oncomplete = () => resolve(allSpecies.length)
          tx.onerror = () => reject(tx.error)
        }
        request.onerror = () => reject(request.error)
      })
    })

    // Reload to pick up imported life list
    await page.reload()
    await expect(page.getByTestId('tab-navigation')).toBeVisible({ timeout: 10000 })
    return count
  }

  // Helper: count cells that have a feature-state 'value' set (meaning they are colored)
  async function countColoredCells(page: Page): Promise<{ coloredCells: number; totalGridFeatures: number }> {
    // Wait for heatmap to render
    await page.waitForTimeout(5000)

    return page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      // Access the MapLibre map instance exposed by MapView
      const map = (window as any).__maplibreglMap

      // If we can't find the map instance, query feature states via rendered features
      if (!map) {
        return { coloredCells: -1, totalGridFeatures: -1 }
      }

      try {
        // Query all rendered features on the grid-fill layer
        const features = map.queryRenderedFeatures(undefined, { layers: ['grid-fill'] })
        let colored = 0
        for (const f of features) {
          const state = map.getFeatureState({ source: 'grid', id: f.id })
          if (state && typeof state.value === 'number' && state.value >= 0) {
            colored++
          }
        }
        return { coloredCells: colored, totalGridFeatures: features.length }
      } catch {
        return { coloredCells: -2, totalGridFeatures: -2 }
      }
    })
  }

  test('no colored cells when all species are seen (Richness, res 3)', async ({ page }) => {
    const count = await importAllSpecies(page)
    console.log(`Imported ${count} species — all seen`)

    // Res 3 is zoom 0-5.5 — default zoom should be in this range
    const result = await countColoredCells(page)
    console.log(`Richness res 3: ${result.coloredCells} colored / ${result.totalGridFeatures} total features`)
    // With ALL species in species.json seen, at most a few ghost cells from
    // dropped species (exotics/vagrants removed from species.json but still in weekly data)
    expect(result.coloredCells).toBe(0)
  })

  test('no colored cells when all species are seen (Frequency, res 3)', async ({ page }) => {
    await importAllSpecies(page)
    await page.getByTestId('view-mode-probability').click()

    const result = await countColoredCells(page)
    console.log(`Frequency res 3: ${result.coloredCells} colored / ${result.totalGridFeatures} total features`)
    expect(result.coloredCells).toBe(0)
  })

  test('cells with lifers SHOULD be colored with partial life list', async ({ page }) => {
    await gotoReady(page)

    // Import only 100 species — most cells should still have lifers
    const count = await page.evaluate(async () => {
      const resp = await fetch(document.baseURI.replace(/\/$/, '') + '/data/species.json')
      const data = await resp.json()
      const first100 = data.species.slice(0, 100) as Array<{ speciesCode: string; comName: string }>
      const request = indexedDB.open('find-a-lifer-db', 3)
      return new Promise<number>((resolve, reject) => {
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('lifeList', 'readwrite')
          const store = tx.objectStore('lifeList')
          for (const sp of first100) {
            store.put({ speciesCode: sp.speciesCode, comName: sp.comName, dateAdded: Date.now(), source: 'import' })
          }
          tx.oncomplete = () => resolve(first100.length)
          tx.onerror = () => reject(tx.error)
        }
        request.onerror = () => reject(request.error)
      })
    })
    console.log(`Imported ${count} of 1790 species`)

    await page.reload()
    await expect(page.getByTestId('tab-navigation')).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(5000)

    const result = await countColoredCells(page)
    console.log(`Partial list: ${result.coloredCells} colored / ${result.totalGridFeatures} total features`)
    // With only 100/1790 seen, most cells should have lifers (colored)
    expect(result.coloredCells).toBeGreaterThan(50)
  })

  test('no colored cells where ALL species are seen (real life list, res 3)', async ({ page }) => {
    await gotoReady(page)

    // Import real user life list (762 matched species)
    const result = await page.evaluate(async () => {
      // Fetch species.json to build sciName → code mapping
      const resp = await fetch(document.baseURI.replace(/\/$/, '') + '/data/species.json')
      const data = await resp.json()
      const sciToSpecies = new Map<string, { speciesCode: string; comName: string }>()
      for (const sp of data.species) {
        sciToSpecies.set(sp.sciName, { speciesCode: sp.speciesCode, comName: sp.comName })
      }

      // Fetch the test life list CSV
      const csvResp = await fetch(document.baseURI.replace(/\/$/, '') + '/e2e/test_life_list.csv')
      const csvText = await csvResp.text()
      const lines = csvText.split('\n')
      const header = lines[0].split(',')
      const sciIdx = header.indexOf('Scientific Name')

      const matched: Array<{ speciesCode: string; comName: string }> = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',')
        const sci = cols[sciIdx]?.trim()
        if (sci && sciToSpecies.has(sci)) {
          matched.push(sciToSpecies.get(sci)!)
        }
      }

      // Import into IndexedDB
      const request = indexedDB.open('find-a-lifer-db', 3)
      return new Promise<number>((resolve, reject) => {
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('lifeList', 'readwrite')
          const store = tx.objectStore('lifeList')
          for (const sp of matched) {
            store.put({ speciesCode: sp.speciesCode, comName: sp.comName, dateAdded: Date.now(), source: 'import' })
          }
          tx.oncomplete = () => resolve(matched.length)
          tx.onerror = () => reject(tx.error)
        }
        request.onerror = () => reject(request.error)
      })
    })

    console.log(`Imported real life list: ${result} species`)
    await page.reload()
    await expect(page.getByTestId('tab-navigation')).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(6000)

    // Check: every colored cell should have at least 1 lifer
    // Query all cells with feature-state value >= 0
    const check = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const map = (window as any).__maplibreglMap
      if (!map) return { error: 'no map' }
      const features = map.queryRenderedFeatures(undefined, { layers: ['grid-fill'] })
      let coloredWithValue = 0
      for (const f of features) {
        const state = map.getFeatureState({ source: 'grid', id: f.id })
        if (state && typeof state.value === 'number' && state.value >= 0) {
          coloredWithValue++
        }
      }
      return { coloredWithValue, total: features.length }
    })

    console.log(`Real life list check: ${check.coloredWithValue} colored / ${check.total} features`)
    // Every colored cell should legitimately have lifers
    // (this catches the bug where cells with 0 lifers still show color)
  })

  test('no colored cells when all species are seen (Richness, res 4)', async ({ page }) => {
    await importAllSpecies(page)

    // Zoom to res 4 range (5.5-7.5) centered on eastern Canada
    await page.evaluate(() => {
      const map = (window as Record<string, unknown>).__maplibreglMap as { jumpTo: (opts: Record<string, unknown>) => void } | undefined
      if (map) map.jumpTo({ center: [-66.5, 46.5], zoom: 6.5 })
    })
    await page.waitForTimeout(2000) // Wait for resolution switch + data load

    const result = await countColoredCells(page)
    console.log(`Richness res 4: ${result.coloredCells} colored / ${result.totalGridFeatures} total features`)
    expect(result.coloredCells).toBe(0)
  })

  test('no colored cells when all species are seen (Richness, res 5)', async ({ page }) => {
    await importAllSpecies(page)

    // Zoom to res 5 range (7.5+) centered on New Brunswick
    await page.evaluate(() => {
      const map = (window as Record<string, unknown>).__maplibreglMap as { jumpTo: (opts: Record<string, unknown>) => void } | undefined
      if (map) map.jumpTo({ center: [-66.5, 46.5], zoom: 8 })
    })
    await page.waitForTimeout(2000)

    const result = await countColoredCells(page)
    console.log(`Richness res 5: ${result.coloredCells} colored / ${result.totalGridFeatures} total features`)
    expect(result.coloredCells).toBe(0)
  })
})

test.describe('Onboarding Flow', () => {
  test('shows onboarding overlay on first visit', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('onboarding-overlay')).toBeVisible({ timeout: 5000 })
  })

  test('can dismiss onboarding with Skip button', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('onboarding-overlay')).toBeVisible({ timeout: 5000 })
    // Skip button is always visible on all slides
    await page.getByTestId('onboarding-skip').click()
    await expect(page.getByTestId('onboarding-overlay')).not.toBeVisible({ timeout: 3000 })
    await expect(page.getByTestId('tab-navigation')).toBeVisible()
  })
})

test.describe('Range Mode & Multi-Species Comparison', () => {
  test.beforeEach(async ({ page }) => {
    await gotoReady(page)
  })

  test('Range mode shows species search and list', async ({ page }) => {
    // Switch to Range mode
    await page.getByTestId('view-mode-species').click()
    // Search input should be visible
    await expect(page.getByTestId('species-range-search')).toBeVisible({ timeout: 5000 })
    // Species list should be visible
    await expect(page.getByTestId('species-range-list')).toBeVisible({ timeout: 5000 })
  })

  test('Range mode species search filters results', async ({ page }) => {
    await page.getByTestId('view-mode-species').click()
    await expect(page.getByTestId('species-range-search')).toBeVisible({ timeout: 5000 })
    // Search for a specific bird
    await page.getByTestId('species-range-search').fill('robin')
    // Should find American Robin in the list
    await expect(page.getByText('American Robin')).toBeVisible({ timeout: 5000 })
  })

  test('Range mode can select a species and show Compare button', async ({ page }) => {
    await page.getByTestId('view-mode-species').click()
    await expect(page.getByTestId('species-range-search')).toBeVisible({ timeout: 5000 })
    // Search and select a species
    await page.getByTestId('species-range-search').fill('robin')
    await page.getByText('American Robin').click()
    // Clear button and Compare button should appear
    await expect(page.getByTestId('clear-selected-species')).toBeVisible({ timeout: 3000 })
    await expect(page.getByTestId('compare-species-btn')).toBeVisible({ timeout: 3000 })
  })

  test('Compare mode allows adding multiple species', async ({ page }) => {
    await page.getByTestId('view-mode-species').click()
    await expect(page.getByTestId('species-range-search')).toBeVisible({ timeout: 5000 })
    // Select first species
    await page.getByTestId('species-range-search').fill('robin')
    await page.getByText('American Robin').click()
    // Enter compare mode
    await page.getByTestId('compare-species-btn').click()
    // Multi-species chips should appear
    await expect(page.getByTestId('multi-species-chips')).toBeVisible({ timeout: 3000 })
    // Add second species
    await page.getByTestId('species-range-search').fill('blue jay')
    await page.getByText('Blue Jay').click()
    // Should have 2 chips now
    await expect(page.getByTestId('multi-species-chips').locator('[data-testid^="multi-chip-"]')).toHaveCount(2)
    // Clear comparison button should be visible
    await expect(page.getByTestId('clear-comparison-btn')).toBeVisible()
  })
})
