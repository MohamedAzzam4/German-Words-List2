// WP-030: app.js — thin orchestrator
// Wires services together; delegates to AuthService, NavigationService, StatsService, LeaderboardService

import { initFirebase, loginWithGoogle, logout, loadProgress, saveProgress, listenAuth, updateLeaderboard, getLeaderboard, batchSaveProgressAndLeaderboard } from './firebase.js?v=3';
import { getLocalProgress, saveLocalProgress, mergeProgress, clearLocalProgress, getDefaultProgressObj } from './storage.js?v=4';
import { GlossaryEngine } from './glossary.js?v=3';
import { FlashcardEngine } from './flashcards.js?v=3';
import { QuizEngine } from './quiz.js?v=3';
import { TrophyEngine } from './trophies.js?v=3';
import { speak, cleanTextForAudio, playChime, SpeechQueue, setSpeakHook } from './tts.js?v=3';
import { debounce, sanitize } from './utils.js?v=3';
import { AuthService } from './auth-service.js?v=4';
import { NavigationService } from './nav-service.js?v=3';
import { StatsService } from './stats-service.js?v=3';
import { LeaderboardService } from './leaderboard-service.js?v=3';
import { ContentLoader } from './content-parser.js?v=3';
import { getLocalDateString } from './srs-logic.js?v=3';
import { ActivityService } from './activity-service.js?v=3';

// 1. Load Level Config
const level = document.querySelector('script[data-level]')?.dataset?.level || 'a1';
let levelConfig;
try {
    const configModule = await import(`../levels/${level}.config.js`);
    levelConfig = configModule.levelConfig;
    console.log(`✅ [${level.toUpperCase()}] Config loaded:`, levelConfig.levelTitle);
} catch (e) {
    console.error('❌ Failed to load level config:', e);
    alert('Error: Could not load vocabulary data. Check console.');
}

const appId = levelConfig?.appId || `german-${level}-app`;

// 2. Initialize Firebase (with graceful fallback)
let auth = null, db = null;
const firebaseConfig = {
    apiKey: "AIzaSyDa0QJmnt7uiKDNhcD1oRm6xaq718MDSD8",
    authDomain: "german-words-list-app.firebaseapp.com",
    projectId: "german-words-list-app",
    storageBucket: "german-words-list-app.firebasestorage.app",
    messagingSenderId: "997179116756",
    appId: "1:997179116756:web:31dddba4688485f9a23f41",
    measurementId: "G-PW8LJZWW5T"
};

try {
    const firebaseInit = await initFirebase(firebaseConfig, appId);
    auth = firebaseInit.auth;
    db = firebaseInit.db;
    console.log('✅ Firebase initialized for appId:', appId);
} catch (e) {
    console.warn('⚠️ Firebase init failed (using offline mode):', e.message);
    auth = null;
    db = null;
}

// 3. App State (Initialize with defaults IMMEDIATELY)
const state = {
    uid: null,
    data: getLocalProgress(appId), // ← Always has data, even if null
    view: 'glossary',
    unit: 0,
    flashcardSource: 'words',
    activePhrases: [],
    hiddenPhrases: new Set(),
    phraseMixedMap: new Map(),
    phrasesFilter: 'all'
};

const engines = {
    glossary: null,
    flashcard: null,
    quiz: null,
    trophy: null
};

// ── Internal helpers (staying in orchestrator for shared state access) ──

function _showToast(msg) {
    const t = document.getElementById('toast');
    const m = document.getElementById('toast-msg');
    if (m) m.textContent = msg;
    if (t) {
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 4000);
    }
    playChime(600, 150);
    setTimeout(() => playChime(900, 150), 150);
}

function _applyTheme() {
    const isDark = state.data?.darkMode || false;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

// WP-017: Accumulate elapsed dark mode time since last measurement
function _accumulateDarkModeTime() {
    if (state.data?.darkMode && window.app._darkModeStartTime) {
        const elapsed = (Date.now() - window.app._darkModeStartTime) / 60000; // minutes
        state.data.darkModeStudyMinutes = (state.data.darkModeStudyMinutes || 0) + elapsed;
        window.app._darkModeStartTime = Date.now(); // Reset for next interval
    }
}

function _save() {
    if (!state.data) state.data = getLocalProgress(appId);

    // WP-017: Accumulate dark mode time on each save
    _accumulateDarkModeTime();

    // WP-018: Accumate real elapsed study time
    if (window.app._lastSaveTime) {
        const elapsed = Date.now() - window.app._lastSaveTime;
        state.data.totalStudyTimeMs = (state.data.totalStudyTimeMs || 0) + elapsed;
    }
    window.app._lastSaveTime = Date.now();

    // ── Sync live engine state back to state.data before saving ──
    if (engines.flashcard) {
        if (state.flashcardSource === 'phrases') {
            state.data.knownPhrases = Array.from(engines.flashcard.knownIds);
            state.data.favoritePhrases = Array.from(engines.flashcard.favoritesIds);
            state.data.phraseErrors = { ...engines.flashcard.errors };
        } else {
            state.data.known = Array.from(engines.flashcard.knownIds);
            state.data.favorites = Array.from(engines.flashcard.favoritesIds);
            state.data.flashcardErrors = { ...engines.flashcard.errors };
        }
        state.data.srsData = { ...engines.flashcard.srsData };
    } else if (engines.glossary) {
        state.data.known = Array.from(engines.glossary.knownIds);
        state.data.favorites = Array.from(engines.glossary.favoritesIds);
    }

    if (engines.trophy?.trophyCounts) {
        state.data.trophyCounts = { ...engines.trophy.trophyCounts };
    }

    // WP-038: Prune studyDates to prevent unbounded growth (keep last 90)
    if (state.data.studyDates && state.data.studyDates.length > 90) {
        state.data.studyDates = [...new Set(state.data.studyDates)].sort().slice(-90);
    }

    // WP-040: Prune activity + ttsDaily to prevent unbounded growth (keep last ~400 days)
    const activityCutoff = getLocalDateString(new Date(Date.now() - 400 * 86400000));
    const pruneDaily = (map) => {
        for (const d in map) {
            if (d < activityCutoff) delete map[d];
        }
    };
    if (state.data.activity) pruneDaily(state.data.activity);
    if (state.data.ttsDaily) pruneDaily(state.data.ttsDaily);

    const payload = {
        known: state.data.known || [],
        favorites: state.data.favorites || [],
        knownPhrases: state.data.knownPhrases || [],
        favoritePhrases: state.data.favoritePhrases || [],
        phraseErrors: state.data.phraseErrors || {},
        trophyCounts: state.data.trophyCounts || {},
        sessionsCompleted: state.data.sessionsCompleted || 0,
        sessionKnown: state.data.sessionKnown || 0,
        sessionFlashcardErrors: state.data.sessionFlashcardErrors || 0,
        sessionWordsReviewed: state.data.sessionWordsReviewed || 0,
        lastSessionDate: state.data.lastSessionDate || '',
        darkMode: state.data.darkMode || false,
        darkModeStudyMinutes: state.data.darkModeStudyMinutes || 0,
        totalStudyTimeMs: state.data.totalStudyTimeMs || 0,
        ttsCount: state.data.ttsCount || 0,
        columnHideCount: state.data.columnHideCount || 0,
        darkModeToggleCount: state.data.darkModeToggleCount || 0,
        flashcardErrors: state.data.flashcardErrors || {},
        studyDates: state.data.studyDates || [],
        activity: state.data.activity || {},
        ttsDaily: state.data.ttsDaily || {},
        migrationVersion: state.data.migrationVersion || 0,
        srsData: state.data.srsData || {},
        lastUpdated: new Date().toISOString()
    };

    // WP-011: Save to localStorage immediately, debounce Firestore writes
    // WP-019: Ensure _sessionStartTime and _lastSaveTime are NOT persisted
    const localPayload = { ...state.data, ...payload };
    delete localPayload._sessionStartTime;
    delete localPayload._lastSaveTime;
    saveLocalProgress(appId, localPayload, state.uid);

    // Debounced remote save
    if (state.uid && auth) {
        _scheduleRemoteSave(payload);
    }
}

// WP-011: Debounced remote save — batches Firestore writes (WP-012: uses batch)
const _scheduleRemoteSave = debounce(function(payload) {
    if (state.uid && auth) {
        batchSaveProgressAndLeaderboard(appId, state.uid, payload, auth.currentUser?.displayName, auth.currentUser?.photoURL, payload.known.length)
            .then(() => {
                // WP-035: Reset failure counter on success
                window.app._consecutiveSaveFailures = 0;
            })
            .catch(e => {
                console.warn('Debounced batch save failed:', e);
                // WP-035: Track consecutive failures and show toast
                window.app._consecutiveSaveFailures = (window.app._consecutiveSaveFailures || 0) + 1;
                if (window.app._consecutiveSaveFailures >= 3) {
                    _showToast('⚠️ Cloud sync failed. Your progress is saved locally.');
                }
            });
    }
}, 3000);

// WP-011: Flush pending remote saves immediately (used by beforeunload)
function _flushRemoteSave() {
    if (state.uid && auth && state.data) {
        const knownSet = engines.flashcard?.knownIds || engines.glossary?.knownIds;
        const knownCount = knownSet ? knownSet.size : (state.data.known?.length || 0);
        saveProgress(appId, state.uid, state.data).catch(e => console.warn('Flush save failed:', e));
    }
}

// ── Trophy evaluation helper ──
async function _evaluateTrophies() {
    if (engines.trophy) {
        const allWords = levelConfig.vocabulary.flat();
        const earned = await engines.trophy.evaluate(state.data, allWords);
        if (earned && earned.length > 0) {
            _save();
            // WP-016: Clear returnedAfter7Days flag after "We're So Back" trophy is earned
            if (earned.some(t => t.id === 'were_so_back')) {
                state.data.returnedAfter7Days = false;
            }
        }
    }
}

// ── Instantiate Services ──
const authService = new AuthService({
    auth, state, appId, engines, levelConfig,
    onSave: () => _save(),
    showToast: (msg) => _showToast(msg)
});

const navService = new NavigationService({
    state, engines, levelConfig,
    onSave: () => _save(),
    onUpdateStats: () => statsService.updateStats(),
    onRenderUnitList: () => navService.renderUnitList()
});

const statsService = new StatsService({
    state, engines, levelConfig,
    onGetUnitProgress: (i) => navService._getUnitProgress(i),
    onResolveUnitLabel: (i) => navService._resolveUnitLabel(i)
});

const leaderboardService = new LeaderboardService({ state });

// WP-040: GitHub-style learning streak / activity tracker
const activityService = new ActivityService({
    state,
    onSave: () => _save()
});
// Every spoken word counts toward the daily TTS listen total (15+ = a learning day)
setSpeakHook(() => activityService.recordListen());

// ── Initialize Engines ──
let _enginesReady = false;

async function _initEngines() {
    if (_enginesReady) {
        console.log('ℹ️ Engines already initialized, skipping.');
        return;
    }
    if (!levelConfig?.vocabulary) {
        console.error('❌ No vocabulary data loaded!');
        return;
    }
    _enginesReady = true;

    // WP-014: Reset session counters on new day (matches "Words Studied Today" semantics)
    if (state.data) {
        const today = new Date().toISOString().split('T')[0];
        if ((state.data.lastSessionDate || '') !== today) {
            state.data.sessionKnown = 0;
            state.data.sessionFlashcardErrors = 0;
            state.data.sessionWordsReviewed = 0;
            // WP-039: Reset modesUsed on new session
            state.data.modesUsed = [];
            state.data.lastSessionDate = today;
            // Persist the reset immediately so it survives reload
            saveLocalProgress(appId, state.data, state.uid);
        }
    }

    // WP-016: Detect 7+ day gap and set returnedAfter7Days flag
    if (state.data && !state.data.returnedAfter7Days) {
        const studyDates = state.data.studyDates || [];
        if (studyDates.length > 0) {
            const lastStudyDate = new Date(studyDates[studyDates.length - 1]);
            const now = new Date();
            const daysSinceLastStudy = Math.floor((now - lastStudyDate) / 86400000);
            if (daysSinceLastStudy >= 7) {
                state.data.returnedAfter7Days = true;
            }
        }
    }

    // WP-010: Migrate numeric word IDs to deterministic string IDs
    if (state.data && (state.data.migrationVersion || 0) < 1) {
        const allWords = levelConfig.vocabulary.flat();

        const oldIdToNewId = {};
        let globalIndex = 0;
        for (let u = 0; u < levelConfig.vocabulary.length; u++) {
            const unitWords = levelConfig.vocabulary[u];
            for (let w = 0; w < unitWords.length; w++) {
                oldIdToNewId[globalIndex] = unitWords[w].id;
                globalIndex++;
            }
        }

        for (let i = 0; i < globalIndex; i++) {
            oldIdToNewId[String(i)] = oldIdToNewId[i];
        }

        const oldKnown = [...(state.data.known || [])];
        const oldFavorites = [...(state.data.favorites || [])];
        const oldFlashcardErrors = { ...(state.data.flashcardErrors || {}) };

        const newKnown = [...new Set(oldKnown
            .map(oldId => oldIdToNewId[oldId] !== undefined ? oldIdToNewId[oldId] : oldId)
            .filter(id => id !== undefined))];

        const newFavorites = [...new Set(oldFavorites
            .map(oldId => oldIdToNewId[oldId] !== undefined ? oldIdToNewId[oldId] : oldId)
            .filter(id => id !== undefined))];

        const newFlashcardErrors = {};
        for (const [oldKey, value] of Object.entries(oldFlashcardErrors)) {
            const newKey = oldIdToNewId[oldKey] !== undefined ? oldIdToNewId[oldKey] : oldKey;
            newFlashcardErrors[newKey] = value;
        }

        // Create backups before modifying
        state.data._known_backup_v1 = oldKnown;
        state.data._favorites_backup_v1 = oldFavorites;
        state.data._flashcardErrors_backup_v1 = oldFlashcardErrors;

        // Apply migration
        state.data.known = newKnown;
        state.data.favorites = newFavorites;
        state.data.flashcardErrors = newFlashcardErrors;
        state.data.migrationVersion = 1;

        // Persist migrated data
        _save();
        console.log('[WP-010] Migration complete. Version set to 1.');
    }

    // Prune stale/phantom IDs from state.data
    if (state.data) {
        const allValidIds = new Set();
        levelConfig.vocabulary.forEach(unit => {
            unit.forEach(w => allValidIds.add(w.id));
        });
        
        if (state.data.known) {
            state.data.known = state.data.known.filter(id => allValidIds.has(id));
        }
        if (state.data.favorites) {
            state.data.favorites = state.data.favorites.filter(id => allValidIds.has(id));
        }
        if (state.data.flashcardErrors) {
            for (const id in state.data.flashcardErrors) {
                if (!allValidIds.has(id)) {
                    delete state.data.flashcardErrors[id];
                }
            }
        }

        // Legacy SRS migration: migrate existing known words/phrases to Level 6
        if (!state.data.srsData) {
            state.data.srsData = {};
        }
        let migratedSRS = false;
        if (state.data.known) {
            for (const id of state.data.known) {
                if (!state.data.srsData[id]) {
                    state.data.srsData[id] = {
                        level: 6,
                        nextReviewDate: '2099-01-01',
                        lastReviewed: Date.now()
                    };
                    migratedSRS = true;
                }
            }
        }
        if (state.data.knownPhrases) {
            for (const id of state.data.knownPhrases) {
                if (!state.data.srsData[id]) {
                    state.data.srsData[id] = {
                        level: 6,
                        nextReviewDate: '2099-01-01',
                        lastReviewed: Date.now()
                    };
                    migratedSRS = true;
                }
            }
        }
        if (migratedSRS) {
            _save();
            console.log('[SRS] Legacy known items migrated to Level 6.');
        }
    }

    const words = levelConfig.vocabulary[state.unit] || [];
    const known = new Set(state.data?.known || []);
    const favorites = new Set(state.data?.favorites || []);

    engines.glossary = new GlossaryEngine('glossary-tbody', words, known, favorites, (t) => window.app.speakText(t));
    engines.flashcard = new FlashcardEngine(
        words, known, favorites, state.data?.flashcardErrors || {},
        state.data?.srsData || {},
        () => _save(),
        () => {
            // onSessionComplete: safely increment session counter and record today's date
            if (!state.data) state.data = getLocalProgress(appId);
            state.data.sessionsCompleted = (state.data.sessionsCompleted || 0) + 1;
            const today = new Date().toISOString().split('T')[0];
            if (!state.data.studyDates) state.data.studyDates = [];
            if (!state.data.studyDates.includes(today)) {
                state.data.studyDates.push(today);
            }
        }
    );
    engines.quiz = new QuizEngine(words, (s, t) => {
        const el = document.getElementById('quiz-score');
        if (el) el.textContent = `Score: ${s} / ${t}`;
    });
    engines.trophy = new TrophyEngine('trophy-container', state.data || {}, appId, (msg) => _showToast(msg));

    navService.renderUnitList();
    statsService.updateStats();

    // Ensure the initial view is explicitly unhidden
    navService.switchView(state.view);

    // Also update the title
    navService._updateTitles(state.unit);

    // WP-001 + WP-002 + WP-003: Evaluate trophies on boot, using full level vocabulary
    await _evaluateTrophies();

    // WP-017: Initialize dark mode start time if currently active
    if (state.data?.darkMode) {
        window.app._darkModeStartTime = Date.now();
    }

    // WP-018: Initialize session time tracking
    window.app._lastSaveTime = Date.now();

    console.log(`✅ Engines initialized with ${words.length} words in Unit ${state.unit + 1}`);
}

// ── Phrases and Conversation Renderers ──
function _renderPhrases(phrases) {
    const phrasesPanel = document.getElementById('panel-phrases');
    if (!phrasesPanel) return;

    state.activePhrases = phrases || [];

    if (!phrases || phrases.length === 0) {
        phrasesPanel.innerHTML = `
            <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
                <div style="font-size: 1.5rem; margin-bottom: 10px;">📭 Empty State</div>
                <p>No phrases available for this unit yet.</p>
            </div>
        `;
        return;
    }

    const unitKnownCount = phrases.filter(p => state.data.knownPhrases?.includes(p.id)).length;

    const controlsHTML = `
        <div class="phrases-controls-container" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
            <div class="phrases-audio-controls" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
                <div style="display: flex; gap: 10px; position: sticky; top: 10px; z-index: 100; background: var(--surface); padding: 8px; border-radius: 8px; box-shadow: var(--shadow);">
                    <button class="btn btn-primary" id="btn-play-all-phrases" onclick="window.app.playAllPhrases()" style="display: flex; align-items: center; gap: 8px;">
                        <span>▶️</span> Play All
                    </button>
                    <button class="btn hidden" id="btn-pause-phrases" onclick="window.app.togglePausePhrases()" style="display: flex; align-items: center; gap: 8px;">
                        <span>⏸️</span> Pause
                    </button>
                    <button class="btn" id="btn-stop-phrases" onclick="window.app.stopAudioQueue()" style="display: flex; align-items: center; gap: 8px;">
                        <span>⏹️</span> Stop
                    </button>
                </div>
                <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                    <select class="filter-select" onchange="window.app.setPhrasesFilter(this.value)" style="padding: 6px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text-primary);">
                        <option value="all" ${state.phrasesFilter === 'all' ? 'selected' : ''}>🔍 All Phrases</option>
                        <option value="learning" ${state.phrasesFilter === 'learning' ? 'selected' : ''}>🔄 Still Learning</option>
                        <option value="known" ${state.phrasesFilter === 'known' ? 'selected' : ''}>✅ Known Phrases</option>
                        <option value="fav" ${state.phrasesFilter === 'fav' ? 'selected' : ''}>⭐ Favourites Only</option>
                    </select>
                    <div id="phrases-tab-counter" style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500; background: var(--surface); padding: 6px 12px; border-radius: 20px; border: 1px solid var(--border); display: flex; align-items: center; gap: 4px;">
                        <span>Phrases Learned:</span>
                        <span id="phrases-tab-known-count" style="color: var(--text-primary); font-weight: bold;">${unitKnownCount}</span>
                        <span>/</span>
                        <span id="phrases-tab-total-count">${phrases.length}</span>
                    </div>
                </div>
            </div>
            <div class="controls-row" style="background: var(--surface); padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 0;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; width: 100%;">
                    <span style="font-weight: bold; font-size: 0.9rem;">Hide & Guess:</span>
                    <div class="btn-group">
                        <button class="btn" onclick="window.app.hidePhrasePart('de')">Hide German</button>
                        <button class="btn" onclick="window.app.hidePhrasePart('en')">Hide English</button>
                        <button class="btn" onclick="window.app.hidePhrasePart('note')">Hide Notes</button>
                        <button class="btn" onclick="window.app.hidePhrasePart('words')">Hide Used Words</button>
                        <button class="btn" onclick="window.app.hidePhrasePart('mixed')">Hide Mixed</button>
                        <button class="btn" onclick="window.app.revealAllPhrases()">Reveal All</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const isMixed = state.hiddenPhrases.has('mixed');

    // Filter phrases
    let filteredPhrases = phrases;
    if (state.phrasesFilter === 'fav') {
        filteredPhrases = phrases.filter(p => state.data.favorites && state.data.favorites.includes(p.id));
    } else if (state.phrasesFilter === 'learning') {
        filteredPhrases = phrases.filter(p => !(state.data.knownPhrases && state.data.knownPhrases.includes(p.id)));
    } else if (state.phrasesFilter === 'known') {
        filteredPhrases = phrases.filter(p => state.data.knownPhrases && state.data.knownPhrases.includes(p.id));
    }
    state.activePhrases = filteredPhrases;

    if (filteredPhrases.length === 0) {
        phrasesPanel.innerHTML = controlsHTML + `
            <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
                <div style="font-size: 1.5rem; margin-bottom: 10px;">📭</div>
                <p>No phrases match your current filter.</p>
            </div>
        `;
        return;
    }

    const cardsHTML = filteredPhrases.map(p => {
        if (isMixed && !state.phraseMixedMap.has(p.id)) {
            state.phraseMixedMap.set(p.id, Math.random() > 0.5 ? 'de' : 'en');
        }
        const mixedHide = isMixed ? state.phraseMixedMap.get(p.id) : null;

        const hideDe = state.hiddenPhrases.has('de') || (mixedHide === 'de');
        const hideEn = state.hiddenPhrases.has('en') || (mixedHide === 'en');
        const hideNote = state.hiddenPhrases.has('note');
        const hideWords = state.hiddenPhrases.has('words');

        const registerBadge = p.register && p.register !== 'neutral' 
            ? `<span class="phrase-badge register">${p.register}</span>` 
            : '';
        const wordsBadge = p.usedWords 
            ? `<span class="phrase-badge words hideable ${hideWords ? 'hidden-word' : ''}" onclick="this.classList.remove('hidden-word')" title="Click to reveal">Words: ${sanitize(p.usedWords)}</span>` 
            : '';

        const isFav = state.data.favorites?.includes(p.id);
        const favIcon = isFav ? '⭐' : '☆';

        return `
            <div class="phrase-card" data-id="${p.id}">
                <div class="phrase-header">
                    <div class="phrase-de-container">
                        <button class="speak-btn" onclick="window.app.speakPhrase('${p.id}', this)" title="Speak phrase">🔊</button>
                        <span class="phrase-de hideable ${hideDe ? 'hidden-word' : ''}" onclick="this.classList.remove('hidden-word')" title="Click to reveal">${sanitize(p.de)}</span>
                    </div>
                    <button class="fav-btn" onclick="window.app.toggleFavorite('${p.id}', true)" title="Toggle Favorite" style="background:none; border:none; font-size:1.2rem; cursor:pointer; margin-left: auto; color: var(--text-primary); text-shadow: 0 0 2px rgba(0,0,0,0.5);">${favIcon}</button>
                </div>
                <div class="phrase-en">
                    <span class="hideable ${hideEn ? 'hidden-word' : ''}" onclick="this.classList.remove('hidden-word')" title="Click to reveal">${sanitize(p.en)}</span>
                </div>
                ${p.note ? `<div class="phrase-note"><span class="hideable ${hideNote ? 'hidden-word' : ''}" onclick="this.classList.remove('hidden-word')" title="Click to reveal">${sanitize(p.note)}</span></div>` : ''}
                <div class="phrase-meta">
                    ${registerBadge}
                    ${wordsBadge}
                </div>
            </div>
        `;
    }).join('');

    phrasesPanel.innerHTML = `
        ${controlsHTML}
        <div class="phrases-list-container">
            ${cardsHTML}
        </div>
    `;
}

function _renderConversation(convo) {
    const convoPanel = document.getElementById('panel-conversation');
    if (!convoPanel) return;

    if (!convo || !convo.scenes || convo.scenes.length === 0) {
        convoPanel.innerHTML = `
            <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
                <div style="font-size: 1.5rem; margin-bottom: 10px;">📭 Empty State</div>
                <p>No conversation available for this unit yet.</p>
            </div>
        `;
        return;
    }

    const metaHTML = convo.metadata ? `
        <div class="conversation-metadata">
            ${convo.metadata.theme ? `<div class="convo-meta-item"><strong>Theme:</strong> ${convo.metadata.theme}</div>` : ''}
            ${convo.metadata.characters ? `<div class="convo-meta-item"><strong>Characters:</strong> ${convo.metadata.characters}</div>` : ''}
            ${convo.metadata.situation ? `<div class="convo-meta-item"><strong>Situation:</strong> ${convo.metadata.situation}</div>` : ''}
            ${convo.metadata.goal ? `<div class="convo-meta-item"><strong>Goal:</strong> ${convo.metadata.goal}</div>` : ''}
        </div>
    ` : '';

    const scenesHTML = convo.scenes.map((scene, sIdx) => {
        const linesHTML = scene.lines.map(line => `
            <div class="convo-line">
                <div class="convo-speaker">${line.speaker}</div>
                <div class="convo-text">${line.text}</div>
            </div>
        `).join('');

        return `
            <div class="convo-scene">
                ${scene.title ? `<div class="scene-title">${scene.title}</div>` : ''}
                <div class="convo-lines">
                    ${linesHTML}
                </div>
            </div>
        `;
    }).join('');

    convoPanel.innerHTML = `
        <div class="conversation-container">
            ${metaHTML}
            ${scenesHTML}
        </div>
    `;
}

// 4. Global App Object — thin delegating wrapper
window.app = {
    _enginesReady: false,
    _darkModeStartTime: null,
    _lastSaveTime: null,
    _consecutiveSaveFailures: 0,

    debug_shiftSRS(days) {
        if (!state.data || !state.data.srsData) return;
        
        // Sync first to make sure we're shifting the most recent state
        if (engines.flashcard) {
            state.data.srsData = { ...engines.flashcard.srsData };
        }
        
        const srsData = state.data.srsData;
        for (const id in srsData) {
            const item = srsData[id];
            if (item.nextReviewDate && item.level < 6) { // Don't shift mastered cards
                const dateString = item.nextReviewDate.includes('T') ? item.nextReviewDate : item.nextReviewDate + 'T00:00:00';
                const date = new Date(dateString);
                date.setTime(date.getTime() - (days * 24 * 60 * 60 * 1000));
                item.nextReviewDate = date.toISOString();
                item.lastReviewed = Date.now();
            }
        }
        
        // Push changes back so _save() retains them
        if (engines.flashcard) {
            engines.flashcard.srsData = { ...state.data.srsData };
        }
        
        _save();
        window.location.reload();
    },

    // ── AUTH ── (delegates to AuthService)
    loginWithGoogle: () => authService.loginWithGoogle(),
    openEmailAuthModal: () => authService.openEmailAuthModal(),
    closeEmailAuthModal: () => authService.closeEmailAuthModal(),
    toggleEmailAuthMode: () => authService.toggleEmailAuthMode(),
    handleEmailAuth: (e) => authService.handleEmailAuth(e),
    logout: () => authService.logout(),
    resetData: () => authService.resetData(),

    // ── NAVIGATION ── (delegates to NavigationService)
    switchView: (v) => {
        navService.switchView(v);
        if (v === 'leaderboard') leaderboardService.render();
        if (v === 'dashboard') statsService.updateStats();
        if (v === 'dashboard') activityService.render();
    },
    switchMode: (m) => navService.switchMode(m),
    toggleSidebar: (e) => navService.toggleSidebar(e),
    switchUnit(i) {
        this.revealAllPhrases();
        return navService.switchUnit(i).then(() => _evaluateTrophies());
    },
    async switchUnitTab(tabName) {
        if (typeof this.stopAudioQueue === 'function') {
            this.stopAudioQueue();
        }
        state.tab = tabName;

        // 1. Update Tab Buttons (ARIA Selected & Active states)
        const tabs = document.querySelectorAll('[role="tab"]');
        tabs.forEach(tab => {
            const isActive = tab.id === `tab-${tabName}`;
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            tab.setAttribute('tabindex', isActive ? '0' : '-1');
            tab.classList.toggle('active', isActive);
        });

        // 2. Toggle Visibility of Panels
        const panels = document.querySelectorAll('[role="tabpanel"]');
        panels.forEach(panel => {
            const isTarget = panel.id === `panel-${tabName}`;
            panel.classList.toggle('hidden', !isTarget);
        });

        // 3. Load and Render Content for active tab
        if (tabName === 'words') {
            return;
        }

        const phrasesPanel = document.getElementById('panel-phrases');
        const convoPanel = document.getElementById('panel-conversation');

        if (tabName === 'phrases') {
            phrasesPanel.innerHTML = `
                <div class="skeleton-loader">
                    <div class="skeleton-card"><div class="skeleton-shimmer"></div></div>
                    <div class="skeleton-card"><div class="skeleton-shimmer"></div></div>
                    <div class="skeleton-card"><div class="skeleton-shimmer"></div></div>
                </div>
            `;
            try {
                const phrases = await ContentLoader.loadPhrases(level, state.unit);
                _renderPhrases(phrases);
            } catch (e) {
                console.error(e);
                phrasesPanel.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Error loading phrases. Please check console.</div>`;
            }
        } else if (tabName === 'conversation') {
            convoPanel.innerHTML = `
                <div class="skeleton-loader">
                    <div class="skeleton-card" style="height: 200px;"><div class="skeleton-shimmer"></div></div>
                </div>
            `;
            try {
                const convo = await ContentLoader.loadConversation(level, state.unit);
                _renderConversation(convo);
            } catch (e) {
                console.error(e);
                convoPanel.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Error loading conversation. Please check console.</div>`;
            }
        }
    },

    // ── LEADERBOARD ── (delegates to LeaderboardService)
    _renderLeaderboard: () => leaderboardService.render(),

    // ── THEME ──
    toggleDarkMode() {
        if (!state.data) state.data = getLocalProgress(appId);
        _accumulateDarkModeTime();
        state.data.darkMode = !state.data.darkMode;
        _applyTheme();
        state.data.darkModeToggleCount = (state.data.darkModeToggleCount || 0) + 1;
        if (state.data.darkMode) {
            this._darkModeStartTime = Date.now();
        } else {
            this._darkModeStartTime = null;
        }
        _save();
    },

    // ── GLOSSARY ──
    setTypeFilter(v) { engines.glossary?.setFilter(v); },
    hideTableColumn(col) {
        engines.glossary?.toggleColumn(col);
        state.data.columnHideCount = (state.data.columnHideCount || 0) + 1;
        _save();
    },
    revealAllTable() { engines.glossary?.revealAll(); },
    revealAllPhrases() {
        state.hiddenPhrases.clear();
        state.phraseMixedMap.clear();
        if (state.activePhrases && state.activePhrases.length > 0) {
            _renderPhrases(state.activePhrases);
        }
    },
    setPhrasesFilter(v) {
        state.phrasesFilter = v;
        if (state.unit !== null) {
            this.switchUnitTab('phrases');
        }
    },
    hidePhrasePart(part) {
        if (part === 'mixed') {
            state.hiddenPhrases.clear();
            state.hiddenPhrases.add('mixed');
            state.phraseMixedMap.clear();
            if (state.activePhrases) {
                state.activePhrases.forEach(p => {
                    state.phraseMixedMap.set(p.id, Math.random() > 0.5 ? 'de' : 'en');
                });
            }
        } else {
            if (state.hiddenPhrases.has('mixed')) {
                state.hiddenPhrases.delete('mixed');
            }
            if (state.hiddenPhrases.has(part)) {
                state.hiddenPhrases.delete(part);
            } else {
                state.hiddenPhrases.add(part);
            }
        }
        if (state.activePhrases && state.activePhrases.length > 0) {
            _renderPhrases(state.activePhrases);
        }
    },
    playUnitAudio() {
        const activeTab = state.tab || 'words';
        if (activeTab === 'words') {
            if (SpeechQueue.isPlaying) {
                this.stopAudioQueue();
            } else {
                this.playAllWords();
            }
        } else if (activeTab === 'phrases') {
            if (SpeechQueue.isPlaying) {
                this.stopAudioQueue();
            } else {
                this.playAllPhrases();
            }
        } else {
            _showToast('Audio playback not supported on this tab');
        }
    },
    playAllWords() {
        const tbody = document.getElementById('glossary-tbody');
        if (!tbody) return;
        
        const items = Array.from(tbody.querySelectorAll('tr'))
            .filter(tr => !tr.classList.contains('hidden'))
            .map(tr => {
                // Skip if the main German word column is hidden (it's the second .hideable span)
                const hideables = tr.querySelectorAll('td:first-child .hideable');
                if (hideables.length > 1 && hideables[1].classList.contains('hidden-word')) {
                    return { id: null, text: null };
                }
                
                // Extract the full German text from the speak button's onclick attribute
                const btn = tr.querySelector('.speak-btn');
                const onclickText = btn ? btn.getAttribute('onclick') : '';
                const match = onclickText ? onclickText.match(/speakText\('([^']+)'\)/) : null;
                const text = match ? match[1].replace(/\\'/g, "'") : '';
                
                const id = tr.getAttribute('data-id');
                return { id, de: text };
            })
            .filter(item => item && item.de);
            
        if (items.length === 0) return;
        
        const playBtn = document.getElementById('btn-play-all-words');
        if (playBtn) {
            playBtn.classList.add('playing');
            playBtn.innerHTML = '<span>⏹️</span> Stop';
        }

        SpeechQueue.playAll(
            items,
            (idx, item) => {
                document.querySelectorAll('#glossary-tbody tr').forEach(tr => {
                    tr.classList.remove('highlighted-speech');
                });
                const activeRow = tbody.querySelector(`tr[data-id="${item.id}"]`);
                if (activeRow) {
                    activeRow.classList.add('highlighted-speech');
                    activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            },
            () => {
                this.stopAudioQueue();
            }
        );
    },
    playAllPhrases() {
        if (!state.activePhrases || state.activePhrases.length === 0) return;
        
        const btn = document.getElementById('btn-play-all-phrases');
        const pauseBtn = document.getElementById('btn-pause-phrases');
        if (btn) {
            btn.classList.add('playing');
            btn.innerHTML = '<span>🔊</span> Playing...';
        }
        if (pauseBtn) {
            pauseBtn.classList.remove('hidden');
            pauseBtn.innerHTML = '<span>⏸️</span> Pause';
        }

        SpeechQueue.playAll(
            state.activePhrases,
            (idx, p) => {
                const card = document.querySelector(`.phrase-card[data-id="${p.id}"]`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('highlighted-speech');
                    setTimeout(() => card.classList.remove('highlighted-speech'), 1500);
                }
            },
            () => {
                if (btn) {
                    btn.classList.remove('playing');
                    btn.innerHTML = '<span>▶️</span> Play All';
                }
                if (pauseBtn) {
                    pauseBtn.classList.add('hidden');
                }
            }
        );
    },
    stopAudioQueue() {
        SpeechQueue.stop();
        const playPhrasesBtn = document.getElementById('btn-play-all-phrases');
        const pausePhrasesBtn = document.getElementById('btn-pause-phrases');
        if (playPhrasesBtn) {
            playPhrasesBtn.classList.remove('playing');
            playPhrasesBtn.innerHTML = '<span>▶️</span> Play All';
        }
        if (pausePhrasesBtn) {
            pausePhrasesBtn.classList.add('hidden');
        }
        const playWordsBtn = document.getElementById('btn-play-all-words');
        if (playWordsBtn) {
            playWordsBtn.classList.remove('playing');
            playWordsBtn.innerHTML = '<span>▶️</span> Play All';
        }
    },
    togglePausePhrases() {
        const pauseBtn = document.getElementById('btn-pause-phrases');
        if (!pauseBtn) return;
        
        if (SpeechQueue.isPlaying) {
            SpeechQueue.pause();
            pauseBtn.innerHTML = '<span>▶️</span> Resume';
        } else {
            SpeechQueue.resume();
            pauseBtn.innerHTML = '<span>⏸️</span> Pause';
        }
    },
    speakPhrase(phraseId, btn) {
        if (!state.activePhrases) return;
        const phrase = state.activePhrases.find(p => p.id === phraseId);
        if (phrase) {
            this.stopAudioQueue();
            SpeechQueue.speakSingle(phrase.de);
            
            const card = document.querySelector(`.phrase-card[data-id="${phraseId}"]`);
            if (card) {
                card.classList.add('highlighted-speech');
                setTimeout(() => {
                    if (!SpeechQueue.isPlaying) {
                        card.classList.remove('highlighted-speech');
                    }
                }, 1500);
            }
        }
    },
    speakText(t) {
        speak(cleanTextForAudio(t));
        state.data.ttsCount = (state.data.ttsCount || 0) + 1;
        _save();
    },

    // ── FLASHCARDS ──
    flipCard() { engines.flashcard?.flip(); },
    restartFlashcards() { engines.flashcard?.restart(); },
    speakCurrentCard() { engines.flashcard?.speak(); },
    async markCard(known) {
        // WP-040: Marking a brand-new card as Known counts as learning a new word today
        const fc = engines.flashcard;
        const card = fc?.queue?.[fc.index];
        if (known && card && !fc.knownIds.has(card.id)) {
            activityService.recordWordLearned();
        }
        engines.flashcard?.mark(known);
        // WP-022: Record study date on every flashcard interaction
        if (!state.data.studyDates) state.data.studyDates = [];
        const today = new Date().toISOString().split('T')[0];
        if (!state.data.studyDates.includes(today)) {
            state.data.studyDates.push(today);
        }
        _save();
        statsService.updateStats();
        navService.renderUnitList();
        await _evaluateTrophies();
    },
    async toggleFavorite(id, fromPhrasesTab = false) {
        if (!state.data.favorites) state.data.favorites = [];
        let isFav = false;
        
        const idx = state.data.favorites.indexOf(id);
        if (idx > -1) {
            state.data.favorites.splice(idx, 1);
        } else {
            state.data.favorites.push(id);
            isFav = true;
        }
        
        if (engines.flashcard && engines.flashcard.favoritesIds) {
            if (isFav) engines.flashcard.favoritesIds.add(id);
            else engines.flashcard.favoritesIds.delete(id);
        }
        
        if (engines.glossary && engines.glossary.favoritesIds) {
            if (isFav) engines.glossary.favoritesIds.add(id);
            else engines.glossary.favoritesIds.delete(id);
        }
        
        if (state.view === 'glossary') {
            const starSpans = document.querySelectorAll(`tr[data-id="${id}"] span[title="Toggle Favorite"]`);
            starSpans.forEach(span => {
                span.style.filter = isFav ? 'grayscale(0)' : 'grayscale(100%)';
                span.style.opacity = isFav ? '1' : '0.25';
            });
            if (fromPhrasesTab) {
                this.switchUnitTab('phrases');
            }
        }
        
        if (state.view === 'flashcard' && engines.flashcard) engines.flashcard.render();
        _save();
        await _evaluateTrophies();
    },
    async toggleCurrentCardFavorite() {
        if (engines.flashcard?.queue) {
            const id = engines.flashcard.queue[engines.flashcard.index]?.id;
            if (id) await this.toggleFavorite(id);
        }
    },
    nextCard() { engines.flashcard?.next(); },
    prevCard() { engines.flashcard?.prev(); },
    toggleShuffle() { engines.flashcard?.toggleShuffle(); },
    setReviewFilter(f) { engines.flashcard?.setFilter(f); },
    setCardFace(f) { engines.flashcard?.setFace(f); },

    // ── QUIZ ──
    async checkArticleAnswer(a, btn) {
        engines.quiz?.answer(a, btn);
        _save();
        await _evaluateTrophies();
    },

    // ── INTERNAL (exposed for backward compatibility) ──
    _save,
    _showToast,
    _applyTheme,
    _initEngines,
    _renderAuthUI: () => authService.renderAuthUI(),
    _renderUnitList: () => navService.renderUnitList(),
    _updateStats: () => statsService.updateStats(),
    _flushRemoteSave
};

// WP-008: Ensure pending data is saved when the page unloads
// Fix: Skip save during explicit logout to prevent RAM data from being written back to localStorage
// after clearLocalProgress() has already wiped it (cross-account data leak prevention)
window.addEventListener('beforeunload', () => {
    if (window._isLoggingOut) return;
    if (window.app && window.app._save) {
        try { window.app._save(); } catch (e) { /* best effort */ }
    }
    if (window.app && window.app._flushRemoteSave) {
        try { window.app._flushRemoteSave(); } catch (e) { /* best effort */ }
    }
});

// 5. Boot Sequence
if (auth) {
    listenAuth(u => {
        authService._onAuth(u, [
            () => _applyTheme(),
            () => authService.renderAuthUI(),
            () => _initEngines(),
            () => {
                // Immediately auto-publish progress to the server on load
                if (state.uid && auth) {
                    updateLeaderboard(appId, state.uid, auth.currentUser?.displayName, auth.currentUser?.photoURL, state.data?.known?.length || 0).then(() => {
                        if (state.view === 'leaderboard') leaderboardService.render();
                    });
                }
            }
        ]);
    });
} else {
    console.log('⚠️ Running in offline mode (no Firebase)');
    // Initialize immediately without auth
    authService._onAuth(null, [
        () => _applyTheme(),
        () => authService.renderAuthUI(),
        () => _initEngines()
    ]);
}

// Keyboard navigation for accessible tabs (roving tabindex)
document.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    if (!activeEl || activeEl.getAttribute('role') !== 'tab') return;

    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    let index = tabs.indexOf(activeEl);
    if (index === -1) return;

    if (e.key === 'ArrowRight') {
        index = (index + 1) % tabs.length;
        tabs[index].focus();
        tabs[index].click();
    } else if (e.key === 'ArrowLeft') {
        index = (index - 1 + tabs.length) % tabs.length;
        tabs[index].focus();
        tabs[index].click();
    }
});

const bootApp = () => {
    console.log('🚀 DOM loaded / App booting.');
    if (!state.data) state.data = getLocalProgress(appId);
    _applyTheme();
    if (!auth && !_enginesReady) {
        authService.renderAuthUI();
        _initEngines();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
} else {
    bootApp();
}
