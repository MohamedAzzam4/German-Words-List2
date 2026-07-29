import { test, expect } from '@playwright/test';

test.describe('Top German Verbs Mastery E2E Suite (Example Audio TTS)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/verbs.html');
  });

  test('should provide TTS speaker buttons for example sentences in List View', async ({ page }) => {
    const viewGlossary = page.locator('#view-glossary');
    await expect(viewGlossary).toBeVisible();

    // Check example speaker button
    const exSpeakBtn = page.locator('.verb-inline-example-box .speak-btn').first();
    await expect(exSpeakBtn).toBeVisible();

    // Click example speaker button
    await exSpeakBtn.click();
  });

  test('should provide TTS speaker button for example sentence on back of Flashcard', async ({ page }) => {
    // Switch to Flashcards
    const fcBtn = page.locator('button:has-text("Flashcards")');
    await fcBtn.click();

    // Flip card to reveal back
    const card = page.locator('.verb-flashcard');
    await card.click();

    // Check back example speaker button
    const backExSpeakBtn = page.locator('.back-example-box .speak-btn');
    await expect(backExSpeakBtn).toBeVisible();
    await backExSpeakBtn.click();
  });
});
