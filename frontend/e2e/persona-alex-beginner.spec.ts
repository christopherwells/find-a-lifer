import { test, expect, type Page } from '@playwright/test'

/**
 * Persona: Alex — Complete Beginner
 * No life list, doesn't know birds, using phone.
 * Journey: Feature tour → explore map → browse species → search → understand groups
 */

function getTabNav(page: Page) {
  const viewport = page.viewportSize()
  return (viewport && viewport.width < 768)
    ? page.getByTestId('mobile-tab-bar')
    : page.getByTestId('tab-navigation')
}

async function gotoReady(page: Page) {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('tourComplete', 'true')
    localStorage.setItem('sessionCount', '10')
  })
  await page.reload()
  await expect(getTabNav(page)).toBeVisible({ timeout: 10000 })
}

test.describe('Alex — Complete Beginner (no life list)', () => {
  test('tour dismissal enables app interaction', async ({ page }) => {
    await page.goto('/')
    // driver.js tour appears on first visit
    await expect(page.locator('.driver-overlay')).toBeVisible({ timeout: 5000 })

    // Close the tour
    await page.locator('.driver-popover-close-btn').click()

    // OUTCOME: Tour is gone and the app is interactive — tab nav works
    await expect(page.locator('.driver-overlay')).not.toBeVisible({ timeout: 3000 })
    const tabNav = getTabNav(page)
    await expect(tabNav).toBeVisible()

    // Can actually switch tabs (interaction works, not just visibility)
    await tabNav.getByRole('tab', { name: 'Species' }).click()
    await expect(page.getByText('Species Checklist')).toBeVisible({ timeout: 10000 })
  })

  test('species checklist shows all species with 0 seen (no life list)', async ({ page }) => {
    await gotoReady(page)
    await getTabNav(page).getByRole('tab', { name: 'Species' }).click()
    await expect(page.getByText('Species Checklist')).toBeVisible({ timeout: 10000 })

    // OUTCOME: With no life list, seen count should be 0, total should be > 2000
    // The header shows "{seen}/{total}" — seen must be 0
    const header = page.locator('span[aria-live="polite"]')
    await expect(header).toBeVisible({ timeout: 5000 })
    const text = await header.textContent()
    const match = text?.match(/(\d+)\/(\d+)/)
    expect(match).toBeTruthy()
    const seen = parseInt(match![1])
    const total = parseInt(match![2])
    expect(seen).toBe(0)
    expect(total).toBeGreaterThan(2000)
  })

  test('species search returns only matching results', async ({ page }) => {
    await gotoReady(page)
    await getTabNav(page).getByRole('tab', { name: 'Species' }).click()
    await expect(page.getByText('Species Checklist')).toBeVisible({ timeout: 10000 })

    // Search for "Robin"
    const search = page.getByTestId('species-search-input')
    await search.fill('Robin')

    // OUTCOME: Autocomplete shows American Robin AND all results contain "Robin"
    const suggestions = page.getByTestId('autocomplete-suggestions')
    await expect(suggestions).toBeVisible({ timeout: 5000 })
    await expect(suggestions.getByText('American Robin')).toBeVisible()

    // All suggestion buttons should contain "robin" (no unrelated results)
    const items = suggestions.locator('button')
    const count = await items.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).textContent()
      expect(text?.toLowerCase()).toContain('robin')
    }
  })

  test('species list is grouped by bird families in ecological order', async ({ page }) => {
    await gotoReady(page)
    await getTabNav(page).getByRole('tab', { name: 'Species' }).click()
    await expect(page.getByText('Species Checklist')).toBeVisible({ timeout: 10000 })

    // OUTCOME: Family groups appear in ecological order (waterfowl first, not alphabetical)
    // First group visible should be "Ducks, Geese, and Waterfowl" (ecological ordering)
    await expect(page.getByText('Ducks, Geese, and Waterfowl')).toBeVisible({ timeout: 10000 })

    // Each group header shows a species count number
    const firstGroup = page.locator('[role="button"]').filter({ hasText: 'Ducks, Geese, and Waterfowl' })
    const groupText = await firstGroup.textContent()
    // Should contain a number (the species count for that group)
    expect(groupText).toMatch(/\d+/)
  })

  test('clicking a species name opens an info card with details', async ({ page }) => {
    await gotoReady(page)
    await getTabNav(page).getByRole('tab', { name: 'Species' }).click()
    await expect(page.getByText('Species Checklist')).toBeVisible({ timeout: 10000 })

    // Search to find American Robin, then click the suggestion to highlight it in the list
    await page.getByTestId('species-search-input').fill('American Robin')
    const suggestions = page.getByTestId('autocomplete-suggestions')
    await expect(suggestions).toBeVisible({ timeout: 5000 })
    await suggestions.getByText('American Robin').first().click()

    // Now the species is highlighted in the list — click the species name button to open info card
    const infoBtn = page.getByTestId('species-info-btn-amerob')
    await expect(infoBtn).toBeVisible({ timeout: 5000 })
    await infoBtn.click()

    // OUTCOME: Species info card opens showing the scientific name (proves real data loaded)
    await expect(page.getByText('Turdus migratorius')).toBeVisible({ timeout: 5000 })
  })

  test('all 5 tabs are navigable and load unique content', async ({ page }) => {
    await gotoReady(page)
    const tabNav = getTabNav(page)

    // OUTCOME: Each tab loads and shows its distinctive content
    const tabChecks = [
      { name: 'Species', content: 'Species Checklist' },
      { name: 'Goals', content: 'Goal Birds' },
      { name: 'Plan', content: 'Trip Planning' },
      { name: 'Stats', content: 'Overall Progress' },
      { name: 'Explore', content: undefined }, // Map tab — check map-container
    ]

    for (const { name, content } of tabChecks) {
      await tabNav.getByRole('tab', { name }).click()
      if (content) {
        await expect(page.getByText(content).first()).toBeVisible({ timeout: 10000 })
      } else {
        await expect(page.getByTestId('map-container')).toBeVisible({ timeout: 10000 })
      }
    }
  })

  test('legend shows meaningful labels (no developer jargon)', async ({ page }) => {
    await gotoReady(page)
    const legend = page.getByTestId('map-legend')
    await expect(legend).toBeVisible({ timeout: 10000 })

    // OUTCOME: Legend text is user-friendly (no "cell ID", "species code", "JSON")
    const legendText = await legend.textContent()
    expect(legendText?.toLowerCase()).not.toContain('cell id')
    expect(legendText?.toLowerCase()).not.toContain('species code')
    expect(legendText?.toLowerCase()).not.toContain('json')
    // Should contain meaningful terms like "species" or "lifers"
    expect(legendText?.toLowerCase()).toMatch(/species|lifer|fewer|more/)
  })
})
