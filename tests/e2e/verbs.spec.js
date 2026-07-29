import { test, expect } from '@playwright/test';

test.describe('Top German Verbs Mastery E2E Suite (Hiding & EN Chip)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/verbs.html');
  });

  test('should hide 3rd person form when Hide German is clicked', async ({ page }) => {
    const hideDeBtn = page.locator('button:has-text("Hide German")');
    await hideDeBtn.click();

    // Verify 3rd person form element has hidden-word class
    const thirdPersonEl = page.locator('#verbs-table-tbody tr div.hideable').first();
    await expect(thirdPersonEl).toHaveClass(/hidden-word/);

    // Click to reveal
    await thirdPersonEl.click();
    await expect(thirdPersonEl).not.toHaveClass(/hidden-word/);
  });

  test('should support inline EN chip and blur mask for Hide Examples', async ({ page }) => {
    // Check compact inline EN chip
    const enChip = page.locator('.ex-en-chip').first();
    await expect(enChip).toBeVisible();
    await expect(enChip).toContainText('EN');

    await enChip.click();
    const enLine = page.locator('.ex-en-line').first();
    await expect(enLine).toBeVisible();

    // Click Hide Examples button in top bar
    const hideExBtn = page.locator('button:has-text("Hide Examples")');
    await hideExBtn.click();

    // Verify example sentence has hidden-word class
    const exSpan = page.locator('.verb-inline-example-box .hideable').first();
    await expect(exSpan).toHaveClass(/hidden-word/);

    // Click blurred example to reveal
    await exSpan.click();
    await expect(exSpan).not.toHaveClass(/hidden-word/);
  });
});
