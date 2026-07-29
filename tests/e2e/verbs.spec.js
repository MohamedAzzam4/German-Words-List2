import { test, expect } from '@playwright/test';

test.describe('Top German Verbs Mastery E2E Suite', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to local server
    await page.goto('/verbs.html');
  });

  test('should load verbs.html with 36 decks in the Deck Progress Tracker', async ({ page }) => {

    // Verify header title
    await expect(page.locator('h1')).toContainText('Top Verbs Mastery');

    // Verify deck summary tracker
    const trackerSummary = page.locator('#verbs-finished-summary');
    await expect(trackerSummary).toBeVisible();
    await expect(trackerSummary).toContainText('0 / 36 Decks Finished');

    // Verify 36 deck chips
    const deckChips = page.locator('.deck-chip-card');
    await expect(deckChips).toHaveCount(36);
  });

  test('should display active Deck 1 flashcard with front elements', async ({ page }) => {
    // Deck title should be Deck 1
    await expect(page.locator('#verbs-deck-title')).toContainText('Deck 1');

    // Check front card elements
    const infinitiveText = page.locator('.verb-infinitive');
    await expect(infinitiveText).toBeVisible();

    const hintBtn = page.locator('.hint-btn');
    await expect(hintBtn).toBeVisible();

    // Toggle hint
    await hintBtn.click();
    await expect(page.locator('.verb-hint-box')).toBeVisible();
  });

  test('should flip card to reveal back content with collapsible conjugations & origins', async ({ page }) => {

    const card = page.locator('.verb-flashcard');
    await card.click();

    // Verify card flipped
    await expect(card).toHaveClass(/flipped/);

    // Verify back fields
    await expect(page.locator('.meaning-field')).toBeVisible();

    // Verify collapsible accordions exist
    const conjBtn = page.locator('#btn-toggle-conj');
    await expect(conjBtn).toBeVisible();

    // Click accordion to reveal conjugations
    await page.evaluate(() => window.verbsEngine.toggleConjugations());
    await expect(page.locator('.conjugation-tables-block')).toBeVisible();
    await expect(page.locator('.conj-grid')).toBeVisible();

    // Click origins accordion
    await page.evaluate(() => window.verbsEngine.toggleOrigins());
    await expect(page.locator('.origins-block')).toBeVisible();
  });

  test('should allow switching decks and updating deck tracker', async ({ page }) => {
    // Click Deck 2
    const deck2Chip = page.locator('.deck-chip-card').nth(1);
    await deck2Chip.click();

    // Verify deck header updated
    await expect(page.locator('#verbs-deck-title')).toContainText('Deck 2');

    // Mark card as known
    const knownBtn = page.locator('button:has-text("Known")');
    await knownBtn.click();

    // Verify counter advanced
    await expect(page.locator('.verb-counter-text')).toContainText('2 / 50');
  });

  test('should allow switching between Flashcard and List view modes', async ({ page }) => {
    const listBtn = page.locator('#verbs-btn-table');
    await listBtn.click();

    // Verify table is visible and card area hidden
    await expect(page.locator('#verbs-table-mode-area')).toBeVisible();
    await expect(page.locator('#verbs-card-mode-area')).toHaveClass(/hidden/);

    // Verify table rows
    const rows = page.locator('#verbs-table-tbody tr');
    await expect(rows.first()).toBeVisible();
  });
});
