import { test, expect, type Page } from '@playwright/test'

/**
 * Persona: Sam — iOS User (partner)
 * Small life list, phone (iOS Safari).
 * Journey: Mobile layout verification → tab switching with data checks → dark mode toggle → touch UX
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
    localStorage.setItem('hasSeenOnboarding', 'true')
    localStorage.setItem('beginnerMode', 'false')
    localStorage.setItem('sessionCount', '10')
  })
  await page.reload()
  await expect(getTabNav(page)).toBeVisible({ timeout: 10000 })
}

test.describe('Sam — iOS User (phone)', () => {
  test('mobile tab bar is positioned at bottom with adequate touch targets', async ({ page }) => {
    const viewport = page.viewportSize()
    if (!viewport || viewport.width >= 768) return // Mobile-only test
    await gotoReady(page)
    const tabNav = page.getByTestId('mobile-tab-bar')
    await expect(tabNav).toBeVisible()

    // OUTCOME 1: Tab bar is in the bottom 20% of the screen
    const box = await tabNav.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.y).toBeGreaterThan(viewport.height * 0.7)

    // OUTCOME 2: All tab buttons have >= 40px touch targets (accessibility)
    const buttons = tabNav.getByRole('tab')
    const count = await buttons.count()
    expect(count).toBe(6) // All 6 tabs present

    for (let i = 0; i < count; i++) {
      const btnBox = await buttons.nth(i).boundingBox()
      expect(btnBox).toBeTruthy()
      expect(btnBox!.height).toBeGreaterThanOrEqual(40)
    }
  })

  test('each tab loads distinct content on mobile', async ({ page }) => {
    await gotoReady(page)
    const tabNav = getTabNav(page)

    // OUTCOME: Each tab shows unique content proving it loaded correctly
    // Species → shows species count
    await tabNav.getByRole('tab', { name: 'Species' }).click()
    const speciesHeader = page.locator('span[aria-live="polite"]')
    await expect(speciesHeader).toBeVisible({ timeout: 10000 })
    const speciesText = await speciesHeader.textContent()
    expect(speciesText).toMatch(/\d+\/\d+/) // seen/total format

    // Goals → shows "Goal Birds" heading
    await tabNav.getByRole('tab', { name: 'Goals' }).click()
    await expect(page.getByText('Goal Birds')).toBeVisible({ timeout: 10000 })

    // Plan → shows trip planning with mode buttons
    await tabNav.getByRole('tab', { name: 'Plan' }).click()
    await expect(page.getByText('Trip Planning')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('hotspots-mode-btn')).toBeVisible()

    // Stats → shows 0.0% (no life list) or actual percentage
    await tabNav.getByRole('tab', { name: 'Stats' }).click()
    const percent = page.getByTestId('progress-percentage')
    await expect(percent).toBeVisible({ timeout: 10000 })
    const pctText = await percent.textContent()
    expect(pctText).toMatch(/\d+\.?\d*%/)

    // Profile → shows import section
    await tabNav.getByRole('tab', { name: 'Profile' }).click()
    await expect(page.getByText('Import eBird Life List')).toBeVisible({ timeout: 10000 })

    // Explore → shows map
    await tabNav.getByRole('tab', { name: 'Explore' }).click()
    await expect(page.getByTestId('map-container')).toBeVisible()
  })

  test('map fills the screen width on mobile', async ({ page }) => {
    const viewport = page.viewportSize()
    if (!viewport || viewport.width >= 768) return
    await gotoReady(page)

    const mapContainer = page.getByTestId('map-container')
    await expect(mapContainer).toBeVisible()
    const box = await mapContainer.boundingBox()
    expect(box).toBeTruthy()

    // OUTCOME: Map takes up > 90% of viewport width
    expect(box!.width).toBeGreaterThan(viewport.width * 0.9)
  })

  test('dark mode toggle changes document class', async ({ page }) => {
    await gotoReady(page)
    const viewport = page.viewportSize()

    let darkToggle
    if (viewport && viewport.width < 768) {
      // Mobile: dark mode toggle is in Profile tab (hidden from TopBar)
      await getTabNav(page).getByRole('tab', { name: 'Profile' }).click()
      await expect(page.getByText('Import eBird Life List')).toBeVisible({ timeout: 10000 })
      // The dark mode switch is inside the label containing "Dark mode" text
      darkToggle = page.locator('label:has-text("Dark mode") button[role="switch"]')
      await expect(darkToggle).toBeVisible({ timeout: 5000 })
    } else {
      // Desktop: dark mode toggle is in TopBar
      darkToggle = page.getByTestId('topbar-dark-mode')
      await expect(darkToggle).toBeVisible({ timeout: 5000 })
    }

    // Verify initial state — not dark
    const initialDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    expect(initialDark).toBe(false)

    // Click to enable dark mode
    await darkToggle.click()
    await page.waitForTimeout(300)

    // OUTCOME: Document has 'dark' class (dark mode is active)
    const hasDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    expect(hasDarkClass).toBe(true)

    // Toggle back to light
    await darkToggle.click()
    await page.waitForTimeout(300)

    // OUTCOME: Dark class removed (light mode restored)
    const hasDarkAfter = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    expect(hasDarkAfter).toBe(false)
  })

  test('legend is compact on mobile (< 180px wide)', async ({ page }) => {
    const viewport = page.viewportSize()
    if (!viewport || viewport.width >= 768) return
    await gotoReady(page)

    const legend = page.getByTestId('map-legend')
    await expect(legend).toBeVisible({ timeout: 10000 })
    const box = await legend.boundingBox()
    expect(box).toBeTruthy()

    // OUTCOME: Legend doesn't take over the screen on mobile
    expect(box!.width).toBeLessThan(180)
  })

  test('species search works with autocomplete and info card', async ({ page }) => {
    await gotoReady(page)
    await getTabNav(page).getByRole('tab', { name: 'Species' }).click()
    await expect(page.getByText('Species Checklist')).toBeVisible({ timeout: 10000 })

    const search = page.getByTestId('species-search-input')
    await search.fill('Cardinal')

    // OUTCOME: Autocomplete shows cardinal species
    const suggestions = page.getByTestId('autocomplete-suggestions')
    await expect(suggestions).toBeVisible({ timeout: 5000 })
    await expect(suggestions.getByText('Northern Cardinal')).toBeVisible()

    // Clicking the suggestion highlights it in the list and scrolls to it
    await suggestions.getByText('Northern Cardinal').click()

    // Now click the species info button to open the card
    const infoBtn = page.getByTestId('species-info-btn-norcar')
    await expect(infoBtn).toBeVisible({ timeout: 5000 })
    await infoBtn.click()

    // OUTCOME: Info card shows scientific name (proves it loaded real species data)
    await expect(page.getByText('Cardinalis cardinalis')).toBeVisible({ timeout: 5000 })
  })
})
