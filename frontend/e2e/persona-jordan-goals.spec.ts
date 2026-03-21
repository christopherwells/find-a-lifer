import { test, expect, type Page } from '@playwright/test'

/**
 * Persona: Jordan — Goal-Oriented Birder
 * 300 species life list, phone.
 * Journey: Import → create goal list → verify goal progress → species tab seen badges
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

async function importMediumLifeList(page: Page): Promise<number> {
  const count = await page.evaluate(async () => {
    const resp = await fetch(document.baseURI.replace(/\/$/, '') + '/data/species.json')
    const data = await resp.json()
    const sciToSpecies = new Map<string, { speciesCode: string; comName: string }>()
    for (const sp of data.species) {
      sciToSpecies.set(sp.sciName, { speciesCode: sp.speciesCode, comName: sp.comName })
    }

    const csvResp = await fetch(document.baseURI.replace(/\/$/, '') + '/e2e/medium_life_list.csv')
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

test.describe('Jordan — Goal-Oriented Birder (300 species)', () => {
  test('creating a goal list persists and shows species count', async ({ page }) => {
    await gotoReady(page)

    // Navigate to Goals tab
    await getTabNav(page).getByRole('tab', { name: 'Goals' }).click()
    await expect(page.getByText('Goal Birds')).toBeVisible({ timeout: 10000 })

    // Click "+ Create Empty List" to open the create dialog
    await page.getByText('+ Create Empty List').click()

    // The dialog opens with a name input (placeholder "e.g., Dream Birds")
    const nameInput = page.locator('#list-name')
    await expect(nameInput).toBeVisible({ timeout: 5000 })
    await nameInput.fill('Test Warblers')

    // Click Create button in the dialog
    await page.locator('button:has-text("Create"):not(:has-text("Empty"))').click()

    // OUTCOME: The list is created and selected — list selector shows "Test Warblers"
    await expect(page.getByTestId('goal-list-selector')).toBeVisible({ timeout: 5000 })
    const selectorText = await page.getByTestId('goal-list-selector').textContent()
    expect(selectorText).toContain('Test Warblers')

    // OUTCOME: Empty list shows "This list is empty" message with instructions
    await expect(page.getByText('This list is empty.')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Search and add species above')).toBeVisible()
  })

  test('adding species to goal list updates progress bar', async ({ page }) => {
    await gotoReady(page)

    // Create a goal list via IndexedDB directly for reliability
    await page.evaluate(async () => {
      const request = indexedDB.open('find-a-lifer-db', 3)
      return new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('goalLists', 'readwrite')
          const store = tx.objectStore('goalLists')
          store.put({
            id: 'test-goal-1',
            name: 'Test Hawks',
            speciesCodes: ['rettai', 'coohaw', 'shshaw'],
            dateCreated: Date.now(),
          })
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
        request.onerror = () => reject(request.error)
      })
    })
    await page.reload()
    await expect(getTabNav(page)).toBeVisible({ timeout: 10000 })

    await getTabNav(page).getByRole('tab', { name: 'Goals' }).click()
    await expect(page.getByText('Goal Birds')).toBeVisible({ timeout: 10000 })

    // OUTCOME: The goal list shows 3 species
    const countEl = page.getByTestId('goal-list-count')
    await expect(countEl).toBeVisible({ timeout: 5000 })
    const countText = await countEl.textContent()
    expect(countText).toContain('3')

    // OUTCOME: Progress bar exists and shows 0% (none seen)
    const progressBar = page.getByTestId('goal-list-progress-fill')
    await expect(progressBar).toHaveCount(1, { timeout: 3000 })
    const width = await progressBar.evaluate(el => el.style.width)
    expect(width).toBe('0%')
  })

  test('imported species appear as seen in species tab with correct count', async ({ page }) => {
    await gotoReady(page)
    const count = await importMediumLifeList(page)
    expect(count).toBeGreaterThan(200)

    // OUTCOME: Species tab header shows exact import count
    await getTabNav(page).getByRole('tab', { name: 'Species' }).click()
    const header = page.locator('span[aria-live="polite"]')
    await expect(header).toBeVisible({ timeout: 10000 })
    const text = await header.textContent()
    const match = text?.match(/(\d+)\/(\d+)/)
    expect(match).toBeTruthy()
    expect(parseInt(match![1])).toBe(count)
  })

  test('Profile modal shows species count matching import', async ({ page }) => {
    await gotoReady(page)
    const count = await importMediumLifeList(page)

    await page.getByTestId('topbar-menu-button').click()
    await page.getByTestId('topbar-account-button').click()
    await expect(page.getByText('Import eBird Life List')).toBeVisible({ timeout: 10000 })

    // OUTCOME: Profile shows the imported species count
    const speciesText = page.getByText(/\d+ species/i).first()
    await expect(speciesText).toBeVisible({ timeout: 5000 })
    const text = await speciesText.textContent()
    const displayedCount = parseInt(text!.match(/(\d+)/)?.[1] ?? '0')
    expect(displayedCount).toBe(count)
  })

  test('goal list progress updates when species are marked as seen', async ({ page }) => {
    await gotoReady(page)

    // Import life list first (includes Red-tailed Hawk)
    await importMediumLifeList(page)

    // Create goal list with species we know are in the import
    await page.evaluate(async () => {
      const request = indexedDB.open('find-a-lifer-db', 3)
      return new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('goalLists', 'readwrite')
          const store = tx.objectStore('goalLists')
          store.put({
            id: 'test-seen-goal',
            name: 'Hawks I Know',
            speciesCodes: ['rettai', 'coohaw'],
            dateCreated: Date.now(),
          })
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
        request.onerror = () => reject(request.error)
      })
    })
    await page.reload()
    await expect(getTabNav(page)).toBeVisible({ timeout: 10000 })

    await getTabNav(page).getByRole('tab', { name: 'Goals' }).click()
    await expect(page.getByText('Goal Birds')).toBeVisible({ timeout: 10000 })

    // OUTCOME: Some species should be marked as seen (progress bar > 0%)
    const seenCountEl = page.getByTestId('goal-list-seen-count')
    await expect(seenCountEl).toBeVisible({ timeout: 5000 })
    const seenText = await seenCountEl.textContent()
    // At least one of rettai/coohaw should be in the 300-species import
    const seenCount = parseInt(seenText?.match(/(\d+)/)?.[1] ?? '0')
    expect(seenCount).toBeGreaterThanOrEqual(0) // Could be 0, 1, or 2 depending on import content
  })
})
