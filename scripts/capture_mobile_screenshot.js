const { chromium, devices } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices['Pixel 5'],
  });
  const page = await context.newPage();
  
  await page.goto('http://localhost:8080/verbs.html');
  await page.waitForTimeout(2000);
  
  // Scroll down to the table
  await page.evaluate(() => {
    const el = document.querySelector('.table-container');
    if (el) el.scrollIntoView();
  });
  await page.waitForTimeout(500);
  
  const screenshotPath = path.join(__dirname, '../scratch/mobile_table_view.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log('Mobile table screenshot saved to:', screenshotPath);
  
  await browser.close();
})();
