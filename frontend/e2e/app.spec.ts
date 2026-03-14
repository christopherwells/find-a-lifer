import { test, expect } from '@playwright/test'

test.describe('Find-A-Lifer App', () => {
  test('loads the app and shows the top bar', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Find-A-Lifer')).toBeVisible()
  })

  test('shows the side panel with tabs', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('side-panel')).toBeVisible()
    await expect(page.getByTestId('tab-navigation')).toBeVisible()
  })

  test('default view is Explore tab with Richness mode', async ({ page }) => {
    await page.goto('/')
    // Explore tab should be active by default
    await expect(page.getByTestId('view-mode-density')).toBeVisible()
    await expect(page.getByTestId('week-slider')).toBeVisible()
    await expect(page.getByTestId('opacity-slider')).toBeVisible()
  })

  test('can switch view modes', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('view-mode-goal-birds').click()
    // Goal Birds mode should show the active goal list selector or empty message
    await expect(page.getByTestId('view-mode-goal-birds')).toBeVisible()
  })

  test('can switch tabs', async ({ page }) => {
    await page.goto('/')
    // Click Species tab
    await page.getByRole('button', { name: 'Species' }).click()
    // Should show the species checklist (loading or loaded)
    await expect(page.getByText('Species Checklist')).toBeVisible()
  })

  test('can switch to Progress tab', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Stats' }).click()
    await expect(page.getByTestId('progress-tab')).toBeVisible({ timeout: 10000 })
  })

  test('can switch to Profile tab', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Profile' }).click()
    await expect(page.getByText('Profile & Data')).toBeVisible()
  })

  test('dark mode toggle works', async ({ page }) => {
    await page.goto('/')
    const topBar = page.getByTestId('top-bar')
    // Click dark mode toggle
    await page.getByRole('button', { name: /switch to dark mode/i }).click()
    // The html element should have the dark class
    const hasDarkClass = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    expect(hasDarkClass).toBe(true)
    // Toggle back
    await page.getByRole('button', { name: /switch to light mode/i }).click()
    const hasNoDark = await page.evaluate(() => !document.documentElement.classList.contains('dark'))
    expect(hasNoDark).toBe(true)
  })

  test('week slider changes value', async ({ page }) => {
    await page.goto('/')
    const slider = page.getByTestId('week-slider')
    await slider.fill('10')
    await expect(slider).toHaveValue('10')
  })

  test('region selector has all options', async ({ page }) => {
    await page.goto('/')
    const regionSelect = page.getByTestId('region-selector')
    await expect(regionSelect).toBeVisible()
    // Check that region options exist
    const options = await regionSelect.locator('option').allInnerTexts()
    expect(options).toContain('All Regions')
    expect(options).toContain('US Northeast')
    expect(options).toContain('Alaska')
    expect(options).toContain('Hawaii')
  })

  test('animation button toggles play/pause', async ({ page }) => {
    await page.goto('/')
    const playBtn = page.getByTestId('animation-play-button')
    await expect(playBtn).toBeVisible()
    await playBtn.click()
    // Now should show pause button
    await expect(page.getByTestId('animation-pause-button')).toBeVisible()
    // Click pause
    await page.getByTestId('animation-pause-button').click()
    // Should show play button again
    await expect(page.getByTestId('animation-play-button')).toBeVisible()
  })

  test('side panel can be collapsed and expanded', async ({ page }) => {
    await page.goto('/')
    // Click collapse button
    await page.getByRole('button', { name: 'Collapse panel' }).click()
    // Content should be hidden
    await expect(page.getByTestId('week-slider')).not.toBeVisible()
    // Click expand
    await page.getByRole('button', { name: 'Expand panel' }).click()
    // Content should be visible again
    await expect(page.getByTestId('week-slider')).toBeVisible()
  })
})
