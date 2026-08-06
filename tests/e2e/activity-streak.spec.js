import { test, expect } from '@playwright/test';

test.describe('Learning Activity / Streak Tracker E2E Suite', () => {
  let consoleErrors = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', msg => {
      console.log(`[Browser Console ${msg.type()}] ${msg.text()}`);
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      console.log(`[Browser Uncaught Error] ${err.message}\nStack: ${err.stack}`);
      consoleErrors.push(`[Page Error] ${err.message}\nStack: ${err.stack}`);
    });

    // Mock speechSynthesis deterministically
    await page.addInitScript(() => {
      window.__mockTTS = { currentUtterance: null, speakCount: 0 };
      const mockSpeechSynthesis = {
        speaking: false,
        paused: false,
        pending: false,
        getVoices: () => [{ lang: 'de-DE', name: 'Mock Voice' }],
        speak: (utterance) => {
          mockSpeechSynthesis.speaking = true;
          window.__mockTTS.currentUtterance = utterance;
          window.__mockTTS.speakCount++;
          if (utterance.onend) {
            setTimeout(() => {
              mockSpeechSynthesis.speaking = false;
              utterance.onend(new Event('end'));
            }, 50);
          }
        },
        cancel: () => { mockSpeechSynthesis.speaking = false; }
      };
      Object.defineProperty(window, 'speechSynthesis', {
        value: mockSpeechSynthesis,
        configurable: true,
        writable: true
      });
      window.SpeechSynthesisUtterance = class {
        constructor(text) { this.text = text; }
      };
    });
  });

  test.afterEach(async () => {
    if (consoleErrors.length > 0) {
      console.error('Console errors detected during test execution:', consoleErrors);
    }
  });

  async function initEmptyProgressAndOpen(page) {
    await page.goto('/index.html');
    await page.evaluate(() => {
      localStorage.removeItem('german_app_progress_german-a1-app');
    });
    await page.waitForSelector('.a1-card');
    await page.locator('.a1-card').click();
    await page.waitForSelector('.nav-item');
    await page.waitForFunction('window.app !== undefined');
  }

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  test('marking a brand-new flashcard as Known records activity for today', async ({ page }) => {
    await initEmptyProgressAndOpen(page);

    await page.locator('button', { hasText: 'Flashcards' }).click();
    await page.waitForSelector('.flashcard-container');
    await page.locator('#active-flashcard').click();
    await page.locator('.fc-btn.btn-known').click();

    // Wait for activity to be saved
    await page.waitForFunction(() => {
      const raw = localStorage.getItem('german_app_progress_german-a1-app');
      if (!raw) return false;
      const data = JSON.parse(raw);
      return data.activity && Object.keys(data.activity).length > 0;
    });

    const progress = await page.evaluate(() => {
      const raw = localStorage.getItem('german_app_progress_german-a1-app');
      return raw ? JSON.parse(raw) : {};
    });
    const today = todayStr();
    expect(progress.activity[today]).toBe(1);

    // Dashboard: streak + graph render, current streak = 1
    await page.evaluate(() => window.app.switchView('dashboard'));
    await page.waitForSelector('#activity-graph .act-cell');

    const currentStreak = await page.locator('#stat-streak-current').textContent();
    expect(currentStreak.trim()).toBe('1');
    const bestStreak = await page.locator('#stat-streak-best').textContent();
    expect(bestStreak.trim()).toBe('1');
    const activeDays = await page.locator('#stat-active-days').textContent();
    expect(activeDays.trim()).toBe('1');
    const todayCount = await page.locator('#stat-today-count').textContent();
    expect(todayCount.trim()).toBe('1');

    // Exactly one "today" cell should exist in the graph
    const todayCells = await page.locator('.act-cell.act-today').count();
    expect(todayCells).toBe(1);
  });

  test('re-marking an already-known card does not double-count activity', async ({ page }) => {
    await initEmptyProgressAndOpen(page);

    await page.locator('button', { hasText: 'Flashcards' }).click();
    await page.waitForSelector('.flashcard-container');

    // Mark the first (new) card as known
    await page.locator('#active-flashcard').click();
    await page.locator('.fc-btn.btn-known').click();
    await page.waitForFunction(() => {
      const raw = localStorage.getItem('german_app_progress_german-a1-app');
      if (!raw) return false;
      return Object.keys(JSON.parse(raw).activity || {}).length > 0;
    });

    // Go back to the first card (already known) and mark it Known again
    await page.locator('.fc-nav .btn', { hasText: 'Prev' }).click();
    await page.locator('#active-flashcard').click();
    await page.locator('.fc-btn.btn-known').click();

    const progress = await page.evaluate(() => {
      const raw = localStorage.getItem('german_app_progress_german-a1-app');
      return raw ? JSON.parse(raw) : {};
    });
    const today = todayStr();
    expect(progress.activity[today]).toBe(1);
  });

  test('listening to 15+ words via TTS counts as a learning day without flashcards', async ({ page }) => {
    await initEmptyProgressAndOpen(page);

    // Speak 14 words → no activity yet
    for (let i = 0; i < 14; i++) {
      await page.evaluate(() => window.app.speakText('Haus'));
    }
    await page.waitForTimeout(100);
    let progress = await page.evaluate(() => {
      const raw = localStorage.getItem('german_app_progress_german-a1-app');
      return raw ? JSON.parse(raw) : {};
    });
    const today = todayStr();
    expect(progress.ttsDaily[today]).toBe(14);
    expect(progress.activity[today]).toBeUndefined();

    // Speak 1 more → threshold reached
    await page.evaluate(() => window.app.speakText('Haus'));

    await page.waitForFunction(() => {
      const raw = localStorage.getItem('german_app_progress_german-a1-app');
      if (!raw) return false;
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      return (JSON.parse(raw).activity || {})[key] >= 1;
    });

    progress = await page.evaluate(() => {
      const raw = localStorage.getItem('german_app_progress_german-a1-app');
      return raw ? JSON.parse(raw) : {};
    });
    expect(progress.activity[today]).toBe(1);

    await page.evaluate(() => window.app.switchView('dashboard'));
    await page.waitForSelector('#activity-graph .act-cell');
    const currentStreak = await page.locator('#stat-streak-current').textContent();
    expect(currentStreak.trim()).toBe('1');
  });

  test('streak is preserved when today has no activity but yesterday does', async ({ page }) => {
    // Seed activity for yesterday and the day before, none today
    await page.goto('/index.html');
    await page.evaluate(() => {
      const fmt = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      const now = new Date();
      const yesterday = new Date(now.getTime() - 86400000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 86400000);

      const raw = localStorage.getItem('german_app_progress_german-a1-app');
      const data = raw ? JSON.parse(raw) : {};
      data.activity = {
        [fmt(twoDaysAgo)]: 4,
        [fmt(yesterday)]: 7
      };
      localStorage.setItem('german_app_progress_german-a1-app', JSON.stringify(data));
    });

    // Navigate to level page fresh (index.html has no app.js, so no beforeunload wipe)
    await page.goto('/level.html?level=a1');
    await page.waitForFunction('window.app !== undefined');

    await page.evaluate(() => window.app.switchView('dashboard'));
    await page.waitForSelector('#activity-graph .act-cell');

    const currentStreak = await page.locator('#stat-streak-current').textContent();
    expect(currentStreak.trim()).toBe('2');
    const bestStreak = await page.locator('#stat-streak-best').textContent();
    expect(bestStreak.trim()).toBe('2');
    const activeDays = await page.locator('#stat-active-days').textContent();
    expect(activeDays.trim()).toBe('2');
  });
});