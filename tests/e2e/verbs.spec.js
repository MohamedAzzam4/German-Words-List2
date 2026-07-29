import { test, expect } from '@playwright/test';

test.describe('Top German Verbs Mastery E2E Suite (Theme & List Parity)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/verbs.html');
  });

  test('should load verbs.html in List View by default with 36 decks in tracker', async ({ page }) => {
    // Verify default view is List View (Glossary table)
    const viewGlossary = page.locator('#view-glossary');
    await expect(viewGlossary).toBeVisible();
    await expect(page.locator('#view-flashcard')).toHaveClass(/hidden/);

    // Verify deck progress tracker summary
    const trackerSummary = page.locator('#verbs-finished-summary');
    await expect(trackerSummary).toBeVisible();
    await expect(trackerSummary).toContainText('0 / 36 Decks Finished');

    // Verify 36 deck chips
    const deckChips = page.locator('.deck-chip-card');
    await expect(deckChips).toHaveCount(36);

    // Verify table rows for Deck 1
    const rows = page.locator('#verbs-table-tbody tr');
    await expect(rows.first()).toBeVisible();
  });

  test('should support Hide German, Hide English, and Reveal All practice controls', async ({ page }) => {
    const hideEnBtn = page.locator('button:has-text("Hide English")');
    const hideDeBtn = page.locator('button:has-text("Hide German")');
    const revealBtn = page.locator('button:has-text("Reveal All")');

    await expect(hideEnBtn).toBeVisible();
    await expect(hideDeBtn).toBeVisible();

    // Click Hide English
    await hideEnBtn.click();
    const hiddenEN = page.locator('#verbs-table-tbody .hideable.hidden-word');
    await expect(hiddenEN.first()).toBeVisible();

    // Click Reveal All
    await revealBtn.click();
    await expect(page.locator('#verbs-table-tbody .hideable.hidden-word')).toHaveCount(0);
  });

  test('should switch to Flashcards View and reveal back content with conjugations & origins', async ({ page }) => {
    // Switch to Flashcard mode
    const fcBtn = page.locator('button:has-text("Flashcards")');
    await fcBtn.click();

    await expect(page.locator('#view-flashcard')).toBeVisible();
    await expect(page.locator('#view-glossary')).toHaveClass(/hidden/);

    // Check front card
    const infinitiveText = page.locator('.verb-infinitive');
    await expect(infinitiveText).toBeVisible();

    // Flip card
    const card = page.locator('.verb-flashcard');
    await card.click();
    await expect(card).toHaveClass(/flipped/);

    // Toggle accordions via engine
    await page.evaluate(() => window.verbsEngine.toggleConjugations());
    await expect(page.locator('.conjugation-tables-block')).toBeVisible();

    await page.evaluate(() => window.verbsEngine.toggleOrigins());
    await expect(page.locator('.origins-block')).toBeVisible();
  });

  test('should support dark mode toggle and theme persistence', async ({ page }) => {
    const themeBtn = page.locator('#theme-btn');
    await expect(themeBtn).toBeVisible();

    await themeBtn.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Reload page to verify persistence
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
