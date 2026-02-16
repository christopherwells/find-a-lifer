/**
 * Playwright verification script for Feature #77:
 * "One-tap add from suggestions to any goal list"
 *
 * Tests:
 * 1. Single goal list: clicking "+" adds directly (no picker)
 * 2. Multiple goal lists: clicking "+" shows a list-picker popup
 * 3. Selecting a list from picker adds immediately (no confirmation)
 * 4. Suggestion shows "✓ In list" badge after adding
 * 5. Success toast appears after adding
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const SCREENSHOT_DIR = path.join(__dirname, 'feature77-screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function screenshot(page, name) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  [screenshot] Saved: ${name}.png`);
  return filePath;
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // Collect console messages
  const consoleLogs = [];
  page.on('console', (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    consoleLogs.push(`[PAGE ERROR] ${err.message}`);
  });

  let passed = 0;
  let failed = 0;
  const results = [];

  function logResult(label, ok, detail) {
    const status = ok ? 'PASS' : 'FAIL';
    console.log(`  [${status}] ${label}${detail ? ': ' + detail : ''}`);
    results.push({ label, ok, detail });
    if (ok) passed++; else failed++;
  }

  try {
    // ===== STEP 1: Open app =====
    console.log('\n--- Step 1: Open app ---');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await screenshot(page, '01-initial-load');
    logResult('App loads', true, BASE_URL);

    // ===== STEP 2: Click "Goal Birds" tab =====
    console.log('\n--- Step 2: Click Goal Birds tab ---');
    // Tabs don't have data-testid, so find by text content (emoji + "Goal Birds")
    const goalTab = page.locator('button', { hasText: 'Goal Birds' });
    await goalTab.first().click();
    await page.waitForTimeout(800);
    await screenshot(page, '02-goal-birds-tab');
    const goalTabVisible = await page.locator('text=Goal Birds').first().isVisible();
    logResult('Goal Birds tab active', goalTabVisible);

    // ===== STEP 3: Create first goal list "List Alpha" =====
    console.log('\n--- Step 3: Create first goal list ---');

    // Clear any existing data to start fresh
    // Click "+ New List" button
    const newListBtn = page.locator('button', { hasText: '+ New List' });
    const newListBtnVisible = await newListBtn.isVisible().catch(() => false);
    logResult('+ New List button visible', newListBtnVisible);

    if (newListBtnVisible) {
      await newListBtn.click();
      await page.waitForTimeout(500);
      await screenshot(page, '03-create-dialog-open');

      // Type the list name
      const listNameInput = page.locator('#list-name');
      await listNameInput.fill('List Alpha');
      await page.waitForTimeout(300);

      // Click Create
      await page.locator('button', { hasText: 'Create' }).click();
      await page.waitForTimeout(800);
      await screenshot(page, '04-first-list-created');

      // Verify the list was created
      const selector = page.locator('[data-testid="goal-list-selector"]');
      const selectorText = await selector.textContent().catch(() => '');
      logResult('List Alpha created', selectorText.includes('List Alpha'), selectorText);
    }

    // ===== STEP 4: Navigate to suggestions area =====
    console.log('\n--- Step 4: Check suggestions area ---');
    // Look for suggestions section (scroll to it)
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="suggestions-section"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    await page.waitForTimeout(800);
    await screenshot(page, '05-suggestions-area');

    const suggestionsSection = page.locator('[data-testid="suggestions-section"]');
    const suggestionsSectionVisible = await suggestionsSection.isVisible().catch(() => false);
    logResult('Suggestions section visible', suggestionsSectionVisible);

    // ===== STEP 5: Test with ONE list — click "+" on a suggestion =====
    console.log('\n--- Step 5: Test with ONE list (direct add, no picker) ---');

    // Wait for the rarest suggestions list to be visible
    const rarestList = page.locator('[data-testid="rarest-suggestions-list"]');
    const rarestListVisible = await rarestList.isVisible().catch(() => false);

    let addBtnTestId = null;
    let firstSpeciesCode = null;

    if (rarestListVisible) {
      // Find first add button in the rarest suggestions
      const firstAddBtn = page.locator('[data-testid^="rarest-add-btn-"]').first();
      const firstAddBtnVisible = await firstAddBtn.isVisible().catch(() => false);
      logResult('First rarest add button visible', firstAddBtnVisible);

      if (firstAddBtnVisible) {
        addBtnTestId = await firstAddBtn.getAttribute('data-testid');
        firstSpeciesCode = addBtnTestId?.replace('rarest-add-btn-', '');
        console.log(`  Using species: ${firstSpeciesCode}`);

        // Click the "+" button (single list: should add directly, no picker)
        await firstAddBtn.click();
        await page.waitForTimeout(800);
        await screenshot(page, '06-single-list-add-clicked');

        // Verify NO list picker appeared
        const pickerOverlay = page.locator('[data-testid="list-picker-overlay"]');
        const pickerVisible = await pickerOverlay.isVisible().catch(() => false);
        logResult('Single list: NO picker shown', !pickerVisible,
          pickerVisible ? 'UNEXPECTED: picker appeared with single list' : 'Correct: added directly');

        // Verify success toast
        const toastVisible = await page.locator('text=Added').filter({ hasText: 'List Alpha' }).isVisible().catch(() => false);
        logResult('Single list: success toast appeared', toastVisible);
        await screenshot(page, '07-single-list-toast');

        // Verify "✓ In list" badge appears
        await page.waitForTimeout(500);
        const inListBadge = page.locator(`[data-testid="rarest-in-list-badge-${firstSpeciesCode}"]`);
        const inListBadgeVisible = await inListBadge.isVisible().catch(() => false);
        logResult('Single list: "✓ In list" badge appears', inListBadgeVisible,
          inListBadgeVisible ? 'Badge found' : 'Badge not found');
        await screenshot(page, '08-in-list-badge');
      }
    } else {
      // Try easy-wins or other suggestion sections
      console.log('  Rarest list not visible, trying other suggestion sections...');
      const easyWinsBtn = page.locator('[data-testid^="easy-wins-add-btn-"]').first();
      const easyWinsVisible = await easyWinsBtn.isVisible().catch(() => false);

      if (easyWinsVisible) {
        addBtnTestId = await easyWinsBtn.getAttribute('data-testid');
        firstSpeciesCode = addBtnTestId?.replace('easy-wins-add-btn-', '');
        await easyWinsBtn.click();
        await page.waitForTimeout(800);
        await screenshot(page, '06-single-list-add-clicked');

        const pickerOverlay = page.locator('[data-testid="list-picker-overlay"]');
        const pickerVisible = await pickerOverlay.isVisible().catch(() => false);
        logResult('Single list: NO picker shown (easy wins)', !pickerVisible);
        await screenshot(page, '07-single-list-result');
      } else {
        logResult('Any suggestion add button found', false, 'No suggestion buttons visible');
      }
    }

    // ===== STEP 6: Create second goal list "List Beta" =====
    console.log('\n--- Step 6: Create second goal list ---');
    await newListBtn.click();
    await page.waitForTimeout(500);
    await screenshot(page, '09-create-second-list-dialog');

    const listNameInput2 = page.locator('#list-name');
    await listNameInput2.fill('List Beta');
    await page.waitForTimeout(300);
    await page.locator('button', { hasText: 'Create' }).click();
    await page.waitForTimeout(800);
    await screenshot(page, '10-second-list-created');

    const selector2 = page.locator('[data-testid="goal-list-selector"]');
    const selectorText2 = await selector2.textContent().catch(() => '');
    logResult('List Beta created', selectorText2.includes('List Beta') || selectorText2.includes('List Alpha'), selectorText2);

    // Check we now have 2 lists
    const listOptions = await selector2.locator('option').count().catch(() => 0);
    logResult('Two goal lists exist', listOptions >= 2, `${listOptions} lists found`);

    // ===== STEP 7: Test with MULTIPLE lists — click "+" on a DIFFERENT suggestion =====
    console.log('\n--- Step 7: Test with MULTIPLE lists (picker should appear) ---');

    // Find a second add button (different species than the one we already added)
    // Try the second add button in rarest, or first in easy-wins
    let secondAddBtn = null;
    let secondSpeciesCode = null;

    const allRarestBtns = page.locator('[data-testid^="rarest-add-btn-"]');
    const rarestCount = await allRarestBtns.count();
    console.log(`  Found ${rarestCount} rarest add buttons`);

    for (let i = 0; i < rarestCount; i++) {
      const btn = allRarestBtns.nth(i);
      const testId = await btn.getAttribute('data-testid');
      const spCode = testId?.replace('rarest-add-btn-', '');
      if (spCode !== firstSpeciesCode) {
        // Check if it's visible and not already in list (badge not shown)
        const badgeVisible = await page.locator(`[data-testid="rarest-in-list-badge-${spCode}"]`).isVisible().catch(() => false);
        if (!badgeVisible) {
          const isVisible = await btn.isVisible().catch(() => false);
          if (isVisible) {
            secondAddBtn = btn;
            secondSpeciesCode = spCode;
            break;
          }
        }
      }
    }

    // If not found in rarest, try easy-wins
    if (!secondAddBtn) {
      const easyWinsBtns = page.locator('[data-testid^="easy-wins-add-btn-"]');
      const ewCount = await easyWinsBtns.count();
      for (let i = 0; i < ewCount; i++) {
        const btn = easyWinsBtns.nth(i);
        const testId = await btn.getAttribute('data-testid');
        const spCode = testId?.replace('easy-wins-add-btn-', '');
        const badgeVisible = await page.locator(`[data-testid="easy-wins-in-list-badge-${spCode}"]`).isVisible().catch(() => false);
        if (!badgeVisible) {
          const isVisible = await btn.isVisible().catch(() => false);
          if (isVisible) {
            secondAddBtn = btn;
            secondSpeciesCode = spCode;
            break;
          }
        }
      }
    }

    logResult('Second (different) add button found for multi-list test', !!secondAddBtn,
      secondAddBtn ? `species: ${secondSpeciesCode}` : 'No button found');

    if (secondAddBtn) {
      // Scroll to button
      await secondAddBtn.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await screenshot(page, '11-before-multi-list-click');

      // Click the "+" button (multiple lists: should show picker)
      await secondAddBtn.click();
      await page.waitForTimeout(600);
      await screenshot(page, '12-after-multi-list-click');

      // ===== STEP 8: Verify list picker popup appears =====
      const pickerOverlay = page.locator('[data-testid="list-picker-overlay"]');
      const pickerOverlayVisible = await pickerOverlay.isVisible().catch(() => false);
      logResult('Multiple lists: list-picker-overlay appears', pickerOverlayVisible);

      const pickerDialog = page.locator('[data-testid="list-picker-dialog"]');
      const pickerDialogVisible = await pickerDialog.isVisible().catch(() => false);
      logResult('Multiple lists: list-picker-dialog appears', pickerDialogVisible);

      const pickerOptions = page.locator('[data-testid="list-picker-options"]');
      const pickerOptionsVisible = await pickerOptions.isVisible().catch(() => false);
      logResult('Multiple lists: list-picker-options visible', pickerOptionsVisible);

      // Check that both list names appear as buttons
      const listAlphaBtn = page.locator('[data-testid^="list-picker-option-"]').filter({ hasText: 'List Alpha' });
      const listBetaBtn = page.locator('[data-testid^="list-picker-option-"]').filter({ hasText: 'List Beta' });
      const listAlphaVisible = await listAlphaBtn.isVisible().catch(() => false);
      const listBetaVisible = await listBetaBtn.isVisible().catch(() => false);
      logResult('Picker: "List Alpha" button visible', listAlphaVisible);
      logResult('Picker: "List Beta" button visible', listBetaVisible);

      // Also check that cancel button is present
      const cancelBtn = page.locator('[data-testid="list-picker-cancel"]');
      const cancelVisible = await cancelBtn.isVisible().catch(() => false);
      logResult('Picker: cancel button visible', cancelVisible);

      await screenshot(page, '13-list-picker-showing');

      // ===== STEP 9: Click "List Alpha" to add =====
      console.log('\n--- Step 9: Click List Alpha in picker ---');
      if (listAlphaVisible) {
        await listAlphaBtn.click();
        await page.waitForTimeout(800);
        await screenshot(page, '14-after-picker-selection');

        // Picker should be gone (closed immediately)
        const pickerGone = !(await pickerOverlay.isVisible().catch(() => false));
        logResult('Picker dismissed immediately after selection', pickerGone);

        // ===== STEP 10: Verify success toast =====
        const toastVisible2 = await page.locator('text=Added').first().isVisible().catch(() => false);
        logResult('Success toast appears after picker selection', toastVisible2);
        await screenshot(page, '15-success-toast');

        // ===== STEP 11: Verify "✓ In list" badge on the species =====
        await page.waitForTimeout(500);
        // Find the badge for the species we just added
        const inListBadge2 = page.locator(`[data-testid$="-in-list-badge-${secondSpeciesCode}"]`).first();
        const inListBadge2Visible = await inListBadge2.isVisible().catch(() => false);
        logResult('Suggestion shows "✓ In list" badge after picker add', inListBadge2Visible,
          inListBadge2Visible ? 'Badge found' : 'Badge not found');
        await screenshot(page, '16-in-list-badge-after-picker');
      }
    }

    // ===== Check console errors =====
    console.log('\n--- Console output summary ---');
    const errors = consoleLogs.filter((l) => l.startsWith('[error]') || l.startsWith('[PAGE ERROR]'));
    if (errors.length > 0) {
      console.log('  Console errors found:');
      errors.forEach((e) => console.log('    ' + e));
    } else {
      console.log('  No console errors found.');
    }
    logResult('No console errors', errors.length === 0,
      errors.length > 0 ? `${errors.length} error(s)` : undefined);

  } catch (err) {
    console.error('\n[FATAL] Script error:', err.message);
    await screenshot(page, 'error-state').catch(() => {});
    failed++;
  }

  // ===== Summary =====
  console.log('\n========================================');
  console.log(`FEATURE #77 VERIFICATION RESULTS`);
  console.log('========================================');
  results.forEach((r) => {
    console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
  });
  console.log(`\n  Total: ${passed + failed} checks — ${passed} passed, ${failed} failed`);
  console.log('========================================');

  // Console logs
  console.log('\n--- All console messages (first 30) ---');
  consoleLogs.slice(0, 30).forEach((l) => console.log('  ' + l));

  await browser.close();
  console.log('\nBrowser closed.');
})();
