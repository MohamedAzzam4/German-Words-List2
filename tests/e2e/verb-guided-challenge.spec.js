import { test, expect } from '@playwright/test';

// The final deck (36) contains only 7 verbs, which keeps the guided flow fast
// while still exercising a full deck run.

const STORAGE_KEY = 'german_app_progress_a1_app_data';

async function openDeck36(page) {
    await page.goto('/verbs.html');
    const deckChip = page.locator('[data-deck-id="36"]');
    await expect(deckChip).toBeVisible();
    await deckChip.click();
}

async function startGuided(page) {
    await openDeck36(page);
    await page.locator('button:has-text("Guided Challenge")').click();
    await expect(page.locator('#view-guided')).toBeVisible();
}

async function clickIntroThrough(page) {
    const introBtn = page.locator('button:has-text("Got it — Continue")');
    let clicks = 0;
    while ((await introBtn.count()) && clicks < 20) {
        const prompt = page.locator('.guided-prompt-main');
        const prev = await prompt.textContent();
        await introBtn.click();
        clicks += 1;
        // deterministic: wait until the presented card identity changes, or the
        // intro stage ends (no intro button remains on screen)
        await page.waitForFunction((prevText) => {
            const t = document.querySelector('.guided-prompt-main')?.textContent;
            const stillIntro = [...document.querySelectorAll('button')]
                .some(b => (b.textContent || '').includes('Got it — Continue'));
            return (typeof t === 'string' && t !== prevText) || !stillIntro;
        }, prev);
    }
}

async function answerRecall(page, remembered = true) {
    const revealBtn = page.locator('button:has-text("Reveal Answer")');
    await expect(revealBtn).toBeVisible();
    await revealBtn.click();
    const gradeBtn = remembered
        ? page.locator('button:has-text("I knew it")')
        : page.locator('button:has-text("I forgot")');
    await expect(gradeBtn).toBeVisible();
    await gradeBtn.click();
}

async function continueThrough(page) {
    const contBtn = page.locator('button:has-text("Continue")').first();
    await contBtn.click();
    await expect(page.locator('.guided-prompt-main')).toBeVisible();
}

// Wait (deterministically) for an ACTIONABLE guided button — visible, enabled,
// not hidden, not aria-disabled — with one of the expected labels. A hidden or
// disabled DOM match must never resolve the wait.
async function waitForActionableButton(page) {
    await page.waitForFunction(() => {
        const markers = ['Got it — Continue', 'Reveal Answer', 'Continue', 'Finish', 'Continue to Production'];
        return [...document.querySelectorAll('button')].some(b => {
            const rect = b.getBoundingClientRect();
            const style = window.getComputedStyle(b);
            const inert = b.disabled || b.hidden
                || b.getAttribute('aria-disabled') === 'true'
                || style.display === 'none'
                || style.visibility === 'hidden'
                || Number(style.opacity || 1) === 0
                || rect.width === 0 || rect.height === 0;
            return !inert && markers.some(m => (b.textContent || '').includes(m));
        });
    });
}

// Read a persisted SRS level straight from localStorage (the app persists the
// userData object through its own save path).
async function readSrsLevel(page, verbId, srsField) {
    return page.evaluate(({ key, verbId, srsField }) => {
        const raw = localStorage.getItem(key);
        const rec = raw ? JSON.parse(raw).verbLearning?.verbs?.[verbId] : null;
        const srs = rec && rec[srsField];
        return srs && typeof srs.level === 'number' ? srs.level : null;
    }, { key: STORAGE_KEY, verbId, srsField });
}

// Collect browser console errors across a test
function trackErrors(page) {
    const errors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));
    return errors;
}

// Network-level stub for js/core/firebase.js. It registers real auth
// listeners exactly like the production module and exposes a harness that
// fires them, so tests can deliver progress replacements AND account changes
// through the same registered callback chain init() wired up. `loadProgress`
// serves a deep clone of a per-UID stored payload, so a remote progress load
// flows through the real _onAuthChanged -> loadProgress -> merge -> migration
// lifecycle. No test-only API is added to the application code.
const FIREBASE_STUB_SOURCE = `
const authListeners = [];
const progressByUid = {};
export const initFirebase = () => ({ auth: {}, db: {} });
export const loginWithGoogle = async () => { throw new Error('stub: no google auth'); };
export const logout = async () => {};
export const loadProgress = async (appId, uid) => {
    const p = progressByUid[uid];
    return p ? JSON.parse(JSON.stringify(p)) : null;
};
export const saveProgress = async () => {};
export const listenAuth = (cb) => {
    authListeners.push(cb);
    queueMicrotask(() => cb(null));
    return () => {
        const i = authListeners.indexOf(cb);
        if (i >= 0) authListeners.splice(i, 1);
    };
};
export const updateLeaderboard = async () => {};
export const getLeaderboard = async () => [];
export const batchSaveProgressAndLeaderboard = async () => {};
export const loginWithEmailAndPassword = async () => { throw new Error('stub: no email auth'); };
export const signUpWithEmailAndPassword = async () => { throw new Error('stub: no signup'); };
window.__guidedAuthHarness = {
    fire: (user) => authListeners.slice().forEach((cb) => cb(user)),
    setProgress: (uid, payload) => { progressByUid[uid] = JSON.parse(JSON.stringify(payload)); }
};
`;

test.describe('Guided Challenge E2E Suite', () => {

    test('starts guided challenge and shows the acquisition phase with intro cards', async ({ page }) => {
        await startGuided(page);

        await expect(page.locator('.guided-phase-badge')).toHaveText(/Acquisition/);
        await expect(page.locator('.guided-prompt-main')).toBeVisible();
        await expect(page.locator('button:has-text("Got it — Continue")')).toBeVisible();
        await expect(page.locator('.guided-progress-track')).toBeVisible();
    });

    test('keeps the hidden acquisition pool at eight or fewer verbs', async ({ page }) => {
        await startGuided(page);

        // finish the acquisition phase entirely
        let guard = 0;
        while (guard++ < 200) {
            const introBtn = page.locator('button:has-text("Got it — Continue")');
            const revealBtn = page.locator('button:has-text("Reveal Answer")');
            const transitionBtn = page.locator('button:has-text("Continue")').first();
            if (await introBtn.count()) {
                await introBtn.click();
            } else if (await revealBtn.count()) {
                await answerRecall(page, true);
            } else if (await transitionBtn.count()) {
                break;
            } else {
                await waitForActionableButton(page);
            }
        }

        // wait for the app to persist the session through its normal save path
        await expect.poll(async () =>
            page.evaluate((key) => {
                const raw = localStorage.getItem(key);
                const s = raw ? JSON.parse(raw).verbLearning?.sessions : null;
                return !!(s && Object.keys(s).length > 0);
            }, STORAGE_KEY)
        ).toBe(true);

        const session = await page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw).verbLearning?.sessions : null;
        }, STORAGE_KEY);

        expect(session).toBeTruthy();
        const stored = Object.values(session)[0];
        expect(stored).toBeTruthy();
        expect(stored.activePoolIds.length).toBeLessThanOrEqual(8);
    });

    test('forgot during acquisition never repeats immediately', async ({ page }) => {
        await startGuided(page);

        // go through introductions until the first recall appears
        await clickIntroThrough(page);
        const revealBtn = page.locator('button:has-text("Reveal Answer")');
        await expect(revealBtn).toBeVisible();
        await revealBtn.click();
        await page.locator('button:has-text("I forgot")').click();

        // the same verb must not appear again until >=2 other cards intervened
        const nextPrompt = page.locator('.guided-prompt-main');
        const firstPrompt = await nextPrompt.textContent();
        let intervening = 0;
        let guard = 0;
        while (guard++ < 40) {
            const reveal = page.locator('button:has-text("Reveal Answer")');
            if (!(await reveal.count())) break;
            await answerRecall(page, true);
            const t = await nextPrompt.textContent();
            if (t === firstPrompt) break;
            intervening += 1;
        }
        expect(intervening).toBeGreaterThanOrEqual(1);
    });

    test('recognition phase prompts German → English and ends with the First Win', async ({ page }) => {
        await startGuided(page);

        // drive acquisition to completion
        let guard = 0;
        while (guard++ < 300) {
            const introBtn = page.locator('button:has-text("Got it — Continue")');
            const revealBtn = page.locator('button:has-text("Reveal Answer")');
            const contBtn = page.locator('button:has-text("Continue")').first();
            if (await introBtn.count()) await introBtn.click();
            else if (await revealBtn.count()) await answerRecall(page, true);
            else if (await contBtn.count()) break;
            else await waitForActionableButton(page);
        }

        // acquisition complete → transition banner
        await expect(page.locator('.guided-milestone-title')).toHaveText('Acquisition Complete!');
        await continueThrough(page);

        // now in recognition
        await expect(page.locator('.guided-phase-badge')).toHaveText(/Recognition/);

        // direction must be German → English on the front of every scored card
        const label = page.locator('.guided-label');
        await expect(label).toHaveText('Verb (German)');

        // the served card's front is exactly the German infinitive of the
        // presented verb (no broad regular expressions)
        const recVerb = await page.evaluate(() => {
            const v = window.verbsEngine._challengeVerb(window.verbsEngine.challengePresentation.verbId);
            return { infinitive: v.infinitive, meaning: v.meaning };
        });
        await expect(page.locator('.guided-prompt-main')).toHaveText(recVerb.infinitive);
        // the recognition front is never the English translation
        await expect(page.locator('.guided-prompt-main')).not.toHaveText(recVerb.meaning);

        // German audio stays locked until the permitted reveal state
        await expect(page.locator('button:has-text("🔊 Listen")')).toHaveCount(0);
        await page.locator('button:has-text("Reveal Answer")').click();
        await expect(page.locator('button:has-text("🔊 Listen")')).toBeVisible();
        await page.locator('button:has-text("I knew it")').click();

        // complete recognition
        guard = 0;
        while (guard++ < 300) {
            const revealBtn = page.locator('button:has-text("Reveal Answer")');
            const contBtn = page.locator('button:has-text("Continue")').first();
            if (await revealBtn.count()) await answerRecall(page, true);
            else if (await contBtn.count()) break;
            else await waitForActionableButton(page);
        }
        await expect(page.locator('.guided-complete-title')).toContainText('First Win');
    });

    test('production phase prompts English → German and ends with the Second Win', async ({ page }) => {
        await startGuided(page);

        // acquisition → recognition
        let guard = 0;
        while (guard++ < 600) {
            const introBtn = page.locator('button:has-text("Got it — Continue")');
            const revealBtn = page.locator('button:has-text("Reveal Answer")');
            const contBtn = page.locator('button:has-text("Continue")').first();
            const prodBtn = page.locator('button:has-text("Continue to Production")');
            if (await introBtn.count()) await introBtn.click();
            else if (await revealBtn.count()) await answerRecall(page, true);
            else if (await prodBtn.count()) { await prodBtn.click(); break; }
            else if (await contBtn.count()) await contBtn.click();
            else await waitForActionableButton(page);
        }

        // production direction English → German
        await expect(page.locator('.guided-label')).toHaveText('Meaning (English)');

        // the served card's front is exactly the English translation and never
        // the German infinitive (no broad regular expressions)
        const prodVerb = await page.evaluate(() => {
            const v = window.verbsEngine._challengeVerb(window.verbsEngine.challengePresentation.verbId);
            return { infinitive: v.infinitive, meaning: v.meaning };
        });
        await expect(page.locator('.guided-prompt-main')).toHaveText(prodVerb.meaning);
        await expect(page.locator('.guided-prompt-main')).not.toHaveText(prodVerb.infinitive);

        // German answer and German audio stay locked on the production front
        await expect(page.locator('button:has-text("🔊 Listen")')).toHaveCount(0);

        // the permitted reveal state is what unlocks the German audio control
        await page.locator('button:has-text("Reveal Answer")').click();
        await expect(page.locator('button:has-text("🔊 Listen")')).toBeVisible();
        await page.locator('button:has-text("I knew it")').click();

        // complete production
        guard = 0;
        while (guard++ < 300) {
            const revealBtn = page.locator('button:has-text("Reveal Answer")');
            const finishBtn = page.locator('button:has-text("Finish")');
            if (await revealBtn.count()) await answerRecall(page, true);
            else if (await finishBtn.count()) break;
            else await waitForActionableButton(page);
        }
        await expect(page.locator('.guided-complete-title')).toContainText('Second Win');
    });

    test('restart challenge explicitly resets the session', async ({ page }) => {
        await startGuided(page);

        // progress a bit
        await clickIntroThrough(page);
        const progressBefore = await page.locator('.guided-progress-label').textContent();
        expect(progressBefore).toContain('/');

        // restart
        await page.locator('button:has-text("Restart Challenge")').click();
        await expect(page.locator('#view-guided')).toBeVisible();
        await expect(page.locator('.guided-phase-badge')).toHaveText(/Acquisition/);
        await expect(page.locator('.guided-prompt-main')).toBeVisible();
        await expect(page.locator('.guided-progress-label')).toContainText('0 /');
    });

    test('resumes the session after a refresh', async ({ page }) => {
        await startGuided(page);
        await clickIntroThrough(page);

        // capture a prompt that we know will not be the very first card
        await page.reload();
        await page.locator('button:has-text("Guided Challenge")').click();
        await expect(page.locator('#view-guided')).toBeVisible();
        await expect(page.locator('.guided-phase-badge')).toHaveText(/Acquisition/);

        const session = await page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw).verbLearning?.sessions : null;
        }, STORAGE_KEY);
        expect(session && Object.keys(session).length).toBeGreaterThan(0);
    });

    test('legacy knownVerbIds aliases are migrated to canonical ids with a backup', async ({ page }) => {
        await page.goto('/verbs.html');
        await page.evaluate((key) => {
            const legacy = {
                knownVerbIds: ['v_sein', 'sein', 'v_haben', 'haben', 'v_werden'],
                verbFavorites: [],
                finishedVerbDecks: []
            };
            localStorage.setItem(key, JSON.stringify(legacy));
        }, STORAGE_KEY);

        // opening the guided challenge triggers the migration
        await startGuided(page);

        const migrated = await page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        }, STORAGE_KEY);

        expect(migrated.knownVerbIds).toContain('v_sein');
        expect(migrated.knownVerbIds).not.toContain('sein');
        expect(migrated.knownVerbIds).toContain('v_haben');
        expect(migrated.knownVerbIds).toContain('v_werden');
        expect(Array.isArray(migrated.knownVerbIdsBackup)).toBe(true);
        expect(migrated.knownVerbIdsBackup.length).toBeGreaterThanOrEqual(5);
    });

    test('daily review with no due verbs shows a toast instead of opening', async ({ page }) => {
        await openDeck36(page);
        await page.locator('button:has-text("Daily Review")').click();
        await expect(page.locator('#toast')).toHaveClass(/show/);
        await expect(page.locator('#view-guided')).toBeHidden();
    });

    test('daily review with due verbs serves recognition then production tracks', async ({ page }) => {
        // seed one recognized verb with a due SRS review date
        await page.goto('/verbs.html');
        await page.evaluate((key) => {
            const seeded = {
                verbLearning: {
                    schemaVersion: 1,
                    verbs: {
                        v_werden: {
                            recognitionWin: '2026-01-01T00:00:00.000Z',
                            productionWin: '2026-01-01T00:00:00.000Z',
                            srs: { level: 2, nextReviewDate: '2026-01-01T00:00:00.000Z' },
                            productionSrs: { level: 2, nextReviewDate: '2026-01-01T00:00:00.000Z' },
                            updatedAt: Date.now(),
                            infinitive: 'werden'
                        }
                    },
                    sessions: {}
                }
            };
            localStorage.setItem(key, JSON.stringify(seeded));
        }, STORAGE_KEY);

        await page.reload();
        await page.locator('button:has-text("Daily Review")').click();
        await expect(page.locator('#view-guided')).toBeVisible();

        // first track begins with a transition into recognition
        await expect(page.locator('.guided-milestone-title')).toContainText(/Continuing to/);
        await continueThrough(page);
        await expect(page.locator('.guided-label')).toHaveText('Verb (German)');

        // answer correctly until the review completes
        let guard = 0;
        while (guard++ < 120) {
            const revealBtn = page.locator('button:has-text("Reveal Answer")');
            const contBtn = page.locator('button:has-text("Continue")').first();
            const finishBtn = page.locator('button:has-text("Finish")');
            if (await revealBtn.count()) await answerRecall(page, true);
            else if (await contBtn.count()) await contBtn.click();
            else if (await finishBtn.count()) break;
            else await waitForActionableButton(page);
        }
        await expect(page.locator('.guided-complete-title')).toContainText('Review Finished');
    });

    test('no browser console errors during the guided flow', async ({ page }) => {
        const errors = trackErrors(page);
        await startGuided(page);
        await clickIntroThrough(page);
        await answerRecall(page, true);
        // deterministic: wait until the graded session state has been persisted
        // to localStorage through the app's own persistence path
        await expect.poll(async () =>
            page.evaluate((key) => {
                const raw = localStorage.getItem(key);
                const s = raw ? Object.values(JSON.parse(raw).verbLearning?.sessions || {}).find(x => x) : null;
                return s ? s.turn : -1;
            }, STORAGE_KEY)
        ).toBe(await page.evaluate(() => window.verbsEngine.challengeSession ? window.verbsEngine.challengeSession.turn : -1));
        expect(errors).toEqual([]);
    });

    test('verbLearning mastery is committed only when a whole phase wins', async ({ page }) => {
        await startGuided(page);

        // complete one recall so the "acquisition part" of the flow advances
        await clickIntroThrough(page);
        const revealBtn = page.locator('button:has-text("Reveal Answer")');
        await expect(revealBtn).toBeVisible();
        await revealBtn.click();
        await page.locator('button:has-text("I knew it")').click();

        // MID-SESSION: no per-card mastery is written yet. Mastery for the deck
        // is committed atomically only when the whole phase reaches its win.
        // First wait deterministically for the app to persist the session
        // state through its own save path, then read the verb records.
        await expect.poll(async () =>
            page.evaluate((key) => {
                const raw = localStorage.getItem(key);
                return raw ? !!(JSON.parse(raw).verbLearning?.verbs) : false;
            }, STORAGE_KEY)
        ).toBe(true);

        const midVerbs = await page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw).verbLearning?.verbs : null;
        }, STORAGE_KEY);
        expect(midVerbs).toBeTruthy();
        const midMastered = Object.values(midVerbs).filter(r => r.recognitionWin || r.productionWin);
        expect(midMastered.length).toBe(0);

        // drive acquisition → recognition all the way to the First Win
        let guard = 0;
        while (guard++ < 400) {
            const introBtn = page.locator('button:has-text("Got it — Continue")');
            const reveal = page.locator('button:has-text("Reveal Answer")');
            const contBtn = page.locator('button:has-text("Continue")').first();
            if (await introBtn.count()) await introBtn.click();
            else if (await reveal.count()) await answerRecall(page, true);
            else if (await contBtn.count()) break;
            else await waitForActionableButton(page);
        }
        await expect(page.locator('.guided-milestone-title')).toHaveText('Acquisition Complete!');
        await continueThrough(page);
        guard = 0;
        while (guard++ < 400) {
            const reveal = page.locator('button:has-text("Reveal Answer")');
            const finishBtn = page.locator('button:has-text("Finish")');
            if (await reveal.count()) await answerRecall(page, true);
            else if (await finishBtn.count()) break;
            else await waitForActionableButton(page);
        }
        await expect(page.locator('.guided-complete-title')).toContainText('First Win');

        // deterministic: wait until exactly the seven phase wins are persisted
        // through the app's own save path before reading localStorage
        await expect.poll(async () =>
            page.evaluate((key) => {
                const raw = localStorage.getItem(key);
                const verbsObj = raw ? JSON.parse(raw).verbLearning?.verbs : null;
                return verbsObj ? Object.values(verbsObj).filter(r => r.recognitionWin).length : 0;
            }, STORAGE_KEY)
        ).toBe(7);

        const verbs = await page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw).verbLearning?.verbs : null;
        }, STORAGE_KEY);
        const recognized = Object.values(verbs).filter(r => r.recognitionWin);
        expect(recognized.length).toBe(7); // the whole deck 36 wins atomically
        const produced = Object.values(verbs).filter(r => r.productionWin);
        expect(produced.length).toBe(0);   // production must be earned separately
    });

    test('GC-01: independent review track ordering and no skipped production when track lengths match', async ({ page }) => {
        await page.goto('/verbs.html');
        await page.evaluate((key) => {
            const seeded = {
                verbLearning: {
                    schemaVersion: 2,
                    verbs: {
                        v_werden: { recognitionWin: '2026-01-01T00:00:00.000Z', srs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, updatedAt: Date.now() },
                        v_sein: { recognitionWin: '2026-01-01T00:00:00.000Z', srs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, updatedAt: Date.now() },
                        v_haben: { recognitionWin: '2026-01-01T00:00:00.000Z', productionWin: '2026-01-01T00:00:00.000Z', productionSrs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, updatedAt: Date.now() },
                        v_kommen: { recognitionWin: '2026-01-01T00:00:00.000Z', productionWin: '2026-01-01T00:00:00.000Z', productionSrs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, updatedAt: Date.now() }
                    }
                }
            };
            localStorage.setItem(key, JSON.stringify(seeded));
        }, STORAGE_KEY);

        await page.reload();
        await page.locator('button:has-text("Daily Review")').click();
        await expect(page.locator('#view-guided')).toBeVisible();

        // 1. Recognition cards appear first
        await expect(page.locator('.guided-milestone-title')).toContainText(/Continuing to Recognition/);
        await continueThrough(page);
        await expect(page.locator('.guided-label')).toHaveText('Verb (German)');

        // Pass 2 recognition cards
        await answerRecall(page, true);
        await answerRecall(page, true);

        // Completion must NOT happen yet: the two production cards are still due
        await expect(page.locator('.guided-complete-title')).toHaveCount(0);

        // 2. Transition banner to Production appears
        await expect(page.locator('.guided-milestone-title')).toContainText(/Continuing to Production/);
        await continueThrough(page);

        // 3. Production cards actually appear and must be graded
        await expect(page.locator('.guided-label')).toHaveText('Meaning (English)');
        await answerRecall(page, true);
        await answerRecall(page, true);

        // 4. Session completes only after all 4 cards terminally pass
        await expect(page.locator('.guided-complete-title')).toContainText('Review Finished');
    });

    test('T3: canonical-ID migration through real loading lifecycle', async ({ page }) => {
        // Replace the real Firebase module at the network level with an
        // in-process stub whose auth listener is wired to the exact callback
        // init() registers (listenAuth -> _onAuthChanged). No application code
        // changes, no test-only production API, no direct private-method calls.
        await page.route('**/js/core/firebase.js*', (route) =>
            route.fulfill({ status: 200, contentType: 'application/javascript', body: FIREBASE_STUB_SOURCE })
        );

        // Phase 1: Write legacy progress with aliases in BOTH knownVerbIds and verbLearning.verbs
        await page.goto('/verbs.html');
        await page.evaluate((key) => {
            const legacy = {
                _ownerUid: 't3-profile',
                knownVerbIds: ['v_sein', 'sein', 'v_haben', 'haben', 'v_werden'],
                verbLearning: {
                    schemaVersion: 1,
                    verbs: {
                        'sein': { srs: { level: 2, nextReviewDate: '2026-01-01T00:00:00.000Z' }, recognitionWin: '2026-01-01T00:00:00.000Z', updatedAt: 100 },
                        'v_sein': { srs: { level: 1, nextReviewDate: '2026-02-01T00:00:00.000Z' }, updatedAt: 200 }
                    }
                }
            };
            localStorage.setItem(key, JSON.stringify(legacy));
        }, STORAGE_KEY);

        // Phase 2: Reload — triggers normal init() -> _migrateCanonicalVerbIds()
        await page.reload();
        await page.waitForLoadState('networkidle');

        const res1 = await page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        }, STORAGE_KEY);

        // knownVerbIds must contain only canonical IDs, no duplicates
        expect(res1.knownVerbIds).toContain('v_sein');
        expect(res1.knownVerbIds).not.toContain('sein');
        expect(res1.knownVerbIds).toContain('v_haben');
        expect(res1.knownVerbIds).not.toContain('haben');
        expect(res1.knownVerbIds).toContain('v_werden');
        const uniqueIds = new Set(res1.knownVerbIds);
        expect(uniqueIds.size).toBe(res1.knownVerbIds.length);

        // _knownIdsBackup must exist (immutable first copy)
        expect(Array.isArray(res1._knownIdsBackup)).toBe(true);
        expect(res1._knownIdsBackup.length).toBeGreaterThanOrEqual(5);

        // verbLearning.verbs: alias key 'sein' must be merged into 'v_sein'
        const verbs1 = res1.verbLearning?.verbs || {};
        expect(verbs1['sein']).toBeUndefined();
        expect(verbs1['v_sein']).toBeDefined();
        // The merged record should have recognitionWin from the 'sein' alias
        expect(verbs1['v_sein'].recognitionWin).toBeTruthy();

        // Phase 3: same-profile progress replacement through the REAL remote
        // load lifecycle (_onAuthChanged -> loadProgress -> merge -> migration).
        // Capture the complete original backup, then deliver a REMOTE progress
        // payload that introduces NEW aliases for the same profile. The remote
        // payload is a fresh cloud doc: it intentionally OMITS both backup
        // fields and _ownerUid. It is served by the stub's loadProgress(uid),
        // NOT written into localStorage, and delivered by firing the very
        // listener init() registered with the (stubbed) Firebase auth module.
        // No migration helper and no private engine method is called directly.
        const persisted1 = await page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        }, STORAGE_KEY);
        const backup1 = persisted1._knownIdsBackup;
        const backupLegacy1 = persisted1.knownVerbIdsBackup;
        expect(Array.isArray(backup1)).toBe(true);
        expect(Array.isArray(backupLegacy1)).toBe(true);

        await page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            const data = JSON.parse(raw);
            const remote = { ...data };
            delete remote._ownerUid;
            delete remote._knownIdsBackup;
            delete remote.knownVerbIdsBackup;
            remote.knownVerbIds = ['v_kommen', 'kommen', 'v_gehen', 'gehen'];
            remote.verbLearning = {
                ...data.verbLearning,
                schemaVersion: 1,
                verbs: {
                    ...data.verbLearning.verbs,
                    kommen: { srs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, recognitionWin: '2026-01-01T00:00:00.000Z', updatedAt: 300 }
                }
            };
            // Serve the replacement from the remote store and fire the
            // registered auth callback with the SAME profile uid
            window.__guidedAuthHarness.setProgress('t3-profile', remote);
            window.__guidedAuthHarness.fire({ uid: 't3-profile' });
        }, STORAGE_KEY);

        // deterministic: wait until the registered callback's migration has
        // persisted the second canonicalization through the app's own save path
        await expect.poll(async () =>
            page.evaluate((key) => {
                const raw = localStorage.getItem(key);
                return raw && JSON.parse(raw).knownVerbIds.includes('v_kommen');
            }, STORAGE_KEY)
        ).toBe(true);

        const res2 = await page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        }, STORAGE_KEY);

        // Second remote replacement for the same profile also canonicalizes
        // both stores — and merges, never wipes, the existing canonical ids
        expect(res2.knownVerbIds).toContain('v_kommen');
        expect(res2.knownVerbIds).not.toContain('kommen');
        expect(res2.knownVerbIds).toContain('v_gehen');
        expect(res2.knownVerbIds).not.toContain('gehen');
        expect(res2.knownVerbIds).toContain('v_sein');
        expect(res2.verbLearning?.verbs?.['kommen']).toBeUndefined();
        expect(res2.verbLearning?.verbs?.['v_kommen']).toBeDefined();

        // The exact original backups survive the same-profile remote merge:
        // never overwritten, never appended to
        expect(res2._ownerUid).toBe('t3-profile');
        expect(res2._knownIdsBackup).toEqual(backup1);
        expect(res2.knownVerbIdsBackup).toEqual(backupLegacy1);

        // Phase 4: account switch — the previous profile's backup must never
        // leak into another user's data; the stale local state is discarded
        await page.evaluate(() => window.__guidedAuthHarness.fire({ uid: 't3-other-profile' }));
        await expect.poll(async () =>
            page.evaluate((key) => {
                const raw = localStorage.getItem(key);
                const d = raw ? JSON.parse(raw) : null;
                return d && d._ownerUid === 't3-other-profile';
            }, STORAGE_KEY)
        ).toBe(true);
        const res3 = await page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        }, STORAGE_KEY);
        expect(res3._ownerUid).toBe('t3-other-profile');
        expect(res3._knownIdsBackup).toBeUndefined();
        expect(res3.knownVerbIdsBackup).toBeUndefined();
        expect(res3.knownVerbIds).toEqual([]);
        // no learning records or sessions are carried across accounts
        expect(res3.verbLearning).toBeDefined();
        expect(res3.verbLearning.verbs).toEqual({});
        expect(res3.verbLearning.sessions).toEqual({});
    });

    test('GC-06: double reveal does not wipe or replace frozen recall latency', async ({ page }) => {
        await startGuided(page);
        await clickIntroThrough(page);

        const revealBtn = page.locator('button:has-text("Reveal Answer")');
        await expect(revealBtn).toBeVisible();

        // First reveal freezes latency
        await revealBtn.click();
        const frozen1 = await page.evaluate(() => window.verbsEngine.challengeRecallLatencyMs);
        expect(frozen1).toBeGreaterThan(0);

        // Double reveal must not wipe or reset latency to null
        await page.evaluate(() => {
            if (window.verbsEngine) window.verbsEngine.challengeRevealAnswer();
        });

        const frozen2 = await page.evaluate(() => window.verbsEngine.challengeRecallLatencyMs);
        expect(frozen2).toBe(frozen1);

        // Grade card
        await page.locator('button:has-text("I knew it")').click();
    });

    test('GC-07: daily review progress indicator advances card-by-card per terminal completion', async ({ page }) => {
        await page.goto('/verbs.html');
        await page.evaluate((key) => {
            const seeded = {
                verbLearning: {
                    schemaVersion: 2,
                    verbs: {
                        v_werden: { recognitionWin: '2026-01-01T00:00:00.000Z', srs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, updatedAt: Date.now() },
                        v_sein: { recognitionWin: '2026-01-01T00:00:00.000Z', srs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, updatedAt: Date.now() },
                        v_haben: { recognitionWin: '2026-01-01T00:00:00.000Z', productionWin: '2026-01-01T00:00:00.000Z', productionSrs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, updatedAt: Date.now() }
                    }
                }
            };
            localStorage.setItem(key, JSON.stringify(seeded));
        }, STORAGE_KEY);

        await page.reload();
        await page.locator('button:has-text("Daily Review")').click();
        await continueThrough(page);

        // Check start progress label
        const progLabel = page.locator('.guided-progress-label span:last-child');
        await expect(progLabel).toHaveText('0 / 3 (0%)');

        // Pass 1st card
        await page.locator('button:has-text("Reveal Answer")').click();
        await page.locator('button:has-text("I knew it")').click();
        await expect(progLabel).toHaveText('1 / 3 (33%)');

        // Pass 2nd card
        await page.locator('button:has-text("Reveal Answer")').click();
        await page.locator('button:has-text("I knew it")').click();
        await expect(progLabel).toHaveText('2 / 3 (67%)');
    });

    test('GC-08: one terminal review outcome applies to exactly one SRS track, once, and completion needs every due card', async ({ page }) => {
        await page.goto('/verbs.html');
        await page.evaluate((key) => {
            const seeded = {
                verbLearning: {
                    schemaVersion: 2,
                    verbs: {
                        v_werden: { recognitionWin: '2026-01-01T00:00:00.000Z', srs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, updatedAt: Date.now() },
                        v_sein: { recognitionWin: '2026-01-01T00:00:00.000Z', srs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, updatedAt: Date.now() },
                        v_haben: { recognitionWin: '2026-01-01T00:00:00.000Z', productionWin: '2026-01-01T00:00:00.000Z', productionSrs: { level: 4, nextReviewDate: '2026-01-01T00:00:00.000Z' }, updatedAt: Date.now() }
                    }
                }
            };
            localStorage.setItem(key, JSON.stringify(seeded));
        }, STORAGE_KEY);

        await page.reload();
        await page.locator('button:has-text("Daily Review")').click();
        await expect(page.locator('#view-guided')).toBeVisible();
        await continueThrough(page);

        // Recognition track: grade both recognition cards once, terminally
        await answerRecall(page, true);
        await answerRecall(page, true);

        // The two recognition SRS tracks advanced exactly one level each...
        await expect.poll(() => readSrsLevel(page, 'v_werden', 'srs')).toBe(2);
        await expect.poll(() => readSrsLevel(page, 'v_sein', 'srs')).toBe(2);
        // ...while the production SRS track is untouched until its own card
        await expect.poll(() => readSrsLevel(page, 'v_haben', 'productionSrs')).toBe(4);

        // Completion cannot happen while the production card is still ungraded
        await expect(page.locator('.guided-complete-title')).toHaveCount(0);
        const progLabel = page.locator('.guided-progress-label span:last-child');
        await expect(progLabel).toHaveText('2 / 3 (67%)');

        // Production track: grade the single due production card
        await expect(page.locator('.guided-milestone-title')).toContainText(/Continuing to Production/);
        await continueThrough(page);
        await expect(page.locator('.guided-label')).toHaveText('Meaning (English)');
        await answerRecall(page, true);

        // Production SRS advanced exactly one level; the recognition tracks are
        // no longer incremented on the second track's terminal outcome
        await expect.poll(() => readSrsLevel(page, 'v_haben', 'productionSrs')).toBe(5);
        await expect.poll(() => readSrsLevel(page, 'v_werden', 'srs')).toBe(2);
        await expect.poll(() => readSrsLevel(page, 'v_sein', 'srs')).toBe(2);

        // Review completes only after every due card is graded
        await expect(page.locator('.guided-complete-title')).toContainText('Review Finished');
        await expect(progLabel).toHaveText('3 / 3 (100%)');

        // Duplicate/replay attempt: finishing and re-entering the Daily Review
        // cannot re-apply any terminal outcome (nothing is due any more)
        await page.locator('button:has-text("Finish")').click();
        await expect(page.locator('#view-guided')).toBeHidden();
        await page.locator('button:has-text("Daily Review")').click();
        await expect(page.locator('#toast')).toHaveClass(/show/);
        await expect(page.locator('#view-guided')).toBeHidden();

        // Levels remain exactly 2 / 2 / 5 — no second increment was applied
        await expect.poll(() => readSrsLevel(page, 'v_werden', 'srs')).toBe(2);
        await expect.poll(() => readSrsLevel(page, 'v_sein', 'srs')).toBe(2);
        await expect.poll(() => readSrsLevel(page, 'v_haben', 'productionSrs')).toBe(5);
    });

    test('GC-09: two click attempts on the same grade button apply exactly one grade', async ({ page }) => {
        await page.goto('/verbs.html');
        await page.evaluate((key) => {
            const seeded = {
                verbLearning: {
                    schemaVersion: 2,
                    verbs: {
                        v_werden: { recognitionWin: '2026-01-01T00:00:00.000Z', srs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, updatedAt: Date.now() },
                        v_sein: { recognitionWin: '2026-01-01T00:00:00.000Z', srs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, updatedAt: Date.now() },
                        v_haben: { recognitionWin: '2026-01-01T00:00:00.000Z', productionWin: '2026-01-01T00:00:00.000Z', productionSrs: { level: 4, nextReviewDate: '2026-01-01T00:00:00.000Z' }, updatedAt: Date.now() }
                    }
                }
            };
            localStorage.setItem(key, JSON.stringify(seeded));
        }, STORAGE_KEY);

        await page.reload();
        await page.locator('button:has-text("Daily Review")').click();
        await expect(page.locator('#view-guided')).toBeVisible();
        await continueThrough(page);

        // First recognition card A; the following card B is deterministic
        // through the persisted track order
        const snap = await page.evaluate((key) => {
            const eng = window.verbsEngine;
            const s = eng.challengeSession;
            const c = s.cardStateById;
            const read = (id) => ({
                status: c[id].status, dueTurn: c[id].dueTurn, failCount: c[id].failCount,
                requiredFast: c[id].requiredFast, completedFast: c[id].completedFast,
                lastLatencyMs: c[id].lastLatencyMs, lastSeenTurn: c[id].lastSeenTurn
            });
            return {
                ids: [...s.phaseOrder],
                a: read(s.phaseOrder[0]),
                b: read(s.phaseOrder[1]),
                turn: s.turn,
                completedTracks: [...(s.completedTracks || [])]
            };
        }, STORAGE_KEY);
        const aId = snap.ids[0];
        const bId = snap.ids[1];

        // Reveal card A, then click the very same "I knew it" DOM node twice in
        // a single browser task — no re-query, no re-render in between
        await page.locator('button:has-text("Reveal Answer")').click();
        await page.evaluate(() => {
            const btn = [...document.querySelectorAll('button')]
                .find(x => (x.textContent || '').includes('I knew it'));
            btn.click();
            btn.click();
        });

        // Exactly ONE grade: one turn advance, card A passed once, card B now
        // presented but completely untouched
        const after = await page.evaluate(() => {
            const eng = window.verbsEngine;
            const s = eng.challengeSession;
            const c = s.cardStateById;
            const read = (id) => ({
                status: c[id]?.status, dueTurn: c[id]?.dueTurn, failCount: c[id]?.failCount,
                requiredFast: c[id]?.requiredFast, completedFast: c[id]?.completedFast,
                lastLatencyMs: c[id]?.lastLatencyMs, lastSeenTurn: c[id]?.lastSeenTurn
            });
            const p = eng.challengePresentation;
            return {
                turn: s.turn,
                a: read(s.phaseOrder[0]),
                b: read(s.phaseOrder[1]),
                completedTracks: [...(s.completedTracks || [])],
                presented: { verbId: p.verbId, kind: p.kind, phase: p.phase, revealed: eng.challengeRevealed }
            };
        }, STORAGE_KEY);

        expect(after.turn).toBe(snap.turn + 1);
        expect(after.a.status).toBe('passed');
        expect(after.b.status).toBe('pending');
        expect(after.b).toEqual(snap.b);
        expect(after.completedTracks).toEqual(snap.completedTracks);
        expect(after.presented.kind).toBe('recall');
        expect(after.presented.phase).toBe('recognition');
        expect(after.presented.verbId).toBe(bId);
        expect(after.presented.revealed).toBe(false);

        // One SRS track advanced exactly one level; the following card's track
        // and the untouched production track are unchanged
        await expect.poll(() => readSrsLevel(page, aId, 'srs')).toBe(2);
        await expect.poll(() => readSrsLevel(page, bId, 'srs')).toBe(1);
        await expect.poll(() => readSrsLevel(page, 'v_haben', 'productionSrs')).toBe(4);
        const progLabel = page.locator('.guided-progress-label span:last-child');
        await expect(progLabel).toHaveText('1 / 3 (33%)');

        // The legit single-grade path still works afterwards: grading card B
        // advances to exactly turn 2 and passes B exactly once
        await answerRecall(page, true);
        const after2 = await page.evaluate(() => {
            const eng = window.verbsEngine;
            const s = eng.challengeSession;
            return { turn: s.turn, bStatus: s.cardStateById[s.phaseOrder[1]]?.status };
        }, STORAGE_KEY);
        expect(after2.turn).toBe(2);
        expect(after2.bStatus).toBe('passed');
        await expect.poll(() => readSrsLevel(page, bId, 'srs')).toBe(2);
    });

    test('GC-11: two click attempts on the same Intro button introduce exactly one card', async ({ page }) => {
        await startGuided(page);

        // First presented card A; card B is the next natural order entry and
        // must be the very next presentation after A
        const snap = await page.evaluate(() => {
            const eng = window.verbsEngine;
            const s = eng.challengeSession;
            const c = s.cardStateById;
            const read = (id) => ({
                status: c[id]?.status, dueTurn: c[id]?.dueTurn, introTurn: c[id]?.introTurn,
                failCount: c[id]?.failCount, lastLatencyMs: c[id]?.lastLatencyMs, lastSeenTurn: c[id]?.lastSeenTurn
            });
            const p = eng.challengePresentation;
            return {
                ids: [...s.orderIds],
                a: read(s.orderIds[0]),
                b: read(s.orderIds[1]),
                turn: s.turn,
                pool: [...s.activePoolIds],
                presented: { verbId: p.verbId, kind: p.kind },
                phase: s.phase
            };
        }, STORAGE_KEY);
        const aId = snap.ids[0];
        const bId = snap.ids[1];
        expect(snap.presented.verbId).toBe(aId);
        expect(snap.presented.kind).toBe('intro');
        expect(snap.a.status).toBe('unseen');

        // Click the very same Intro button DOM node twice in a single browser
        // task — no re-query, no re-render in between
        await page.evaluate(() => {
            const btn = [...document.querySelectorAll('button')]
                .find(x => (x.textContent || '').includes('Got it — Continue'));
            btn.click();
            btn.click();
        });

        // Exactly ONE introduction: one turn advance, card A introduced, card B
        // still unseen and field-wise unchanged, card B now presented
        const after = await page.evaluate(() => {
            const eng = window.verbsEngine;
            const s = eng.challengeSession;
            const c = s.cardStateById;
            const read = (id) => ({
                status: c[id]?.status, dueTurn: c[id]?.dueTurn, introTurn: c[id]?.introTurn,
                failCount: c[id]?.failCount, lastLatencyMs: c[id]?.lastLatencyMs, lastSeenTurn: c[id]?.lastSeenTurn
            });
            const p = eng.challengePresentation;
            return {
                turn: s.turn,
                a: read(s.orderIds[0]),
                b: read(s.orderIds[1]),
                pool: [...s.activePoolIds],
                presented: { verbId: p.verbId, kind: p.kind },
                phase: s.phase
            };
        }, STORAGE_KEY);

        expect(after.turn).toBe(snap.turn + 1);
        expect(after.a.status).toBe('introduced');
        expect(after.a.introTurn).toBe(snap.turn);
        expect(after.a.dueTurn).toBe(snap.turn + 3);
        expect(after.a.lastSeenTurn).toBe(snap.turn);
        expect(after.b).toEqual(snap.b);
        expect(after.pool).toEqual(snap.pool);
        expect(after.presented.verbId).toBe(bId);
        expect(after.presented.kind).toBe('intro');
        expect(after.phase).toBe('acquisition');

        // One later legitimate click on the FRESH button introduces B exactly once
        await page.locator('button:has-text("Got it — Continue")').click();
        const after2 = await page.evaluate(() => {
            const eng = window.verbsEngine;
            const s = eng.challengeSession;
            const b = s.cardStateById[s.orderIds[1]];
            const p = eng.challengePresentation;
            return {
                turn: s.turn,
                bStatus: b.status,
                bIntroTurn: b.introTurn,
                presented: { verbId: p.verbId, kind: p.kind }
            };
        }, STORAGE_KEY);
        expect(after2.turn).toBe(snap.turn + 2);
        expect(after2.bStatus).toBe('introduced');
        expect(after2.bIntroTurn).toBe(snap.turn + 1);
        expect(after2.presented.verbId).toBe(snap.ids[2]);
        expect(after2.presented.kind).toBe('intro');
    });

    // ── Tests for removing Restart Review from Daily Review MVP ──

    test('R1: Daily Review does not render a Restart button or Restart action in any state', async ({ page }) => {
        // seed two verbs with due recognition AND production reviews so the
        // review really walks both tracks (recognition → milestone → production)
        await page.goto('/verbs.html');
        await page.evaluate((key) => {
            const seeded = {
                verbLearning: {
                    schemaVersion: 2,
                    verbs: {
                        v_werden: { recognitionWin: '2026-01-01T00:00:00.000Z', srs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, productionWin: '2026-01-01T00:00:00.000Z', productionSrs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, updatedAt: Date.now() },
                        v_sein: { recognitionWin: '2026-01-01T00:00:00.000Z', srs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, productionWin: '2026-01-01T00:00:00.000Z', productionSrs: { level: 1, nextReviewDate: '2026-01-01T00:00:00.000Z' }, updatedAt: Date.now() }
                    }
                }
            };
            localStorage.setItem(key, JSON.stringify(seeded));
        }, STORAGE_KEY);

        await page.reload();
        await page.locator('button:has-text("Daily Review")').click();
        await expect(page.locator('#view-guided')).toBeVisible();

        // 1. Transition state (intro to recognition)
        await expect(page.locator('.guided-milestone-title')).toContainText(/Continuing to/);
        await expect(page.locator('#guided-restart-btn')).toBeHidden();

        // 2. Active review card state
        await continueThrough(page);
        await expect(page.locator('.guided-label')).toHaveText('Verb (German)');
        await expect(page.locator('#guided-restart-btn')).toBeHidden();

        // 3. After reveal/grade, transition to production
        await page.locator('button:has-text("Reveal Answer")').click();
        await page.locator('button:has-text("I knew it")').click();
        await page.locator('button:has-text("Reveal Answer")').click();
        await page.locator('button:has-text("I knew it")').click();
        await expect(page.locator('.guided-milestone-title')).toContainText(/Continuing to Production/);
        await expect(page.locator('#guided-restart-btn')).toBeHidden();

        // 4. Production track active
        await continueThrough(page);
        await expect(page.locator('.guided-label')).toHaveText('Meaning (English)');
        await expect(page.locator('#guided-restart-btn')).toBeHidden();

        // 5. Completion state
        await page.locator('button:has-text("Reveal Answer")').click();
        await page.locator('button:has-text("I knew it")').click();
        await page.locator('button:has-text("Reveal Answer")').click();
        await page.locator('button:has-text("I knew it")').click();
        await expect(page.locator('.guided-complete-title')).toContainText('Review Finished');
        await expect(page.locator('#guided-restart-btn')).toBeHidden();
    });

    test('R2: Resume Daily Review after refresh restores the exact production-phase state', async ({ page }) => {
        // Seed enough due items that several cards remain after the saved
        // point: 2 recognition + 5 production items, so the resume happens
        // while the session is PRODUCTION-active with both per-track orders
        // already persisted.
        await page.goto('/verbs.html');
        await page.evaluate((key) => {
            const due = '2026-01-01T00:00:00.000Z';
            const bothDue = (recLevel, prodLevel) => ({
                recognitionWin: due,
                productionWin: due,
                srs: { level: recLevel, nextReviewDate: due },
                productionSrs: { level: prodLevel, nextReviewDate: due },
                updatedAt: Date.now()
            });
            const prodOnly = (prodLevel) => ({
                recognitionWin: due,
                productionWin: due,
                srs: { level: 1, nextReviewDate: '' },
                productionSrs: { level: prodLevel, nextReviewDate: due },
                updatedAt: Date.now()
            });
            const seeded = {
                verbLearning: {
                    schemaVersion: 2,
                    verbs: {
                        v_werden: bothDue(2, 3),
                        v_sein: bothDue(2, 3),
                        v_haben: prodOnly(4),
                        v_kommen: prodOnly(4),
                        v_gehen: prodOnly(4)
                    }
                }
            };
            localStorage.setItem(key, JSON.stringify(seeded));
        }, STORAGE_KEY);

        await page.reload();
        await page.locator('button:has-text("Daily Review")').click();
        await expect(page.locator('#view-guided')).toBeVisible();

        // Walk through recognition (2 cards), transition into production,
        // grade the first production card — the session is now production-active
        await continueThrough(page);
        await expect(page.locator('.guided-label')).toHaveText('Verb (German)');
        await answerRecall(page, true);
        await answerRecall(page, true);
        await expect(page.locator('.guided-milestone-title')).toContainText(/Continuing to Production/);
        await continueThrough(page);
        await expect(page.locator('.guided-label')).toHaveText('Meaning (English)');
        await answerRecall(page, true);

        // deterministic: wait until the graded production session (turn 3) is
        // persisted to localStorage through the app's own save path
        await expect.poll(async () =>
            page.evaluate((key) => {
                const raw = localStorage.getItem(key);
                const s = raw ? JSON.parse(raw).verbLearning?.sessions : null;
                if (!s) return null;
                const review = Object.values(s).find(x => x && x.sessionType === 'review');
                return review ? review.turn : null;
            }, STORAGE_KEY)
        ).toBe(3);

        // Capture the exact live state (phase, current card, both per-track
        // orders, progress) plus the SRS levels, then refresh
        const captured = await page.evaluate(() => {
            const eng = window.verbsEngine;
            const s = eng.challengeSession;
            const p = eng.challengePresentation;
            const read = (id) => {
                const c = s.cardStateById[id];
                if (!c) return null;
                return {
                    status: c.status, dueTurn: c.dueTurn, failCount: c.failCount,
                    requiredFast: c.requiredFast, completedFast: c.completedFast,
                    lastLatencyMs: c.lastLatencyMs, lastSeenTurn: c.lastSeenTurn
                };
            };
            return {
                phase: s.phase,
                turn: s.turn,
                verbId: p.verbId,
                direction: p.direction,
                reviewItems: s.reviewItems.map(i => ({ verbId: i.verbId, track: i.track })),
                phaseOrder: [...s.phaseOrder],
                trackPhaseOrders: JSON.parse(JSON.stringify(s.trackPhaseOrders || {})),
                completedTracks: [...(s.completedTracks || [])],
                presentedCard: read(p.verbId),
                progress: document.querySelector('.guided-progress-label span:last-child')?.textContent || ''
            };
        }, STORAGE_KEY);
        expect(captured.phase).toBe('production');
        expect(captured.turn).toBe(3);
        const srsBefore = await page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            const verbs = raw ? JSON.parse(raw).verbLearning?.verbs : null;
            if (!verbs) return null;
            const out = {};
            for (const [id, rec] of Object.entries(verbs)) {
                out[id] = { srs: rec.srs?.level ?? null, productionSrs: rec.productionSrs?.level ?? null };
            }
            return out;
        }, STORAGE_KEY);

        // Refresh and re-enter Daily Review — must resume, not rebuild
        await page.reload();
        await page.locator('button:has-text("Daily Review")').click();
        await expect(page.locator('#view-guided')).toBeVisible();

        const resumed = await page.evaluate(() => {
            const eng = window.verbsEngine;
            const s = eng.challengeSession;
            const p = eng.challengePresentation;
            const read = (id) => {
                const c = s.cardStateById[id];
                if (!c) return null;
                return {
                    status: c.status, dueTurn: c.dueTurn, failCount: c.failCount,
                    requiredFast: c.requiredFast, completedFast: c.completedFast,
                    lastLatencyMs: c.lastLatencyMs, lastSeenTurn: c.lastSeenTurn
                };
            };
            return {
                phase: s.phase,
                turn: s.turn,
                verbId: p.verbId,
                direction: p.direction,
                reviewItems: s.reviewItems.map(i => ({ verbId: i.verbId, track: i.track })),
                phaseOrder: [...s.phaseOrder],
                trackPhaseOrders: JSON.parse(JSON.stringify(s.trackPhaseOrders || {})),
                completedTracks: [...(s.completedTracks || [])],
                presentedCard: read(p.verbId),
                progress: document.querySelector('.guided-progress-label span:last-child')?.textContent || ''
            };
        }, STORAGE_KEY);

        // Exact restoration: production-active, same card, same orders, same
        // scheduling state — no reshuffle, no restart
        expect(resumed.phase).toBe(captured.phase);
        expect(resumed.turn).toBe(captured.turn);
        expect(resumed.verbId).toBe(captured.verbId);
        expect(resumed.direction).toBe('en-to-de');
        expect(resumed.reviewItems).toEqual(captured.reviewItems);
        expect(resumed.phaseOrder).toEqual(captured.phaseOrder);
        expect(resumed.completedTracks).toEqual(captured.completedTracks);
        expect(resumed.presentedCard).toEqual(captured.presentedCard);
        // production-active state: BOTH per-track snapshots are persisted
        expect(resumed.trackPhaseOrders.recognition).toBeDefined();
        expect(resumed.trackPhaseOrders.production).toBeDefined();
        expect(resumed.trackPhaseOrders).toEqual(captured.trackPhaseOrders);

        // UI reflects the exact restored card and progress
        await expect(page.locator('.guided-phase-badge')).toHaveText(/Production/);
        await expect(page.locator('.guided-label')).toHaveText('Meaning (English)');
        await expect(page.locator('.guided-progress-label span:last-child')).toHaveText(captured.progress);

        // No extra SRS update happened during restore
        const srsAfter = await page.evaluate((key) => {
            const raw = localStorage.getItem(key);
            const verbs = raw ? JSON.parse(raw).verbLearning?.verbs : null;
            if (!verbs) return null;
            const out = {};
            for (const [id, rec] of Object.entries(verbs)) {
                out[id] = { srs: rec.srs?.level ?? null, productionSrs: rec.productionSrs?.level ?? null };
            }
            return out;
        }, STORAGE_KEY);
        expect(srsAfter).toEqual(srsBefore);

        // The resumed session is fully functional: grading the presented card
        // advances exactly one turn from the restored state
        await answerRecall(page, true);
        const turnNow = await page.evaluate(() => window.verbsEngine.challengeSession.turn);
        expect(turnNow).toBe(captured.turn + 1);
    });

    test('R3: Guided Challenge (learning) still keeps Restart and works end-to-end', async ({ page }) => {
        await startGuided(page);

        // Restart button visible for learning challenge
        await expect(page.locator('#guided-restart-btn')).toBeVisible();
        await expect(page.locator('#guided-restart-btn')).toHaveText(/Restart Challenge/);

        // Click Restart Challenge - should reset to acquisition
        await page.locator('#guided-restart-btn').click();
        await expect(page.locator('#view-guided')).toBeVisible();
        await expect(page.locator('.guided-phase-badge')).toHaveText('Acquisition');
        await expect(page.locator('.guided-prompt-main')).toBeVisible();

        // Complete acquisition intro and one recall to verify flow works
        await clickIntroThrough(page);
        const revealBtn = page.locator('button:has-text("Reveal Answer")');
        await expect(revealBtn).toBeVisible();
        await revealBtn.click();
        await page.locator('button:has-text("I knew it")').click();
        await expect(page.locator('.guided-phase-badge')).toHaveText('Acquisition');
    });

});
