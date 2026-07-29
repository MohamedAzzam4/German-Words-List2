import { test, expect } from '@playwright/test';

test.describe('Top German Verbs Mastery E2E Suite (Card Recycling & TTS)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/verbs.html');
  });

  test('should recycle Still Learning card to the end of queue and advance to next card', async ({ page }) => {
    // Switch to Flashcards
    const fcBtn = page.locator('button:has-text("Flashcards")');
    await fcBtn.click();

    // Check first card verb infinitive
    const frontVerb = page.locator('.verb-infinitive');
    await expect(frontVerb).toBeVisible();
    const firstVerbText = await frontVerb.textContent();

    // Click Still Learning
    const learningBtn = page.locator('.btn-learning');
    await learningBtn.click();

    // The current front card should now display a NEW verb (the next card in queue)
    const nextVerbText = await frontVerb.textContent();
    expect(nextVerbText).not.toBe(firstVerbText);
  });

  test('should provide TTS speaker buttons for example sentences in List View', async ({ page }) => {
    const viewGlossary = page.locator('#view-glossary');
    await expect(viewGlossary).toBeVisible();

    const exSpeakBtn = page.locator('.verb-inline-example-box .speak-btn').first();
    await expect(exSpeakBtn).toBeVisible();
    await exSpeakBtn.click();
  });
});
