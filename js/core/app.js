import { initFirebase, loginWithGoogle, logout, loadProgress, saveProgress, listenAuth, updateLeaderboard, getLeaderboard } from './firebase.js';
import { getLocalProgress, saveLocalProgress, mergeProgress, clearLocalProgress, getDefaultProgressObj } from './storage.js';
import { GlossaryEngine } from './glossary.js';
import { FlashcardEngine } from './flashcards.js';
import { QuizEngine } from './quiz.js';
import { TrophyEngine } from './trophies.js';
import { speak, cleanTextForAudio, playChime } from './tts.js';

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
    unit: 0
};

const engines = {
    glossary: null,
    flashcard: null,
    quiz: null,
    trophy: null
};

// 4. Global App Object
window.app = {
    _enginesReady: false, // Guard: ensures _initEngines() only runs once

    // ── AUTH ──
    async loginWithGoogle() {
        if (!auth) {
            alert('Firebase not configured. Please add your Firebase config to app.js');
            return;
        }
        try {
            await loginWithGoogle();
            window.location.reload();
        } catch (e) {
            console.error('Login failed:', e);
            alert('Login failed: ' + e.message);
        }
    },

    async logout() {
        if (auth) {
            try { await logout(); } catch (e) {}
        }
        const { clearLocalProgress } = await import('./storage.js');
        clearLocalProgress(appId);
        window.location.reload();
    },

    async resetData() {
        if (confirm("⚠️ Are you sure you want to completely RESET ALL your progress data? This cannot be undone!")) {
            const { clearLocalProgress, getDefaultProgressObj } = await import('./storage.js');
            clearLocalProgress(appId);
            if (auth && state.uid) {
                try {
                    const { saveProgress } = await import('./firebase.js');
                    await saveProgress(appId, state.uid, getDefaultProgressObj());
                } catch (e) {
                    console.warn("Failed to reset firebase.", e);
                }
            }
            window.location.reload();
        }
    },

    async _onAuth(user) {
        const prevUid = state.uid;
        state.uid = user?.uid || null;

        if (this._hasBootedAuth === undefined) {
            this._hasBootedAuth = false;
        }

        if (prevUid !== null && state.uid !== null && prevUid !== state.uid) {
            const { clearLocalProgress } = await import('./storage.js');
            clearLocalProgress(appId);
            window.location.reload();
            return;
        }

        if (this._hasBootedAuth && prevUid === null && state.uid !== null) {
            window.location.reload();
            return;
        }

        this._hasBootedAuth = true;

        if (user) {
            console.log('✅ User signed in:', user.email);
            document.getElementById('sync-status').textContent = '☁️ Cloud Sync Active';

            try {
                const remote = await loadProgress(appId, user.uid);
                state.data = mergeProgress(state.data, remote);
            } catch (e) {
                console.warn('⚠️ Failed to load cloud progress:', e);
            }
        } else {
            console.log('📱 Using offline mode');
            document.getElementById('sync-status').textContent = '💾 Local Mode';
            state.data = getLocalProgress(appId);
        }

        this._applyTheme();
        this._renderAuthUI();
        this._initEngines();

        // Immediately auto-publish progress to the server on load.
        // This natively solves the "migration" problem: all existing users will be added to the leaderboard
        // the very next time they simply open the site!
        if (state.uid && auth) {
            updateLeaderboard(appId, state.uid, auth.currentUser?.displayName, auth.currentUser?.photoURL, state.data?.known?.length || 0).then(() => {
                if (state.view === 'leaderboard') this._renderLeaderboard();
            });
        }
    },

    // ── NAVIGATION ──
    switchView(v) {
        document.querySelectorAll('#content-area > div[id^="view-"]').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(`view-${v}`);
        if (target) {
            target.classList.remove('hidden');
            state.view = v;
        }
        
        if (v === 'leaderboard') {
            this._renderLeaderboard();
        }

        if (window.innerWidth <= 768) {
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebar-overlay')?.classList.remove('visible');
        }
    },

    // ── LEADERBOARD ──
    async _renderLeaderboard() {
        const tbody = document.getElementById('leaderboard-tbody');
        if (!tbody) return;
        
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 20px;">Loading ranks... ⏳</td></tr>`;
        
        try {
            const data = await getLeaderboard();
            if (!data || data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 20px; color: var(--text-muted);">No linguists found on the server. Be the first!</td></tr>`;
                return;
            }
            
            tbody.innerHTML = data.map(user => {
                let badge = '';
                if (user.rank === 1) badge = '🥇';
                else if (user.rank === 2) badge = '🥈';
                else if (user.rank === 3) badge = '🥉';
                else badge = `#${user.rank}`;
                
                const isMe = user.displayName === auth?.currentUser?.displayName;
                
                return `<tr style="${isMe ? 'background-color: var(--surface-hover); font-weight: bold;' : ''}">
                    <td style="text-align: center; font-size: 1.2rem;">${badge}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <img src="${user.photoURL || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%2364748b\'><path d=\'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z\'/></svg>'}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                            <span>${user.displayName}</span>
                        </div>
                    </td>
                    <td style="text-align: center; color: var(--primary); font-weight: bold;">${user.totalWords}</td>
                </tr>`;
            }).join('');
        } catch(e) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 20px; color: var(--warning);">Error fetching leaderboard data.</td></tr>`;
        }
    },

    switchMode(m) {
        const words = levelConfig?.vocabulary?.[state.unit] || [];
        if (m === 'flashcard') {
            engines.flashcard?.loadUnit(words);
            this.switchView('flashcard');
        } else {
            engines.glossary?.loadUnit(words);
            engines.glossary?.render();
            this.switchView('glossary');
        }
    },

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const isOpen = sidebar?.classList.toggle('open');
        overlay?.classList.toggle('visible', isOpen);
    },

    // ── THEME (Fixed: null-safe) ──
    toggleDarkMode() {
        // Initialize data if null
        if (!state.data) state.data = getLocalProgress(appId);

        state.data.darkMode = !state.data.darkMode;
        this._applyTheme();
        state.data.darkModeToggleCount = (state.data.darkModeToggleCount || 0) + 1;
        this._save();
    },

    _applyTheme() {
        const isDark = state.data?.darkMode || false;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        const btn = document.getElementById('theme-btn');
        if (btn) btn.textContent = isDark ? '☀️' : '🌙';
    },

    // ── GLOSSARY ──
    setTypeFilter(v) { engines.glossary?.setFilter(v); },
    hideTableColumn(col) {
        engines.glossary?.toggleColumn(col);
        state.data.columnHideCount = (state.data.columnHideCount || 0) + 1;
        this._save();
    },
    revealAllTable() { engines.glossary?.revealAll(); },
    playUnitAudio() { engines.glossary?.speakAll(); },
    speakText(t) {
        speak(cleanTextForAudio(t));
        state.data.ttsCount = (state.data.ttsCount || 0) + 1;
        this._save();
    },

    // ── FLASHCARDS ──
    flipCard() { engines.flashcard?.flip(); },
    speakCurrentCard() { engines.flashcard?.speak(); },
    markCard(known) {
        engines.flashcard?.mark(known);
        this._save();
        this._updateStats();
        this._renderUnitList();
    },
    toggleFavorite(id) {
        if (engines.flashcard && engines.flashcard.favoritesIds) {
            if (engines.flashcard.favoritesIds.has(id)) {
                engines.flashcard.favoritesIds.delete(id);
            } else {
                engines.flashcard.favoritesIds.add(id);
            }
        }
        // Force synchronous repaint of current view
        if (state.view === 'glossary' && engines.glossary) engines.glossary.render();
        if (state.view === 'flashcard' && engines.flashcard) engines.flashcard.render();
        this._save();
    },
    nextCard() { engines.flashcard?.next(); },
    prevCard() { engines.flashcard?.prev(); },
    toggleShuffle() { engines.flashcard?.toggleShuffle(); },
    setReviewFilter(f) { engines.flashcard?.setFilter(f); },
    setCardFace(f) { engines.flashcard?.setFace(f); },

    // ── QUIZ ──
    checkArticleAnswer(a, btn) {
        engines.quiz?.answer(a, btn);
        this._save();
    },

    // ── UNIT SWITCHING ──
    _updateTitles(i) {
        const slabel = levelConfig.sectionLabel || 'Modul';
        const sectionName = levelConfig.sectionLabels?.[i] ? `: ${levelConfig.sectionLabels[i]}` : '';
        const label = `${slabel} ${i + 1}${sectionName}`;

        let prefix = '';
        if (!levelConfig.chapterGroups && levelConfig.modulesPerChapter) {
            const ch = Math.floor(i / levelConfig.modulesPerChapter) + 1;
            prefix = `Kapitel ${ch} - `;
        }
        
        const gTitle = document.getElementById('glossary-title');
        if (gTitle) gTitle.textContent = prefix + label;
    },

    switchUnit(i) {
        state.unit = i;
        const words = levelConfig?.vocabulary?.[i] || [];

        this._updateTitles(i);

        // If user is on a "view-only" screen (dashboard/trophies), clicking a unit
        // should navigate them back to the glossary for that unit.
        if (state.view === 'dashboard' || state.view === 'trophies') {
            engines.glossary?.loadUnit(words);
            engines.glossary?.render();
            this.switchView('glossary'); // switchView already closes mobile sidebar
        } else {
            if (state.view === 'glossary') {
                engines.glossary?.loadUnit(words);
                engines.glossary?.render();
            } else if (state.view === 'flashcard') {
                engines.flashcard?.loadUnit(words);
            } else if (state.view === 'article-quiz') {
                engines.quiz?.loadUnit(words);
            }
            // Always close sidebar on mobile when selecting a unit
            if (window.innerWidth <= 768) {
                document.getElementById('sidebar')?.classList.remove('open');
            }
        }

        this._renderUnitList();
        this._updateStats();
        if (engines.trophy) engines.trophy.evaluate(state.data, words);
    },

    // ── INTERNAL HELPERS ──
    _renderAuthUI() {
        const sync = document.getElementById('sync-status');
        const login = document.getElementById('login-btn');
        const info = document.getElementById('user-info');

        if (!login || !info) return;

        if (state.uid && auth?.currentUser) {
            if (sync) sync.textContent = '☁️ Cloud Sync Active';
            login.classList.add('hidden');
            info.classList.remove('hidden');

            const avatar = document.getElementById('user-avatar');
            const name = document.getElementById('user-name');
            if (avatar) avatar.src = auth.currentUser.photoURL || '';
            if (name) name.textContent = auth.currentUser.displayName || '';
        } else {
            if (sync) sync.textContent = '💾 Local Mode';
            login.classList.remove('hidden');
            info.classList.add('hidden');
        }
    },

    _initEngines() {
        if (this._enginesReady) {
            console.log('ℹ️ Engines already initialized, skipping.');
            return;
        }
        if (!levelConfig?.vocabulary) {
            console.error('❌ No vocabulary data loaded!');
            return;
        }
        this._enginesReady = true;

        const words = levelConfig.vocabulary[state.unit] || [];
        const known = new Set(state.data?.known || []);
        const favorites = new Set(state.data?.favorites || []);

        engines.glossary = new GlossaryEngine('glossary-tbody', words, known, favorites, (t) => this.speakText(t));
        engines.flashcard = new FlashcardEngine(
            words, known, favorites, state.data?.flashcardErrors || {},
            () => this._save(),
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
        engines.trophy = new TrophyEngine('trophy-container', state.data || {}, appId, (msg) => this._showToast(msg));

        this._renderUnitList();
        this._updateStats();

        // 🚀 CRITICAL FIX: Ensure the initial view is explicitly unhidden
        this.switchView(state.view);

        // Also update the title
        this._updateTitles(state.unit);

        console.log(`✅ Engines initialized with ${words.length} words in Unit ${state.unit + 1}`);
    }, _renderUnitList() {
        const list = document.getElementById('unit-list');
        if (!list || !levelConfig?.vocabulary) return;

        let html = '';
        const vocab = levelConfig.vocabulary;

        if (levelConfig.unitTitles) {
            // 🚀 B2 ARCHITECTURAL HANDOVER: Dynamic Grouping via unitTitles
            let currentChapter = "";
            const maxUnits = vocab.length;
            
            for (let i = 0; i < maxUnits; i++) {
                const globalIndex = i + 1; // Since unitTitles dictionary starts at 1
                if (!levelConfig.unitTitles[globalIndex]) {
                    // Fallback to flat rendering for this item if no title exists
                    html += this._createUnitItem(i, `Unit ${i + 1}`);
                    continue;
                }
                
                const titleStr = levelConfig.unitTitles[globalIndex];
                const parts = titleStr.split(':');
                const chapterPrefix = parts[0].trim();
                
                if (chapterPrefix !== currentChapter) {
                    html += `<div style="padding: 10px 20px; font-weight: bold; color: var(--text-muted); margin-top: 10px; border-bottom: 1px solid var(--border); font-size: 0.85rem; text-transform: uppercase;">
            📖 ${chapterPrefix.replace('K', 'Kapitel ')}
          </div>`;
                    currentChapter = chapterPrefix;
                }
                
                const cleanTitle = parts.slice(1).join(':').trim();
                html += this._createUnitItem(i, cleanTitle);
            }
        } else if (levelConfig.chapterGroups && levelConfig.chapterGroups.length > 0) {
            levelConfig.chapterGroups.forEach((chapter, chIndex) => {
                const nextStart = levelConfig.chapterGroups[chIndex + 1]?.start || vocab.length;
                html += `<div style="padding: 10px 20px; font-weight: bold; color: var(--text-muted); margin-top: 10px; border-bottom: 1px solid var(--border); font-size: 0.85rem; text-transform: uppercase;">
        ${chapter.title}
      </div>`;
                for (let i = chapter.start; i < nextStart && i < vocab.length; i++) {
                    html += this._createUnitItem(i, null);
                }
            });
        }
        else if (levelConfig.modulesPerChapter) {
            const perChapter = levelConfig.modulesPerChapter;
            const totalChapters = Math.ceil(vocab.length / perChapter);

            for (let ch = 0; ch < totalChapters; ch++) {
                const startIdx = ch * perChapter;
                const endIdx = Math.min(startIdx + perChapter, vocab.length);

                html += `<div style="padding: 10px 20px; font-weight: bold; color: var(--text-muted); margin-top: 10px; border-bottom: 1px solid var(--border); font-size: 0.85rem; text-transform: uppercase;">
        Kapitel ${ch + 1}
      </div>`;

                for (let i = startIdx; i < endIdx; i++) {
                    html += this._createUnitItem(i, null);
                }
            }
        } else {
             // 📄 NO GROUPING: Render flat list 
             for (let i = 0; i < vocab.length; i++) {
                 html += this._createUnitItem(i, null);
             }
        }

        list.innerHTML = html;
    },

    _createUnitItem(index, overrideLabel = null) {
        const isActive = index === state.unit;
        const prog = this._getUnitProgress(index);
        
        let label = '';
        if (overrideLabel) {
            label = overrideLabel;
        } else if (levelConfig.exactLabels) {
            label = levelConfig.sectionLabels?.[index] || `${levelConfig.sectionLabel || 'Modul'} ${index + 1}`;
        } else {
            const slabel = levelConfig.sectionLabel || 'Modul';
            const sectionName = levelConfig.sectionLabels?.[index] ? `: ${levelConfig.sectionLabels[index]}` : '';
            label = `${slabel} ${index + 1}${sectionName}`;
        }

        return `<div class="nav-item ${isActive ? 'active' : ''}" onclick="window.app.switchUnit(${index})" style="padding-left: 30px; font-size: 0.9rem;">
    <span>${label}</span>
    <span class="unit-progress">${prog.known}/${prog.total} (${prog.pct}%)</span>
  </div>`;
    },

    _getUnitProgress(i) {
        const unit = levelConfig?.vocabulary?.[i] || [];
        if (!unit.length) return { pct: 0, known: 0, total: 0 };
        // Use the live engine Set (always current), fall back to saved array on first load
        const knownSet = engines.flashcard?.knownIds || engines.glossary?.knownIds;
        const known = knownSet
            ? unit.filter(w => knownSet.has(w.id)).length
            : unit.filter(w => state.data?.known?.includes(w.id)).length;
        return {
            pct: Math.round((known / unit.length) * 100),
            known: known,
            total: unit.length
        };
    },

    // Returns { chapter, module } for any unit index, regardless of config type.
    // Used by dashboard rendering and weakest-unit label to avoid 3-branch duplication.
    _resolveUnitLabel(i) {
        if (levelConfig.unitTitles) {
            const titleStr = levelConfig.unitTitles[i + 1];
            if (!titleStr) return { chapter: `Unit ${i + 1}`, module: '' };
            const parts = titleStr.split(':');
            return {
                chapter: parts[0].trim().replace(/^K(\d+)$/, 'Kapitel $1'),
                module: parts.slice(1).join(':').trim()
            };
        }
        if (levelConfig.modulesPerChapter) {
            const ch = Math.floor(i / levelConfig.modulesPerChapter) + 1;
            const mod = levelConfig.sectionLabels?.[i] || `${levelConfig.sectionLabel || 'Modul'} ${i + 1}`;
            return { chapter: `Kapitel ${ch}`, module: mod };
        }
        return { chapter: `Unit ${i + 1}`, module: levelConfig.sectionLabels?.[i] || '' };
    },

    _updateStats() {
        const all = levelConfig?.vocabulary?.flat() || [];
        // Always use the live engine Set — state.data.known can be stale during a session
        const knownSet = engines.flashcard?.knownIds || engines.glossary?.knownIds;
        const knownCount = knownSet ? knownSet.size : (state.data?.known?.length || 0);
        const pct = all.length ? Math.round((knownCount / all.length) * 100) : 0;

        const setEl = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setEl('stat-known', knownCount);
        setEl('stat-total', all.length);
        setEl('stat-percent', `${pct}%`);
        setEl('overall-progress-text', `${pct}%`);

        const fill = document.getElementById('overall-progress-fill');
        if (fill) fill.style.width = `${pct}%`;

        // 📊 DASHBOARD RENDERING
        const statsTbody = document.getElementById('stats-tbody');
        if (statsTbody && levelConfig?.vocabulary) {
            const vocab = levelConfig.vocabulary;
            const usesChapters = !!(levelConfig.unitTitles || levelConfig.modulesPerChapter);
            let html = '';
            for (let i = 0; i < vocab.length; i++) {
                if (!vocab[i] || vocab[i].length === 0) continue;
                const { chapter, module } = this._resolveUnitLabel(i);
                const prog = this._getUnitProgress(i);
                html += `<tr>
                    <td>${chapter}</td>
                    <td>${module}</td>
                    <td>
                        <div class="progress-bar-bg" style="width: 100%; height: 6px; margin-bottom: 4px;">
                            <div class="progress-bar-fill" style="width: ${prog.pct}%;"></div>
                        </div>
                        <div style="font-size: 0.75rem; text-align: right; color: var(--text-muted);">${prog.known}/${prog.total} (${prog.pct}%)</div>
                    </td>
                </tr>`;
            }
            statsTbody.innerHTML = html;
            const thead = statsTbody.closest('table')?.querySelector('thead tr');
            if (thead) {
                thead.innerHTML = usesChapters
                    ? '<th>Chapter</th><th>Module</th><th>Progress</th>'
                    : '<th>Unit</th><th>Topic</th><th>Progress</th>';
            }
        }

        // Weakest unit
        let weakestIdx = -1;
        let lowestPct = 101;
        for (let i = 0; i < (levelConfig?.vocabulary?.length || 0); i++) {
            if (levelConfig.vocabulary[i]?.length > 0) {
                const prog = this._getUnitProgress(i);
                if (prog.pct < lowestPct) { lowestPct = prog.pct; weakestIdx = i; }
            }
        }
        let weakestLabel = '-';
        if (weakestIdx !== -1) {
            const { chapter, module } = this._resolveUnitLabel(weakestIdx);
            weakestLabel = module ? `${chapter}: ${module}` : chapter;
        }
        setEl('stat-weakest', weakestLabel);
    },

    _showToast(msg) {
        const t = document.getElementById('toast');
        const m = document.getElementById('toast-msg');
        if (m) m.textContent = msg;
        if (t) {
            t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 4000);
        }
        playChime(600, 150);
        setTimeout(() => playChime(900, 150), 150);
    },

    _save() {
        if (!state.data) state.data = getLocalProgress(appId);

        // ── Sync live engine state back to state.data before saving ──
        // The engines hold the live in-memory truth (Sets/objects).
        // state.data is the persistence layer — it must be updated from engines.
        const knownSet = engines.flashcard?.knownIds || engines.glossary?.knownIds;
        const favSet = engines.flashcard?.favoritesIds || engines.glossary?.favoritesIds;
        
        if (knownSet) {
            state.data.known = Array.from(knownSet);
        }
        if (favSet) {
            state.data.favorites = Array.from(favSet);
        }
        if (engines.flashcard?.errors) {
            state.data.flashcardErrors = { ...engines.flashcard.errors };
        }
        if (engines.trophy?.trophyCounts) {
            state.data.trophyCounts = { ...engines.trophy.trophyCounts };
        }

        const payload = {
            known: state.data.known || [],
            favorites: state.data.favorites || [],
            trophyCounts: state.data.trophyCounts || {},
            sessionsCompleted: state.data.sessionsCompleted || 0,
            darkMode: state.data.darkMode || false,
            ttsCount: state.data.ttsCount || 0,
            columnHideCount: state.data.columnHideCount || 0,
            darkModeToggleCount: state.data.darkModeToggleCount || 0,
            flashcardErrors: state.data.flashcardErrors || {},
            studyDates: state.data.studyDates || [],
            lastUpdated: new Date().toISOString()
        };

        if (state.uid && auth) {
            saveProgress(appId, state.uid, payload).catch(e => console.warn('Save to cloud failed:', e));
            updateLeaderboard(appId, state.uid, auth.currentUser?.displayName, auth.currentUser?.photoURL, payload.known.length).catch(e => console.warn('Leaderboard update failed:', e));
        }
        saveLocalProgress(appId, { ...state.data, ...payload });
    }
};

// 5. Boot Sequence
if (auth) {
    listenAuth(u => window.app._onAuth(u));
} else {
    console.log('⚠️ Running in offline mode (no Firebase)');
    // Initialize immediately without auth
    window.app._onAuth(null);
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM loaded.');
    if (!state.data) state.data = getLocalProgress(appId);
    // Apply theme early so there's no flash of unstyled content.
    // _initEngines() is already triggered by the boot sequence above (_onAuth),
    // but the _enginesReady guard prevents any double-init if DOMContentLoaded
    // fires after the boot sequence in a slow environment.
    window.app._applyTheme();
    if (!auth && !window.app._enginesReady) {
        window.app._renderAuthUI();
        window.app._initEngines();
    }
});