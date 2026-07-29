import { test, expect } from '@playwright/test';

test.describe('Top German Verbs Mastery E2E Suite (Sidebar & Examples)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/verbs.html');
  });

  test('should load verbs.html in List View with German examples visible under meaning', async ({ page }) => {
    // Verify default view is List View (Glossary table)
    const viewGlossary = page.locator('#view-glossary');
    await expect(viewGlossary).toBeVisible();

    // Verify 36 deck chips
    const deckChips = page.locator('.deck-chip-card');
    await expect(deckChips).toHaveCount(36);

    // Verify German example line is visible by default
    const firstExample = page.locator('.verb-inline-example-box .ex-de-line').first();
    await expect(firstExample).toBeVisible();
  });

  test('should support expanding English example translation and toggling all examples off', async ({ page }) => {
    // Check English translation toggle button
    const showEnBtn = page.locator('.ex-en-toggle-btn').first();
    await expect(showEnBtn).toBeVisible();
    await showEnBtn.click();

    const enLine = page.locator('.ex-en-line').first();
    await expect(enLine).toBeVisible();

    // Click Hide Examples button in top bar
    const hideExBtn = page.locator('#btn-toggle-examples');
    await expect(hideExBtn).toBeVisible();
    await hideExBtn.click();

    // Verify all example boxes are hidden
    const exBoxes = page.locator('.verb-inline-example-box.hidden-example');
    await expect(exBoxes.first()).toBeHidden();
  });

  test('should support collapsing desktop sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const sidebarToggleBtn = page.locator('button:has-text("↔️ Sidebar")');
    await expect(sidebarToggleBtn).toBeVisible();

    await sidebarToggleBtn.click();
    await expect(page.locator('body')).toHaveClass(/sidebar-collapsed/);
  });
});
