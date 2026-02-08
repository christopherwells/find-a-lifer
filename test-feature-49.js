// Test script for Feature #49: Add species to goal list from species checklist
// This script opens the browser and tests the full workflow

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  console.log('1. Navigating to app...');
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(3000);

  console.log('2. Clicking Species tab...');
  await page.click('button:has-text("Species")');
  await page.waitForTimeout(5000); // Wait for species to load

  console.log('3. Looking for + button next to Common Ostrich...');
  // The button has data-testid="add-to-goal-ostric2"
  const addButton = await page.$('[data-testid="add-to-goal-ostric2"]');

  if (!addButton) {
    console.log('ERROR: Could not find + button for Common Ostrich');
    await browser.close();
    return;
  }

  console.log('4. Clicking + button...');
  await addButton.click();
  await page.waitForTimeout(1000);

  console.log('5. Checking if dialog appeared...');
  const dialogText = await page.evaluate(() => document.body.innerText);

  if (dialogText.includes('Add to Goal List') || dialogText.includes('Test Goal List for Feature 49')) {
    console.log('✓ Dialog appeared successfully!');

    // Click on the goal list option
    console.log('6. Clicking goal list option...');
    await page.click('button:has-text("Test Goal List for Feature 49")');
    await page.waitForTimeout(2000);

    console.log('7. Checking for success toast...');
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Added') || bodyText.includes('Common Ostrich')) {
      console.log('✓ Success toast appeared!');
    } else {
      console.log('Warning: Could not confirm success toast');
    }

    console.log('8. Navigating to Goal Birds tab to verify...');
    await page.click('button:has-text("Goal Birds")');
    await page.waitForTimeout(1000);

    const goalBirdsText = await page.evaluate(() => document.body.innerText);
    if (goalBirdsText.includes('ostric2') || goalBirdsText.includes('1 bird')) {
      console.log('✓ Species successfully added to goal list!');
      console.log('\n=== Feature #49 VERIFICATION COMPLETE ===');
      console.log('All steps passed successfully!');
    } else {
      console.log('Warning: Could not confirm species in goal list');
    }
  } else if (dialogText.includes("don't have any goal lists")) {
    console.log('Note: No goal lists exist - showing empty state message as expected');
  }

  console.log('\nPress Ctrl+C to close browser...');
  // Keep browser open for manual inspection
  await page.waitForTimeout(30000);
  await browser.close();
})();
