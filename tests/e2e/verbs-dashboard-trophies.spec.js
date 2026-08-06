import { test, expect } from '@playwright/test';

test.describe('Verbs Dashboard & Trophy Shelf E2E Suite (WP-041)', () => {
  let consoleErrors = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(`[Page Error] ${err.message}`));

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

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async function seedVerbProgress(page, data) {
    // index.html has no app.js beforeunload wipe, safe place to seed, then reload target page
    await page.goto('/index.html');
    await page.evaluate((seed) => {
      const raw = localStorage.getItem('german_app_progress_a1_app_data');
      const base = raw ? JSON.parse(raw) : {};
      localStorage.setItem('german_app_progress_a1_app_data', JSON.stringify({ ...base, ...seed }));
    }, data);
  }

  async function openVerbs(page) {
    await page.goto('/verbs.html');
    await page.waitForFunction('window.verbsEngine !== undefined && window.verbsEngine.dataset !== null');
  }

  async function openFlashcards(page) {
    await openVerbs(page);
    await page.locator('button:has-text("Flashcards Mode")').click();
    await expect(page.locator('.verb-infinitive')).toBeVisible();
  }

  async function getVerbProgress(page) {
    return page.evaluate(() => {
      const raw = localStorage.getItem('german_app_progress_a1_app_data');
      return raw ? JSON.parse(raw) : {};
    });
  }

  test('marking a brand-new flashcard as Known records activity for today on the verbs page', async ({ page }) => {
    await seedVerbProgress(page, { activity: {}, ttsDaily: {} });
    await openFlashcards(page);

    await page.locator('.btn-known').click();

    await page.waitForFunction(() => {
      const raw = localStorage.getItem('german_app_progress_a1_app_data');
      if (!raw) return false;
      const data = JSON.parse(raw);
      return data.activity && Object.keys(data.activity).length > 0;
    });

    const progress = await getVerbProgress(page);
    const today = todayStr();
    expect(progress.activity[today]).toBe(1);

    // Dashboard: streak + graph render, current streak = 1
    await page.evaluate(() => window.verbsEngine.switchView('dashboard'));
    await page.waitForSelector('#activity-graph .act-cell');

    const currentStreak = await page.locator('#stat-streak-current').textContent();
    expect(currentStreak.trim()).toBe('1');
    const activeDays = await page.locator('#stat-active-days').textContent();
    expect(activeDays.trim()).toBe('1');
    const todayCount = await page.locator('#stat-today-count').textContent();
    expect(todayCount.trim()).toBe('1');

    const todayCells = await page.locator('.act-cell.act-today').count();
    expect(todayCells).toBe(1);

    // Dashboard stat cards reflect the single known verb
    await expect(page.locator('#verb-stat-known')).toHaveText('1');
  });

  test('listening to 15+ verbs via TTS counts as a learning day on the verbs page', async ({ page }) => {
    await seedVerbProgress(page, { knownVerbIds: [], activity: {}, ttsDaily: {} });
    await openVerbs(page);

    for (let i = 0; i < 14; i++) {
      await page.evaluate(() => window.verbsEngine.speakText('werden'));
    }
    await page.waitForTimeout(100);
    let progress = await getVerbProgress(page);
    const today = todayStr();
    expect(progress.ttsDaily[today]).toBe(14);
    expect(progress.activity[today]).toBeUndefined();

    await page.evaluate(() => window.verbsEngine.speakText('werden'));

    await page.waitForFunction(() => {
      const raw = localStorage.getItem('german_app_progress_a1_app_data');
      if (!raw) return false;
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      return (JSON.parse(raw).activity || {})[key] >= 1;
    });

    progress = await getVerbProgress(page);
    expect(progress.activity[today]).toBe(1);
  });

  test('trophy shelf renders cards and shows earned deck trophies from seeded progress', async ({ page }) => {
    // Seed: 50 known verbs (first 50 = one full deck) + finished deck 1
    await seedVerbProgress(page, {
      knownVerbIds: [],
      finishedVerbDecks: [1],
      studyDates: [],
      ttsCount: 25
    });
    await openVerbs(page);
    await page.evaluate(() => window.verbsEngine.switchView('trophies'));
    await page.waitForSelector('#verb-trophy-container .trophy-card');

    const trophyCards = await page.locator('#verb-trophy-container .trophy-card').count();
    expect(trophyCards).toBeGreaterThan(5);

    // The "Deck Champion" card (finish any single deck) should be earned
    const deckChampion = await page.locator('.trophy-card.earned', { hasText: 'Deck Champion' }).count();
    expect(deckChampion).toBe(1);
  });
});
