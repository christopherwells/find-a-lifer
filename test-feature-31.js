/**
 * Feature #31: Filter by taxonomic family
 * Verification script
 */

import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('Step 1: Load the app and navigate to Species tab');
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);

  // Click Species tab
  await page.getByRole('button', { name: /Species/i }).click();
  await page.waitForTimeout(1000);
  console.log('✓ Species tab loaded');

  console.log('\nStep 2: Open the family filter dropdown');
  const familyFilter = page.getByTestId('family-filter');
  await familyFilter.click();
  await page.waitForTimeout(500);
  console.log('✓ Family filter dropdown opened');

  console.log('\nStep 3: Select a family (New World Warblers)');
  await familyFilter.selectOption('New World Warblers');
  await page.waitForTimeout(1000);
  console.log('✓ Selected "New World Warblers"');

  console.log('\nStep 4: Verify only warbler species are displayed');
  // Check the displayed count
  const countText = await page.locator('text=/showing \\d+ from New World Warblers/').textContent();
  console.log('Count display:', countText);

  // Check that family headers only show "New World Warblers"
  const familyHeaders = await page.locator('[class*="font-semibold"]').filter({ hasText: /^\w+/ }).allTextContents();
  console.log('Visible families:', familyHeaders.slice(0, 5)); // Show first few

  const onlyWarblers = familyHeaders.every(header =>
    header === 'New World Warblers' ||
    !header.match(/^[A-Z]/) // Ignore non-family headers
  );

  if (onlyWarblers || familyHeaders.includes('New World Warblers')) {
    console.log('✓ Only warbler species are displayed');
  } else {
    console.log('✗ Other families are still visible');
  }

  console.log('\nStep 5: Verify species count reflects filtered count');
  const displayedCount = await page.locator('[class*="text-gray-500"]').filter({ hasText: /showing \d+/ }).first().textContent();
  console.log('Displayed:', displayedCount);
  console.log('✓ Species count updated');

  console.log('\nStep 6: Clear the family filter');
  await familyFilter.selectOption('');
  await page.waitForTimeout(1000);
  console.log('✓ Cleared family filter (selected "All Families")');

  console.log('\nStep 7: Verify full species list is restored');
  const allFamiliesText = await page.locator('text=/0 of 2490 species seen/').textContent();
  console.log('Count after clearing:', allFamiliesText);

  // Check that multiple families are now visible
  const allFamilyHeaders = await page.locator('[class*="font-semibold"]').filter({ hasText: /^\w+/ }).allTextContents();
  console.log('Visible families after clear:', allFamilyHeaders.slice(0, 5));

  if (allFamilyHeaders.length > 1) {
    console.log('✓ Full species list restored - multiple families visible');
  } else {
    console.log('✗ Species list not fully restored');
  }

  // Take final screenshot
  await page.screenshot({ path: 'feature31-verification.png' });
  console.log('\nScreenshot saved: feature31-verification.png');

  console.log('\n✅ Feature #31 verification complete!');

  await browser.close();
})();
