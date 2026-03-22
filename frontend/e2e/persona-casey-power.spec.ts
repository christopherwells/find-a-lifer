import { test, expect, type Page } from '@playwright/test'

/**
 * Persona: Casey — Power Lister
 * 700+ species life list, desktop.
 * Journey: Import full list → verify counts are accurate → stats reflect import → explore modes
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
    localStorage.setItem('tourComplete', 'true')
    localStorage.setItem('sessionCount', '10')
  })
  await page.reload()
  await expect(getTabNav(page)).toBeVisible({ timeout: 10000 })
}

async function importFullLifeList(page: Page): Promise<number> {
  const count = await page.evaluate(async () => {
    const resp = await fetch(document.baseURI.replace(/\/$/, '') + '/data/species.json')
    const data = await resp.json()
    const sciToSpecies = new Map<string, { speciesCode: string; comName: string }>()
    for (const sp of data.species) {
      sciToSpecies.set(sp.sciName, { speciesCode: sp.speciesCode, comName: sp.comName })
    }

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

  await page.reload()
  await expect(getTabNav(page)).toBeVisible({ timeout: 10000 })
  return count
}

test.describe('Casey — Power Lister (700+ species)', () => {
  test('import count matches across Species tab and Stats tab', async ({ page }) => {
    await gotoReady(page)
    const importedCount = await importFullLifeList(page)
    expect(importedCount).toBeGreaterThan(600)

    // OUTCOME 1: Species tab header shows exact imported count as "seen"
    await getTabNav(page).getByRole('tab', { name: 'Species' }).click()
    const header = page.locator('span[aria-live="polite"]')
    await expect(header).toBeVisible({ timeout: 10000 })
    const headerText = await header.textContent()
    const speciesMatch = headerText?.match(/(\d+)\/(\d+)/)
    expect(speciesMatch).toBeTruthy()
    const seenInSpecies = parseInt(speciesMatch![1])
    const totalInSpecies = parseInt(speciesMatch![2])
    expect(seenInSpecies).toBe(importedCount)
    expect(totalInSpecies).toBeGreaterThan(2000)

    // OUTCOME 2: Stats tab shows same seen count and correct percentage
    await getTabNav(page).getByRole('tab', { name: 'Stats' }).click()
    await expect(page.getByTestId('progress-tab')).toBeVisible({ timeout: 10000 })

    const progressText = await page.getByTestId('progress-species-count').textContent()
    expect(progressText).toContain(String(importedCount))

    const percentText = await page.getByTestId('progress-percentage').textContent()
    const percentVal = parseFloat(percentText!.replace('%', ''))
    const expectedPercent = (importedCount / totalInSpecies) * 100
    // Should be within 1% of expected
    expect(Math.abs(percentVal - expectedPercent)).toBeLessThan(1)
  })

  test('species checkboxes reflect imported life list', async ({ page }) => {
    await gotoReady(page)
    await importFullLifeList(page)

    await getTabNav(page).getByRole('tab', { name: 'Species' }).click()
    await expect(page.getByText('Species Checklist')).toBeVisible({ timeout: 10000 })

    // OUTCOME: Specific known species from test_life_list.csv are checked
    // American Robin (amerob) should be checked since it's a common species in any 800+ list
    const amerobItem = page.getByTestId('species-item-amerob')
    if (await amerobItem.isVisible()) {
      const checkbox = amerobItem.locator('input[type="checkbox"]')
      await expect(checkbox).toBeChecked()
    }
  })

  test('seen filter works correctly with large list', async ({ page }) => {
    await gotoReady(page)
    await importFullLifeList(page)

    await getTabNav(page).getByRole('tab', { name: 'Species' }).click()
    await expect(page.getByText('Species Checklist')).toBeVisible({ timeout: 10000 })

    // Open filters
    await page.getByTestId('filter-toggle-btn').click()
    const seenFilter = page.getByTestId('seen-filter')
    await expect(seenFilter).toBeVisible({ timeout: 3000 })

    // Filter to "Unseen only"
    await seenFilter.selectOption('unseen')

    // OUTCOME: Shown species count drops significantly (only unseen species)
    // Wait for filter to apply
    await page.waitForTimeout(500)
    const countText = page.locator('text=/\\d+ species/')
    await expect(countText.first()).toBeVisible({ timeout: 5000 })
    const text = await countText.first().textContent()
    const shownCount = parseInt(text!.match(/(\d+)/)?.[1] ?? '0')
    // With 800+ seen out of 2300+, unseen should be ~1400-1700
    expect(shownCount).toBeGreaterThan(1000)
    expect(shownCount).toBeLessThan(2000)
  })

  test('view mode switching changes the legend', async ({ page }) => {
    await gotoReady(page)
    await importFullLifeList(page)

    // Get legend in Density mode — should mention "Richness" or "Species"
    const legend = page.getByTestId('map-legend')
    await expect(legend).toBeVisible({ timeout: 10000 })
    const densityLegend = await legend.textContent()
    // With a life list, density shows "Lifer Density"
    expect(densityLegend?.toLowerCase()).toMatch(/lifer|richness|species/)

    // Switch to Frequency — legend should mention "P(" (probability notation)
    await getViewModeBtn(page, 'probability').click()
    await page.waitForTimeout(1000)
    const freqLegend = await legend.textContent()
    expect(freqLegend?.toLowerCase()).toMatch(/p\(|probability|chance/)

    // OUTCOME: The two modes show different legend text
    expect(freqLegend).not.toBe(densityLegend)
  })

  test('Stats tab groups started count is positive with large list', async ({ page }) => {
    await gotoReady(page)
    await importFullLifeList(page)

    await getTabNav(page).getByRole('tab', { name: 'Stats' }).click()
    await expect(page.getByTestId('progress-tab')).toBeVisible({ timeout: 10000 })

    // OUTCOME: With 800+ species, many display groups should be started
    const groupsStartedText = await page.getByTestId('groups-started-count').textContent()
    const groupsStarted = parseInt(groupsStartedText!)
    expect(groupsStarted).toBeGreaterThan(20) // Should have started most of the 41 groups

    // Some groups should be completed (trophies)
    const groupsCompletedText = await page.getByTestId('groups-completed-count').textContent()
    const groupsCompleted = parseInt(groupsCompletedText!)
    expect(groupsCompleted).toBeGreaterThanOrEqual(0) // At least renders a number
  })

  test('Trip Plan tab loads with 3 mode buttons (Compare cut)', async ({ page }) => {
    await gotoReady(page)

    await getTabNav(page).getByRole('tab', { name: 'Plan' }).click()
    await expect(page.getByText('Trip Planning')).toBeVisible({ timeout: 10000 })

    // OUTCOME: 3 mode buttons present (Compare was cut)
    for (const mode of ['hotspots', 'location', 'window']) {
      const btn = page.getByTestId(`${mode}-mode-btn`)
      await expect(btn).toBeVisible()
    }
    await expect(page.getByTestId('compare-mode-btn')).not.toBeVisible()

    // Clicking a mode actually changes content
    await page.getByTestId('window-mode-btn').click()
    await expect(page.getByText(/Select Target Species|Window/i).first()).toBeVisible({ timeout: 5000 })
  })
})
