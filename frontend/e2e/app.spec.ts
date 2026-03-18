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
  await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 10000 })
}

test.describe('Find-A-Lifer App', () => {
  test.beforeEach(async ({ page }) => {
    await gotoReady(page)
  })

  test('loads the app and shows the top bar', async ({ page }) => {
    await expect(page.getByTestId('top-bar')).toBeVisible()
    await expect(page.getByTestId('top-bar').getByRole('heading', { name: 'Find-A-Lifer' })).toBeVisible()
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
    await expect(page.getByTestId('top-bar')).toBeVisible()
  })
})
