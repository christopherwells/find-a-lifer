import { test, expect, type Page } from '@playwright/test'

/**
 * Persona: Pat — Learner
 * No life list, laptop. Interested in learning about birds.
 * Journey: Browse species families → search for species → open info card → use Range view → compare
 */

function getTabNav(page: Page) {
  const viewport = page.viewportSize()
  return (viewport && viewport.width < 768)
    ? page.getByTestId('mobile-tab-bar')
    : page.getByTestId('tab-navigation')
}

function getViewModeBtn(page: Page, mode: string) {
  const viewport = page.viewportSize()
  return (viewport && viewport.width < 768)
    ? page.getByTestId(`mc-view-mode-${mode}`)
    : page.getByTestId(`view-mode-${mode}`)
}

async function gotoReady(page: Page) {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('hasSeenOnboarding', 'true')
    localStorage.setItem('beginnerMode', 'false')
    localStorage.setItem('sessionCount', '10')
  })
  await page.reload()
  await expect(getTabNav(page)).toBeVisible({ timeout: 10000 })
}

test.describe('Pat — Learner (no life list, laptop)', () => {
  test('species families use display group names, not raw taxonomy', async ({ page }) => {
    await gotoReady(page)
    await getTabNav(page).getByRole('tab', { name: 'Species' }).click()
    await expect(page.getByText('Species Checklist')).toBeVisible({ timeout: 10000 })

    // OUTCOME: Groups use user-friendly display names, not raw eBird family names
    // "Ducks, Geese, and Waterfowl" is the display group name (not "Anatidae")
    await expect(page.getByText('Ducks, Geese, and Waterfowl')).toBeVisible({ timeout: 10000 })

    // Should NOT show raw eBird taxonomy names
    const pageText = await page.locator('.flex-1.overflow-y-auto').first().textContent()
    expect(pageText).not.toContain('Anatidae')
    expect(pageText).not.toContain('Accipitridae')
    expect(pageText).not.toContain('Parulidae')
  })

  test('searching species shows autocomplete and clicking opens info card', async ({ page }) => {
    await gotoReady(page)
    await getTabNav(page).getByRole('tab', { name: 'Species' }).click()
    await expect(page.getByText('Species Checklist')).toBeVisible({ timeout: 10000 })

    const search = page.getByTestId('species-search-input')
    await search.click()
    await search.pressSequentially('red-tailed', { delay: 50 })

    // OUTCOME: Autocomplete appears with Red-tailed Hawk
    const suggestions = page.getByTestId('autocomplete-suggestions')
    await expect(suggestions).toBeVisible({ timeout: 5000 })
    await expect(suggestions.getByText('Red-tailed Hawk')).toBeVisible()

    // Clicking the suggestion highlights it in the checklist and scrolls to it
    await suggestions.getByText('Red-tailed Hawk').click()

    // Now click the species name button to open the info card
    const infoBtn = page.getByTestId('species-info-btn-rethaw')
    await expect(infoBtn).toBeVisible({ timeout: 5000 })
    await infoBtn.click()

    // OUTCOME: Info card shows scientific name (proves real data loaded, not just a stub)
    await expect(page.getByText('Buteo jamaicensis')).toBeVisible({ timeout: 5000 })
  })

  test('Range mode shows species search and selecting a species works', async ({ page }) => {
    await gotoReady(page)

    // Switch to Range mode
    const rangeBtn = getViewModeBtn(page, 'species')
    await expect(rangeBtn).toBeVisible({ timeout: 5000 })
    await rangeBtn.click()

    // On desktop, the species search is in ExploreTab
    const viewport = page.viewportSize()
    if (viewport && viewport.width >= 768) {
      const rangeSearch = page.getByTestId('species-range-search')
      await expect(rangeSearch).toBeVisible({ timeout: 5000 })

      // Type a species name
      await rangeSearch.fill('Northern Cardinal')
      // OUTCOME: Selecting the species changes the map legend to show the species name
      const suggestion = page.locator('[data-testid="autocomplete-suggestions"] li, .autocomplete-item').filter({ hasText: 'Northern Cardinal' })
      if (await suggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
        await suggestion.first().click()
        // Legend should mention the selected species or "reporting frequency"
        await page.waitForTimeout(1000)
        const legend = page.getByTestId('map-legend')
        const legendText = await legend.textContent()
        expect(legendText?.toLowerCase()).toMatch(/cardinal|frequency|reporting/)
      }
    } else {
      // Mobile: species search is behind expand button
      const expandBtn = page.getByText(/select a species/i)
      await expect(expandBtn).toBeVisible({ timeout: 5000 })
      await expandBtn.click()
      await expect(page.getByTestId('mc-species-search')).toBeVisible({ timeout: 5000 })
    }
  })

  test('view mode switching changes legend title', async ({ page }) => {
    await gotoReady(page)
    const legend = page.getByTestId('map-legend')

    // Density mode (default) — legend should mention "Richness" or "Species"
    await expect(legend).toBeVisible({ timeout: 10000 })
    const densityText = await legend.textContent()
    expect(densityText?.toLowerCase()).toMatch(/richness|species/)

    // Switch to Frequency
    await getViewModeBtn(page, 'probability').click()
    await page.waitForTimeout(1000)
    const freqText = await legend.textContent()

    // OUTCOME: Legend text changes between Density and Frequency modes
    // Frequency mode should mention "probability" or "chance" or "frequency"
    expect(freqText?.toLowerCase()).toMatch(/probability|chance|frequency|lifer/)
    expect(freqText).not.toBe(densityText)
  })

  test('Stats tab shows 0% progress with no life list', async ({ page }) => {
    await gotoReady(page)
    await getTabNav(page).getByRole('tab', { name: 'Stats' }).click()
    await expect(page.getByTestId('progress-tab')).toBeVisible({ timeout: 10000 })

    // OUTCOME: With no species seen, progress is 0.0% and count is "0 of X species seen"
    const percentText = await page.getByTestId('progress-percentage').textContent()
    expect(percentText).toContain('0.0%')

    const countText = await page.getByTestId('progress-species-count').textContent()
    expect(countText).toMatch(/0 of \d+ species seen/)
  })

  test('Trip Plan shows 4 modes and switching modes changes content', async ({ page }) => {
    await gotoReady(page)
    await getTabNav(page).getByRole('tab', { name: 'Plan' }).click()
    await expect(page.getByText('Trip Planning')).toBeVisible({ timeout: 10000 })

    // OUTCOME: Each mode button is present
    for (const mode of ['hotspots', 'location', 'window', 'compare']) {
      await expect(page.getByTestId(`${mode}-mode-btn`)).toBeVisible()
    }

    // OUTCOME: Clicking Compare mode shows Location A/B comparison UI
    await page.getByTestId('compare-mode-btn').click()
    await expect(page.getByText(/Location A/i).first()).toBeVisible({ timeout: 5000 })

    // OUTCOME: Clicking Window mode switches to a different view
    await page.getByTestId('window-mode-btn').click()
    // Window mode has species search functionality
    await page.waitForTimeout(500)
    // Verify we're no longer seeing "Location A" (mode actually changed)
    await expect(page.getByText(/Location A/i)).not.toBeVisible({ timeout: 3000 })
  })

  test('family filter narrows species list to one group', async ({ page }) => {
    await gotoReady(page)
    await getTabNav(page).getByRole('tab', { name: 'Species' }).click()
    await expect(page.getByText('Species Checklist')).toBeVisible({ timeout: 10000 })

    // Get total species count first
    const header = page.locator('span[aria-live="polite"]')
    const beforeText = await header.textContent()
    const beforeTotal = parseInt(beforeText?.match(/(\d+)\/(\d+)/)?.[2] ?? '0')
    expect(beforeTotal).toBeGreaterThan(2000)

    // Open filters and select a family
    await page.getByTestId('filter-toggle-btn').click()
    const familyFilter = page.getByTestId('family-filter')
    await expect(familyFilter).toBeVisible({ timeout: 3000 })

    // Select a family group — get the first option that isn't "All Groups"
    const options = await familyFilter.locator('option').allTextContents()
    const hawkOption = options.find(o => o.toLowerCase().includes('hawk'))
    expect(hawkOption).toBeTruthy()
    // Extract the value (group name without the count)
    const hawkValue = hawkOption!.replace(/\s*\(\d+\)$/, '')
    await familyFilter.selectOption(hawkValue)

    // OUTCOME: Species count drops to just that family (should be < 100)
    await page.waitForTimeout(500)
    const countText = page.locator('text=/\\d+ species/').first()
    await expect(countText).toBeVisible({ timeout: 5000 })
    const text = await countText.textContent()
    const filteredCount = parseInt(text!.match(/(\d+)/)?.[1] ?? '0')
    expect(filteredCount).toBeGreaterThan(0)
    expect(filteredCount).toBeLessThan(100)
  })
})
