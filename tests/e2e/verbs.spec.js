import { test, expect } from '@playwright/test';

test.describe('Top German Verbs Mastery E2E Suite (Card Recycling & Custom Auto-Play TTS)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/verbs.html');
  });

  test('should recycle Still Learning card to the end of queue and advance to next card', async ({ page }) => {
    const fcBtn = page.locator('button:has-text("Flashcards")');
    await fcBtn.click();

    const frontVerb = page.locator('.verb-infinitive');
    await expect(frontVerb).toBeVisible();
    const firstVerbText = await frontVerb.textContent();

    const learningBtn = page.locator('.btn-learning');
    await learningBtn.click();

    const nextVerbText = await frontVerb.textContent();
    expect(nextVerbText).not.toBe(firstVerbText);
  });

  test('should pronounce example sentence when clicking on German sentence text in List View', async ({ page }) => {
    const viewGlossary = page.locator('#view-glossary');
    await expect(viewGlossary).toBeVisible();

    const exSentenceText = page.locator('.verb-inline-example-box .ex-sentence-span').first();
    await expect(exSentenceText).toBeVisible();
    await exSentenceText.click();
  });

  test('should configure custom Auto-Play Audio sequence (repeat count, English TTS, start location)', async ({ page }) => {
    const viewGlossary = page.locator('#view-glossary');
    await expect(viewGlossary).toBeVisible();

    // Select 2x per word
    const repeatSelect = page.locator('#auto-repeat-count');
    await repeatSelect.selectOption('2');

    // Select 1st Example Only
    const exampleSelect = page.locator('#auto-example-mode');
    await exampleSelect.selectOption('first');

    // Ensure Speak English Translation is checked
    const englishCheck = page.locator('#auto-include-en');
    await expect(englishCheck).toBeChecked();

    // Click Auto Play Audio button
    const autoPlayBtn = page.locator('#btn-play-all-words');
    await autoPlayBtn.click();

    // Check playing button state
    await expect(autoPlayBtn).toHaveText(/Auto Playing/);

    // Verify row highlighting
    const highlightedRow = page.locator('tr.highlighted-speech');
    await expect(highlightedRow).toBeVisible();

    // Click Stop button
    const stopBtn = page.locator('#btn-stop-words');
    await stopBtn.click();
    await expect(autoPlayBtn).toHaveText(/Auto Play Audio/);
  });

  test('should start Auto-Play from a specific row when clicking play button ▶', async ({ page }) => {
    const viewGlossary = page.locator('#view-glossary');
    await expect(viewGlossary).toBeVisible();

    // Click ▶ on 3rd row
    const rowPlayBtn = page.locator('button[data-action="play-from-row"]').nth(2);
    await rowPlayBtn.click();

    // Verify button state changes to Auto Playing
    const autoPlayBtn = page.locator('#btn-play-all-words');
    await expect(autoPlayBtn).toHaveText(/Auto Playing/);

    // Verify 3rd row gets highlighted
    const targetRow = page.locator('tr').nth(3); // nth(0) is header
    await expect(targetRow).toHaveClass(/highlighted-speech/);
  });

});
