const { chromium, devices } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  
  const testDevices = [
    { name: 'Pixel_5', config: devices['Pixel 5'] },
    { name: 'iPhone_12', config: devices['iPhone 12'] },
    { name: 'iPhone_SE_small', config: devices['iPhone SE'] },
    { name: 'Galaxy_S20', viewport: { width: 360, height: 800 }, userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-G981B)' }
  ];

  for (const dev of testDevices) {
    const context = await browser.newContext({
      ...(dev.config || {}),
      viewport: dev.viewport || dev.config.viewport,
      userAgent: dev.userAgent || (dev.config && dev.config.userAgent)
    });
    const page = await context.newPage();
    
    await page.goto('http://localhost:8080/verbs.html');
    await page.waitForTimeout(1500);
    
    // Screenshot 1: Top of page (checking topbar)
    const topPath = path.join(__dirname, `../scratch/topbar_${dev.name}.png`);
    await page.screenshot({ path: topPath, fullPage: false });
    
    // Screenshot 2: Scroll inside #content-area
    await page.evaluate(() => {
      const el = document.querySelector('#content-area');
      if (el) el.scrollTop = 300;
    });
    await page.waitForTimeout(500);
    
    const scrollPath = path.join(__dirname, `../scratch/topbar_scrolled_${dev.name}.png`);
    await page.screenshot({ path: scrollPath, fullPage: false });
    
    console.log(`Captured screenshots for ${dev.name}`);
    await context.close();
  }

  await browser.close();
})();
