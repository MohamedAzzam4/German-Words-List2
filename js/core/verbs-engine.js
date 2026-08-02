/**
 * VerbsEngine
 * Controller for the Top German Verbs Mastery module.
 * Provides clean 4-column table view (GERMAN VERB, TRANSLATION, EXAMPLE SENTENCE GERMAN, ENGLISH TRANSLATION),
 * High-contrast legible text for Word Translation & English Example Sentences,
 * Inline compact per-row sentence toggle (`+2 ▾` / `▲`) next to German sentence,
 * Sticky Topbar header pinned at top on all mobile & desktop screens,
 * Mobile drawer sidebar compatibility with both `.open` & `.active` CSS triggers,
 * Gear ⚙️ Audio Settings drawer toggle,
 * Infinitive text click-to-pronounce, Flashcards Favorites-only practice mode,
 * Hide & Guess practice controls (Hide DE/EN/Mix/Examples/Reveal), TTS SpeechQueue,
 * 50-verb decks tracker, collapsible sidebar, Flashcard mode with Still Learning queue recycling & outline/filled star favorite toggles,
 * stable verb IDs & progress preservation across dataset re-rankings,
 * Card Direction Mode (DE->EN, EN->DE, Audio->DE),
 * Auto-Play Audio Practice Mode (custom repeat count, examples scope, English TTS translations, start-at-verb selection),
 * Floating Audio Control Pill (sticky pause/resume/stop bar),
 * Sleek SVG Row Action Play Chip buttons & Animated pulsing speech highlight (speechPulse),
 * AND full Firebase Account Authentication & Real-time Cloud Progress Sync.
 */
import { speak, cleanTextForAudio, SpeechQueue } from './tts.js';
import { 
    initFirebase, 
    loginWithGoogle as fbLoginWithGoogle, 
    logout as fbLogout, 
    loadProgress as fbLoadProgress, 
    saveProgress as fbSaveProgress, 
    listenAuth, 
    updateLeaderboard, 
    loginWithEmailAndPassword as fbLoginWithEmail, 
    signUpWithEmailAndPassword as fbSignUpWithEmail 
} from './firebase.js?v=3';
import { 
    getLocalProgress, 
    getLocalProgressForUser, 
    saveLocalProgress, 
    mergeProgress, 
    clearLocalProgress, 
    getDefaultProgressObj 
} from './storage.js?v=3';
import { sanitize } from './utils.js';

class VerbsEngineClass {
    constructor() {
        this.dataset = null;
        this.currentDeckId = 1;
        this.queue = [];
        this.currentIndex = 0;
        this.isFlipped = false;
        this.showHint = false;
        this.showConjugations = false;
        this.showOrigins = false;
        this.activeMode = 'glossary'; // Default view: 'glossary' (List View)
        this.cardDirectionMode = 'de-to-en'; // 'de-to-en', 'en-to-de', 'audio-to-de'
        this.isShuffle = false;
        this.flashcardFavOnly = false; // Review only favorites in flashcards
        this.showAllTableExamples = false; // Global toggle
        this.expandedRowIds = new Set(); // Per-row sentence toggle tracking
        this.hiddenCols = new Set(); // 'de', 'en', 'mixed', 'ex'
        this.isSidebarCollapsed = false;
        this.typeFilter = 'all'; // 'all', 'fav', 'sep', 'irreg'
        this.appId = 'a1_app_data';
        this.uid = null;
        this.auth = null;
        this.db = null;
        this._emailAuthMode = 'signin';

        this.userData = getLocalProgress(this.appId);

        if (!this.userData.finishedVerbDecks) {
            this.userData.finishedVerbDecks = [];
        }
        if (!this.userData.knownVerbIds) {
            this.userData.knownVerbIds = [];
        }
        if (!this.userData.verbFavorites) {
            this.userData.verbFavorites = [];
        }
    }

    async init() {
        try {
            this._applyTheme();

            // 1. Initialize Firebase Auth & Cloud Database
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
                const fbInit = initFirebase(firebaseConfig, this.appId);
                this.auth = fbInit.auth;
                this.db = fbInit.db;
            } catch (e) {
                console.warn('⚠️ Firebase init fallback:', e);
            }

            // 2. Fetch Verbs Dataset
            const res = await fetch('content/generated/verbs/top_verbs_2000.json');
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            this.dataset = await res.json();

            // 3. Set up Auth Listener & Sync
            if (this.auth) {
                listenAuth(async (user) => {
                    await this._onAuthChanged(user);
                });
            } else {
                this.renderAuthUI();
                this.renderDeckTracker();
                this.loadDeck(this.currentDeckId);
            }

            this.bindEvents();
            console.log(`✅ VerbsEngine initialized with ${this.dataset.totalVerbs} verbs across ${this.dataset.totalDecks} decks.`);
        } catch (e) {
            console.error('VerbsEngine initialization failed:', e);
            const container = document.getElementById('verbs-working-area');
            if (container) {
                container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Failed to load verbs dataset. Please refresh.</div>`;
            }
        }
    }

    async _onAuthChanged(user) {
        this.uid = user ? user.uid : null;

        if (user) {
            console.log('☁️ User logged in:', user.email);
            try {
                const safeLocal = getLocalProgressForUser(this.appId, user.uid);
                const remote = await fbLoadProgress(this.appId, user.uid);
                this.userData = mergeProgress(safeLocal, remote);
                saveLocalProgress(this.appId, this.userData, user.uid);
            } catch (e) {
                console.warn('Failed to load cloud progress:', e);
                this.userData = getLocalProgress(this.appId);
            }
        } else {
            console.log('💾 Running in local offline mode');
            this.userData = getLocalProgress(this.appId);
        }

        this.renderAuthUI();
        this.renderDeckTracker();
        this.loadDeck(this.currentDeckId);
        this.updateOverallProgress();
    }

    _save() {
        saveLocalProgress(this.appId, this.userData, this.uid);

        if (this.uid && this.auth) {
            fbSaveProgress(this.appId, this.uid, this.userData);
            const knownCount = (this.userData.knownVerbIds || []).length;
            const displayName = this.auth.currentUser?.displayName || this.auth.currentUser?.email || "Linguist";
            const photoURL = this.auth.currentUser?.photoURL || "";
            updateLeaderboard(this.appId, this.uid, displayName, photoURL, knownCount);
        }
    }

    // ── AUTHENTICATION METHODS ──
    async loginWithGoogle() {
        if (!this.auth) {
            alert('Firebase not configured. Check network connection.');
            return;
        }
        try {
            await fbLoginWithGoogle();
            window.location.reload();
        } catch (e) {
            console.error('Google login failed:', e);
            alert('Login failed: ' + e.message);
        }
    }

    openEmailAuthModal() {
        let modal = document.getElementById('email-auth-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'email-auth-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:24px; max-width:400px; margin:15% auto; color:var(--text-main);">
                    <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                        <h3 id="modal-title" style="margin:0;">Sign In with Email</h3>
                        <button class="modal-close" onclick="window.verbsEngine.closeEmailAuthModal()" style="background:none; border:none; font-size:1.2rem; cursor:pointer; color:var(--text-muted);">✕</button>
                    </div>
                    <form id="email-auth-form">
                        <div class="form-group hidden" id="name-group" style="margin-bottom:12px;">
                            <label for="auth-name" style="display:block; font-size:0.85rem; margin-bottom:4px;">Name</label>
                            <input type="text" id="auth-name" class="form-input" placeholder="Your name" style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--border); background:var(--bg); color:var(--text-main);">
                        </div>
                        <div class="form-group" style="margin-bottom:12px;">
                            <label for="auth-email" style="display:block; font-size:0.85rem; margin-bottom:4px;">Email</label>
                            <input type="email" id="auth-email" class="form-input" placeholder="you@example.com" required autocomplete="username" style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--border); background:var(--bg); color:var(--text-main);">
                        </div>
                        <div class="form-group" style="margin-bottom:16px;">
                            <label for="auth-password" style="display:block; font-size:0.85rem; margin-bottom:4px;">Password</label>
                            <input type="password" id="auth-password" class="form-input" placeholder="••••••••" required autocomplete="current-password" style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--border); background:var(--bg); color:var(--text-main);">
                        </div>
                        <div id="auth-error-msg" style="color:var(--danger); font-size:0.85rem; margin-bottom:12px;"></div>
                        <div class="modal-footer">
                            <button type="submit" class="btn primary" id="auth-submit-btn" style="width: 100%; padding:12px; font-weight:bold;">Sign In</button>
                            <div class="modal-toggle-text" style="text-align:center; margin-top:12px; font-size:0.85rem; cursor:pointer; color:var(--primary);" onclick="window.verbsEngine.toggleEmailAuthMode()">
                                Don't have an account? <span id="auth-toggle-link" style="text-decoration:underline;">Sign Up</span>
                            </div>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('email-auth-form').addEventListener('submit', (e) => {
                this.handleEmailAuth(e);
            });
        }

        this._emailAuthMode = 'signin';
        document.getElementById('name-group').classList.add('hidden');
        document.getElementById('auth-name').removeAttribute('required');
        document.getElementById('modal-title').textContent = 'Sign In with Email';
        document.getElementById('auth-submit-btn').textContent = 'Sign In';
        document.getElementById('auth-toggle-link').textContent = 'Sign Up';
        document.getElementById('auth-error-msg').textContent = '';
        document.getElementById('email-auth-form').reset();

        modal.classList.remove('hidden');
    }

    closeEmailAuthModal() {
        const modal = document.getElementById('email-auth-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    toggleEmailAuthMode() {
        const nameGroup = document.getElementById('name-group');
        const authName = document.getElementById('auth-name');
        const modalTitle = document.getElementById('modal-title');
        const submitBtn = document.getElementById('auth-submit-btn');
        const toggleLink = document.getElementById('auth-toggle-link');
        const errorMsg = document.getElementById('auth-error-msg');

        errorMsg.textContent = '';

        if (this._emailAuthMode === 'signin') {
            this._emailAuthMode = 'signup';
            nameGroup.classList.remove('hidden');
            authName.setAttribute('required', 'true');
            modalTitle.textContent = 'Create Account';
            submitBtn.textContent = 'Sign Up';
            toggleLink.textContent = 'Sign In';
        } else {
            this._emailAuthMode = 'signin';
            nameGroup.classList.add('hidden');
            authName.removeAttribute('required');
            modalTitle.textContent = 'Sign In with Email';
            submitBtn.textContent = 'Sign In';
            toggleLink.textContent = 'Sign Up';
        }
    }

    async handleEmailAuth(event) {
        event.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const name = document.getElementById('auth-name').value;
        const errorMsg = document.getElementById('auth-error-msg');
        const submitBtn = document.getElementById('auth-submit-btn');

        errorMsg.textContent = '';
        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing... ⏳';

        try {
            if (this._emailAuthMode === 'signup') {
                await fbSignUpWithEmail(email, password, name);
            } else {
                await fbLoginWithEmail(email, password);
            }
            this.closeEmailAuthModal();
            window.location.reload();
        } catch (e) {
            console.error('Email authentication failed:', e);
            let userFriendlyMsg = e.message;
            if (e.code === 'auth/invalid-credential' || e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password') {
                userFriendlyMsg = 'Incorrect email or password.';
            } else if (e.code === 'auth/email-already-in-use') {
                userFriendlyMsg = 'This email is already registered. Try logging in.';
            } else if (e.code === 'auth/weak-password') {
                userFriendlyMsg = 'Password should be at least 6 characters.';
            } else if (e.code === 'auth/invalid-email') {
                userFriendlyMsg = 'Please enter a valid email address.';
            }
            errorMsg.textContent = userFriendlyMsg;
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    }

    async logout() {
        if (this.auth) {
            try { await fbLogout(); } catch (e) {}
        }
        clearLocalProgress(this.appId);
        window._isLoggingOut = true;
        window.location.reload();
    }

    async resetData() {
        if (confirm("⚠️ Are you sure you want to completely RESET ALL your progress data? This cannot be undone!")) {
            clearLocalProgress(this.appId);
            if (this.auth && this.uid) {
                try {
                    await fbSaveProgress(this.appId, this.uid, getDefaultProgressObj());
                } catch (e) {
                    console.warn("Failed to reset firebase.", e);
                }
            }
            window.location.reload();
        }
    }

    renderAuthUI() {
        const sync = document.getElementById('sync-status');
        const login = document.getElementById('login-btn');
        const loginEmail = document.getElementById('login-email-btn');
        const info = document.getElementById('user-info');

        if (!info) return;

        if (this.uid && this.auth?.currentUser) {
            if (sync) sync.textContent = '☁️ Cloud Sync Active';
            if (login) login.classList.add('hidden');
            if (loginEmail) loginEmail.classList.add('hidden');
            info.classList.remove('hidden');

            const avatar = document.getElementById('user-avatar');
            const name = document.getElementById('user-name');
            if (avatar) {
                avatar.src = this.auth.currentUser.photoURL || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%2364748b\'><path d=\'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z\'/></svg>';
            }
            if (name) name.textContent = this.auth.currentUser.displayName || this.auth.currentUser.email || 'Linguist User';
        } else {
            if (sync) sync.textContent = '💾 Local Mode';
            if (login) login.classList.remove('hidden');
            if (loginEmail) loginEmail.classList.remove('hidden');
            info.classList.add('hidden');
        }
    }

    _applyTheme() {
        const isDark = !!this.userData.darkMode;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        const themeBtn = document.getElementById('theme-btn');
        if (themeBtn) {
            themeBtn.textContent = isDark ? '☀️' : '🌙';
        }
    }

    toggleDarkMode() {
        this.userData.darkMode = !this.userData.darkMode;
        this._save();
        this._applyTheme();
    }

    toggleSidebar(e) {
        if (e) e.stopPropagation();
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const body = document.body;
        
        if (window.innerWidth > 768) {
            this.isSidebarCollapsed = !this.isSidebarCollapsed;
            body.classList.toggle('sidebar-collapsed', this.isSidebarCollapsed);
        } else {
            if (sidebar) {
                sidebar.classList.toggle('open');
                sidebar.classList.toggle('active');
            }
            if (overlay) {
                overlay.classList.toggle('visible');
                overlay.classList.toggle('active');
            }
        }
    }

    toggleAudioSettingsDrawer() {
        const drawer = document.getElementById('audio-settings-drawer');
        const btn = document.getElementById('btn-toggle-audio-settings');
        if (drawer) {
            drawer.classList.toggle('hidden');
            if (btn) {
                btn.classList.toggle('active', !drawer.classList.contains('hidden'));
            }
        }
    }

    setCardDirectionMode(mode) {
        this.cardDirectionMode = mode;
        this.isFlipped = false;
        this.showHint = false;
        this.renderCard();
    }

    toggleFlashcardFavOnly() {
        this.flashcardFavOnly = !this.flashcardFavOnly;
        const btn = document.getElementById('fav-only-btn');
        if (btn) {
            btn.textContent = `⭐ Favorites Only: ${this.flashcardFavOnly ? 'ON' : 'OFF'}`;
            btn.classList.toggle('primary', this.flashcardFavOnly);
        }
        this.currentIndex = 0;
        this.isFlipped = false;
        this.showHint = false;
        this.renderCard();
    }

    toggleTableExamples() {
        this.showAllTableExamples = !this.showAllTableExamples;
        const btn = document.getElementById('btn-toggle-examples');
        if (btn) {
            btn.textContent = `💬 Show All Sentences (${this.showAllTableExamples ? 'ON' : 'OFF'})`;
            btn.classList.toggle('primary', this.showAllTableExamples);
        }
        this.renderTable();
    }

    toggleRowSentences(verbId) {
        if (this.expandedRowIds.has(verbId)) {
            this.expandedRowIds.delete(verbId);
        } else {
            this.expandedRowIds.add(verbId);
        }
        this.renderTable();
    }

    isVerbKnown(w) {
        if (!w || !this.userData.knownVerbIds) return false;
        const known = this.userData.knownVerbIds;
        const inf = (w.infinitive || '').toLowerCase();
        const id = w.id;

        return known.includes(id) || known.includes(w.infinitive) || known.includes(inf) || known.includes(`v_${inf}`);
    }

    isVerbFavorite(w) {
        if (!w || !this.userData.verbFavorites) return false;
        const favs = this.userData.verbFavorites;
        const inf = (w.infinitive || '').toLowerCase();
        const id = w.id;

        return favs.includes(id) || favs.includes(w.infinitive) || favs.includes(inf) || favs.includes(`v_${inf}`);
    }

    updateOverallProgress() {
        if (!this.dataset) return;
        const allVerbs = this.dataset.decks.flatMap(d => d.verbs);
        const total = allVerbs.length;
        const knownCount = allVerbs.filter(v => this.isVerbKnown(v)).length;
        const pct = Math.round((knownCount / total) * 100);

        const fillEl = document.getElementById('overall-progress-fill');
        const textEl = document.getElementById('overall-progress-text');
        if (fillEl) fillEl.style.width = `${pct}%`;
        if (textEl) textEl.textContent = `${knownCount} / ${total} (${pct}%)`;
    }

    loadDeck(deckId) {
        if (!this.dataset) return;
        const deck = this.dataset.decks.find(d => d.deckId === deckId);
        if (!deck) return;

        this.currentDeckId = deckId;
        this.queue = [...deck.verbs];
        if (this.isShuffle) {
            this._shuffleQueue();
        }
        this.currentIndex = 0;
        this.isFlipped = false;
        this.showHint = false;
        this.showConjugations = false;
        this.showOrigins = false;

        this.updateDeckHeader(deck);
        this.renderTable();
        this.renderCard();
        this.renderDeckTracker();
        this.populateStartVerbDropdown();
    }

    populateStartVerbDropdown() {
        const select = document.getElementById('auto-start-verb');
        if (!select || !this.queue) return;

        select.innerHTML = this.queue.map((v, idx) => `
            <option value="${idx}">#${v.index} ${v.infinitive} (${v.meaning})</option>
        `).join('');
    }

    _shuffleQueue() {
        for (let i = this.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
    }

    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        const btn = document.getElementById('shuffle-btn');
        if (btn) {
            btn.textContent = `🔀 Shuffle: ${this.isShuffle ? 'ON' : 'OFF'}`;
        }
        this.loadDeck(this.currentDeckId);
    }

    updateDeckHeader(deck) {
        const titleEl = document.getElementById('verbs-deck-title');
        if (titleEl) {
            titleEl.textContent = deck.title;
        }
    }

    renderDeckTracker() {
        const trackerContainer = document.getElementById('verbs-deck-grid');
        const summaryEl = document.getElementById('verbs-finished-summary');

        if (!this.dataset) return;

        const finishedCount = (this.userData.finishedVerbDecks || []).length;
        if (summaryEl) {
            summaryEl.textContent = `${finishedCount} / ${this.dataset.totalDecks} Decks Finished`;
        }

        if (trackerContainer) {
            trackerContainer.innerHTML = this.dataset.decks.map(deck => {
                const isFinished = (this.userData.finishedVerbDecks || []).includes(deck.deckId);
                const isActive = deck.deckId === this.currentDeckId;
                
                const knownInDeck = deck.verbs.filter(v => this.isVerbKnown(v)).length;
                const pct = Math.round((knownInDeck / deck.count) * 100);

                let badgeClass = 'status-new';
                let badgeText = 'New';
                if (isFinished || pct === 100) {
                    badgeClass = 'status-completed';
                    badgeText = '✅ Finished';
                } else if (knownInDeck > 0) {
                    badgeClass = 'status-progress';
                    badgeText = `🔄 ${pct}%`;
                }

                return `
                    <div class="deck-chip-card ${isActive ? 'active' : ''}" data-deck-id="${deck.deckId}">
                        <div class="deck-chip-header">
                            <span class="deck-chip-num">Deck ${deck.deckId}</span>
                            <span class="status-chip ${badgeClass}">${badgeText}</span>
                        </div>
                        <div class="deck-chip-sub">Verbs ${deck.verbs[0].index}–${deck.verbs[deck.verbs.length - 1].index}</div>
                        <div class="deck-progress-track">
                            <div class="deck-progress-fill" style="width: ${pct}%;"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    _getExamplePairs(w) {
        const exDe = w.exampleDe || w.example || '';
        const exEn = w.exampleEn || '';
        if (!exDe) return [];

        const deParts = exDe.split(' | ').map(s => s.trim()).filter(Boolean);
        const enParts = exEn.split(' | ').map(s => s.trim()).filter(Boolean);

        return deParts.map((de, idx) => {
            let en = enParts[idx] || '';
            // Strip tense labels like (Präsens), (Präteritum), (Partizip II), (Futur I)
            en = en.replace(/\s*\((Präsens|Präteritum|Partizip II|Futur I)\)/gi, '').trim();
            return {
                de: de,
                en: en
            };
        });
    }

    // ── GLOSSARY / LIST VIEW ──
    setFilter(type) {
        this.typeFilter = type;
        this.renderTable();
        this.populateStartVerbDropdown();
    }

    toggleColumn(col) {
        if (this.hiddenCols.has(col)) {
            this.hiddenCols.delete(col);
        } else {
            this.hiddenCols.add(col);
        }
        this.renderTable();
    }

    toggleExamples() {
        this.toggleColumn('ex');
    }

    revealAllTable() {
        this.hiddenCols.clear();
        this.renderTable();
    }

    renderTable() {
        const tbody = document.getElementById('verbs-table-tbody');
        if (!tbody || this.queue.length === 0) return;

        const filtered = this.queue.filter(w => {
            if (this.typeFilter === 'fav') return this.isVerbFavorite(w);
            if (this.typeFilter === 'sep') return w.prefixInfo.isSeparable;
            if (this.typeFilter === 'irreg') return w.tags.includes('irregular');
            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:2.5rem;">No verbs match your current filter</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map((w, arrayIdx) => {
            const isKnown = this.isVerbKnown(w);
            const isFav = this.isVerbFavorite(w);

            const isMixed = this.hiddenCols.has('mixed');
            const hideDE = this.hiddenCols.has('de') || (isMixed && Math.random() > 0.5);
            const hideEN = this.hiddenCols.has('en') || (isMixed && !hideDE);
            const hideEX = this.hiddenCols.has('ex');

            const examplePairs = this._getExamplePairs(w);
            const isRowExpanded = this.expandedRowIds.has(w.id) || this.showAllTableExamples;
            const displayPairs = isRowExpanded ? examplePairs : examplePairs.slice(0, 1);
            const hasMoreSentences = examplePairs.length > 1;

            return `
                <tr data-id="${w.id}" data-array-idx="${arrayIdx}" class="${isKnown ? 'known-row' : ''}">
                    <!-- COLUMN 1: GERMAN VERB (Infinitive + 3rd Form + Actions) -->
                    <td style="width: 20%;">
                        <div style="display:flex; align-items:flex-start; gap: 8px;">
                            <span class="fav-icon-btn ${isFav ? 'active' : ''}" data-action="fav" data-verb-id="${w.id}" title="Toggle Favorite">${isFav ? '⭐' : '☆'}</span>
                            <div class="row-action-group">
                                <button class="row-play-btn" data-action="play-from-row" data-array-idx="${arrayIdx}" title="Start Auto-Play Audio sequence from this verb">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                </button>
                            </div>
                            <div style="flex:1; margin-left: 2px;">
                                <span class="verb-infinitive-click ${hideDE ? 'hidden-word' : ''} hideable" onclick="if(this.classList.contains('hidden-word')){this.classList.remove('hidden-word');}else{window.verbsEngine.speakText('${w.infinitive}');}" title="Click verb text to pronounce">${sanitize(w.infinitive)}</span>
                                <div class="${hideDE ? 'hidden-word' : ''} hideable" style="font-size:0.8rem; color:var(--text-muted); cursor:pointer;" onclick="this.classList.remove('hidden-word')" title="Click to reveal">${w.conjugation.present3rd}</div>
                            </div>
                        </div>
                    </td>

                    <!-- COLUMN 2: TRANSLATION (Word Meaning Translation with High Contrast) -->
                    <td style="width: 18%;">
                        <div class="verb-meaning-sub ${hideEN ? 'hidden-word' : ''} hideable" style="cursor:pointer;" onclick="this.classList.remove('hidden-word')" title="Click to reveal">
                            ${sanitize(w.meaning)}
                            ${isKnown ? '<span style="color:var(--success); font-weight:bold; margin-left:4px;" title="Known">✓</span>' : ''}
                        </div>
                    </td>

                    <!-- COLUMN 3: EXAMPLE SENTENCE GERMAN (Inline sentence + per-row toggle button on same line) -->
                    <td style="width: 31%;">
                        <div class="table-ex-de-text ${hideEX ? 'hidden-word' : ''} hideable" style="cursor:pointer;" onclick="this.classList.remove('hidden-word')">
                            ${displayPairs.length > 0 ? displayPairs.map((pair, pIdx) => {
                                const safeDe = pair.de.replace(/"/g, '&quot;');
                                const isFirst = pIdx === 0;
                                return `
                                    <div style="margin-bottom: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                        <span>💬 <span class="ex-sentence-span" style="cursor:pointer;" onclick="if(this.closest('.hideable').classList.contains('hidden-word')){this.closest('.hideable').classList.remove('hidden-word');}else{window.verbsEngine.speakText('${safeDe}');}" title="Click sentence to pronounce">
                                            ${sanitize(pair.de)}
                                        </span></span>
                                        ${(isFirst && hasMoreSentences) ? `
                                            <button class="ex-row-toggle-btn" onclick="event.stopPropagation(); window.verbsEngine.toggleRowSentences('${w.id}');" title="Toggle extra sentences">
                                                ${isRowExpanded ? '▲ Hide' : `+${examplePairs.length - 1} ▾`}
                                            </button>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('') : '<span style="color:var(--text-muted); opacity:0.6;">No example</span>'}
                        </div>
                    </td>

                    <!-- COLUMN 4: ENGLISH TRANSLATION (Clean English sentences without (Präsens) labels) -->
                    <td style="width: 31%;">
                        <div class="table-ex-en-text ${hideEN ? 'hidden-word' : ''} hideable" style="cursor:pointer;" onclick="this.classList.remove('hidden-word')">
                            ${displayPairs.length > 0 ? displayPairs.map(pair => `
                                <div style="margin-bottom: 4px;">
                                    ${pair.en ? sanitize(pair.en) : '<span style="opacity:0.5;">—</span>'}
                                </div>
                            `).join('') : '<span style="color:var(--text-muted); opacity:0.6;">—</span>'}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ── ADVANCED AUTO-PLAY AUDIO PRACTICE QUEUE ──
    playAllVerbsAudio(startIndex = null) {
        if (!this.queue || this.queue.length === 0) return;

        const repeatSelect = document.getElementById('auto-repeat-count');
        const exampleSelect = document.getElementById('auto-example-mode');
        const includeEnCheck = document.getElementById('auto-include-en');
        const startVerbSelect = document.getElementById('auto-start-verb');

        const repeatCount = repeatSelect ? parseInt(repeatSelect.value, 10) || 1 : 1;
        const exampleMode = exampleSelect ? exampleSelect.value : 'first';
        const includeEn = includeEnCheck ? includeEnCheck.checked : true;

        let startIdx = 0;
        if (startIndex !== null && typeof startIndex === 'number') {
            startIdx = Math.max(0, Math.min(startIndex, this.queue.length - 1));
            if (startVerbSelect) startVerbSelect.value = startIdx;
        } else if (startVerbSelect && startVerbSelect.value !== '') {
            startIdx = parseInt(startVerbSelect.value, 10) || 0;
        }

        const itemsToPlay = [];

        for (let i = startIdx; i < this.queue.length; i++) {
            const verb = this.queue[i];
            const exPairs = this._getExamplePairs(verb);

            for (let r = 0; r < repeatCount; r++) {
                itemsToPlay.push({
                    verbId: verb.id,
                    verbInfinitive: verb.infinitive,
                    verbIndex: verb.index,
                    text: verb.infinitive,
                    lang: 'de',
                    label: `Verb (${r+1}/${repeatCount})`
                });

                if (includeEn && verb.meaning) {
                    itemsToPlay.push({
                        verbId: verb.id,
                        verbInfinitive: verb.infinitive,
                        verbIndex: verb.index,
                        text: verb.meaning,
                        lang: 'en',
                        label: `Translation`
                    });
                }

                if (exampleMode !== 'none' && exPairs.length > 0) {
                    const targetPairs = exampleMode === 'first' ? [exPairs[0]] : exPairs;

                    for (const pair of targetPairs) {
                        if (pair.de) {
                            itemsToPlay.push({
                                verbId: verb.id,
                                verbInfinitive: verb.infinitive,
                                verbIndex: verb.index,
                                text: pair.de,
                                lang: 'de',
                                label: `Example (DE)`
                            });
                        }
                        if (includeEn && pair.en) {
                            itemsToPlay.push({
                                verbId: verb.id,
                                verbInfinitive: verb.infinitive,
                                verbIndex: verb.index,
                                text: pair.en,
                                lang: 'en',
                                label: `Example (EN)`
                            });
                        }
                    }
                }
            }
        }

        const btn = document.getElementById('btn-play-all-words');
        const pauseBtn = document.getElementById('btn-pause-words');
        const fab = document.getElementById('floating-audio-bar');
        const fabVerbText = document.getElementById('fab-current-verb');
        const fabPauseIcon = document.getElementById('fab-pause-icon');

        if (btn) {
            btn.classList.add('playing');
            btn.innerHTML = '<span>🔊</span> Auto Playing...';
        }
        if (pauseBtn) {
            pauseBtn.classList.remove('hidden');
        }
        if (fab) {
            fab.classList.remove('hidden');
        }

        SpeechQueue.playAll(
            itemsToPlay,
            (idx, item) => {
                const tr = document.querySelector(`tr[data-id="${item.verbId}"]`);
                if (tr) {
                    tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    document.querySelectorAll('.highlighted-speech').forEach(el => el.classList.remove('highlighted-speech'));
                    tr.classList.add('highlighted-speech');
                }
                if (fabVerbText && item.verbInfinitive) {
                    fabVerbText.textContent = `Playing: #${item.verbIndex} ${item.verbInfinitive}`;
                }
                if (fabPauseIcon) {
                    fabPauseIcon.textContent = '⏸️';
                }
            },
            () => {
                this.stopAudioQueue();
            }
        );
    }

    togglePauseAudio() {
        const pauseBtn = document.getElementById('btn-pause-words');
        const fabPauseIcon = document.getElementById('fab-pause-icon');

        if (SpeechQueue.isPlaying) {
            SpeechQueue.pause();
            if (pauseBtn) pauseBtn.innerHTML = '<span>▶️</span> Resume';
            if (fabPauseIcon) fabPauseIcon.textContent = '▶️';
        } else {
            SpeechQueue.resume();
            if (pauseBtn) pauseBtn.innerHTML = '<span>⏸️</span> Pause';
            if (fabPauseIcon) fabPauseIcon.textContent = '⏸️';
        }
    }

    stopAudioQueue() {
        SpeechQueue.stop();
        document.querySelectorAll('.highlighted-speech').forEach(el => el.classList.remove('highlighted-speech'));
        const btn = document.getElementById('btn-play-all-words');
        const pauseBtn = document.getElementById('btn-pause-words');
        const fab = document.getElementById('floating-audio-bar');

        if (btn) {
            btn.classList.remove('playing');
            btn.innerHTML = '<span>▶️</span> Auto Play Audio';
        }
        if (pauseBtn) {
            pauseBtn.classList.add('hidden');
        }
        if (fab) {
            fab.classList.add('hidden');
        }
    }

    // ── FLASHCARD VIEW ──
    renderCard() {
        const cardContainer = document.getElementById('verbs-card-working-area');
        if (!cardContainer || this.queue.length === 0) return;

        let activeQueue = this.queue;
        if (this.flashcardFavOnly) {
            activeQueue = this.queue.filter(w => this.isVerbFavorite(w));
        }

        if (activeQueue.length === 0) {
            cardContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem 1.5rem; background: var(--surface); border: 1px dashed var(--border); border-radius: 20px; color: var(--text-main);">
                    <div style="font-size: 3rem; margin-bottom: 0.8rem;">⭐</div>
                    <h3 style="margin-bottom: 0.5rem; font-family: 'Poppins', sans-serif;">No Favorite Verbs in this Deck</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 400px; margin: 0 auto 1.2rem;">Star (⭐) some verbs in the list view to practice them here!</p>
                    <button class="btn primary" onclick="window.verbsEngine.toggleFlashcardFavOnly()">Show All Verbs</button>
                </div>
            `;
            return;
        }

        if (this.currentIndex >= activeQueue.length) {
            this.currentIndex = 0;
        }

        const verb = activeQueue[this.currentIndex];
        const isFav = this.isVerbFavorite(verb);
        const isKnown = this.isVerbKnown(verb);

        const tagsHTML = verb.tags.map(t => `<span class="verb-tag-badge">${t}</span>`).join(' ');

        const conj = verb.conjugation;
        const conjTableHTML = `
            <div class="conjugation-tables-block ${this.showConjugations ? '' : 'hidden'}">
                <div class="conj-grid">
                    <div class="conj-section">
                        <h4>Present (Präsens)</h4>
                        <ul>
                            <li><span>ich:</span> <strong>${conj.present.ich}</strong></li>
                            <li><span>du:</span> <strong>${conj.present.du}</strong></li>
                            <li><span>er/sie/es:</span> <strong>${conj.present.er_sie_es}</strong></li>
                            <li><span>wir:</span> <strong>${conj.present.wir}</strong></li>
                            <li><span>ihr:</span> <strong>${conj.present.ihr}</strong></li>
                            <li><span>sie/Sie:</span> <strong>${conj.present.sie_Sie}</strong></li>
                        </ul>
                    </div>
                    <div class="conj-section">
                        <h4>Past (Präteritum)</h4>
                        <ul>
                            <li><span>ich:</span> <strong>${conj.past.ich}</strong></li>
                            <li><span>du:</span> <strong>${conj.past.du}</strong></li>
                            <li><span>er/sie/es:</span> <strong>${conj.past.er_sie_es}</strong></li>
                            <li><span>wir:</span> <strong>${conj.past.wir}</strong></li>
                            <li><span>ihr:</span> <strong>${conj.past.ihr}</strong></li>
                            <li><span>sie/Sie:</span> <strong>${conj.past.sie_Sie}</strong></li>
                        </ul>
                    </div>
                    <div class="conj-section">
                        <h4>Future (Futur I)</h4>
                        <ul>
                            <li><span>ich:</span> <strong>${conj.future.ich}</strong></li>
                            <li><span>du:</span> <strong>${conj.future.du}</strong></li>
                            <li><span>er/sie/es:</span> <strong>${conj.future.er_sie_es}</strong></li>
                            <li><span>wir:</span> <strong>${conj.future.wir}</strong></li>
                            <li><span>ihr:</span> <strong>${conj.future.ihr}</strong></li>
                            <li><span>sie/Sie:</span> <strong>${conj.future.sie_Sie}</strong></li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        const orig = verb.origins;
        const originsHTML = `
            <div class="origins-block ${this.showOrigins ? '' : 'hidden'}">
                <div class="origins-card-inner">
                    ${orig.prefix ? `<div class="orig-row"><span>Prefix:</span> <strong>${orig.prefix}</strong> (${orig.prefixMeaning})</div>` : ''}
                    <div class="orig-row"><span>Root Verb:</span> <strong>${orig.rootVerb}</strong> (${orig.rootMeaning})</div>
                    <div class="orig-row logic"><span>Combined Logic:</span> ${orig.combinedLogic}</div>
                </div>
            </div>
        `;

        const examplePairs = this._getExamplePairs(verb);
        const hasEn = examplePairs.some(p => p.en);

        let frontMainHTML = '';
        let frontHintText = '';

        if (this.cardDirectionMode === 'en-to-de') {
            frontMainHTML = `
                <div class="verb-label">Meaning (English)</div>
                <h2 class="verb-infinitive" style="font-size: 2.2rem; color: var(--primary);">${verb.meaning}</h2>
                <div class="verb-tags-container">${tagsHTML}</div>
            `;
            frontHintText = `Verb Infinitive: ${verb.infinitive.substring(0, 3)}... (${verb.prefixInfo.prefix || 'Base'})`;
        } else if (this.cardDirectionMode === 'audio-to-de') {
            frontMainHTML = `
                <div class="verb-label">Listening Practice 🔊</div>
                <div style="display: flex; justify-content: center; width: 100%; margin: 16px 0;">
                    <button class="btn btn-primary" style="font-size: 1.3rem; padding: 14px 28px; border-radius: 50px; display: inline-flex; align-items: center; justify-content: center; gap: 10px;" data-action="speak">
                        🔊 Listen to Verb
                    </button>
                </div>
                <div class="verb-tags-container">${tagsHTML}</div>
            `;
            frontHintText = `Meaning: ${verb.meaning}`;
        } else {
            frontMainHTML = `
                <div class="verb-label">Verb (German)</div>
                <h2 class="verb-infinitive">${verb.infinitive}</h2>
                <div class="verb-tags-container">${tagsHTML}</div>
            `;
            frontHintText = verb.meaning;
        }

        const cardHTML = `
            <div class="verb-flashcard ${this.isFlipped ? 'flipped' : ''}" data-action="flip">
                <!-- FRONT OF CARD -->
                <div class="verb-card-front">
                    <div class="verb-card-topbar">
                        <button class="hint-btn" data-action="toggle-hint" title="Get a hint">
                            💡 ${this.showHint ? 'Hide Hint' : 'Get a hint'}
                        </button>
                        <div class="topbar-right-btns" style="display:flex; align-items:center; gap:12px;">
                            <button class="speak-btn" data-action="speak" title="Speak Verb">🔊</button>
                            <span class="fav-icon-btn ${isFav ? 'active' : ''}" data-action="fav" data-verb-id="${verb.id}" title="Toggle Favorite">${isFav ? '⭐' : '☆'}</span>
                        </div>
                    </div>

                    <div class="verb-center-content">
                        ${frontMainHTML}
                        <div class="verb-hint-box ${this.showHint ? '' : 'hidden'}">
                            <span>Hint:</span> ${frontHintText}
                        </div>
                    </div>

                    <div class="verb-tap-hint">Tap card to flip to back 🔄</div>
                </div>

                <!-- BACK OF CARD -->
                <div class="verb-card-back">
                    <div class="verb-card-topbar">
                        <span class="back-accent-sparkles">✨✨✨✨✨✨✨✨✨✨</span>
                        <div class="topbar-right-btns" style="display:flex; align-items:center; gap:12px;">
                            <button class="speak-btn" data-action="speak" title="Speak Verb">🔊</button>
                            <span class="fav-icon-btn ${isFav ? 'active' : ''}" data-action="fav" data-verb-id="${verb.id}" title="Toggle Favorite">${isFav ? '⭐' : '☆'}</span>
                        </div>
                    </div>

                    <div class="verb-back-content">
                        <div class="back-main-row">
                            <div class="back-field"><span>Infinitive:</span> <strong style="font-size: 1.2rem; color: var(--primary);">${verb.infinitive}</strong></div>
                            <div class="back-field meaning-field"><span>Meaning:</span> <strong>${verb.meaning}</strong></div>
                            ${verb.prefixInfo.prefix ? `<div class="back-field"><span>Prefix:</span> <strong>${verb.prefixInfo.prefix}</strong> (separable)</div>` : ''}
                            <div class="back-field"><span>Participle (Partizip II):</span> <strong>${conj.participle}</strong></div>
                            <div class="back-field"><span>Auxiliary:</span> <strong>${conj.auxiliary}</strong></div>
                        </div>

                        ${examplePairs.length > 0 ? `
                            <div class="back-example-box">
                                <div class="ex-label" style="margin-bottom: 6px;">Example Sentences:</div>
                                <div class="ex-text" style="margin: 6px 0; line-height: 1.5;">
                                    💬 ${examplePairs.map((pair, idx) => {
                                        const safeDe = pair.de.replace(/"/g, '&quot;');
                                        return `
                                            <span class="ex-sentence-span" style="cursor:pointer;" onclick="window.verbsEngine.speakText('${safeDe}')" title="Click sentence to pronounce">
                                                ${sanitize(pair.de)}
                                            </span>
                                            ${idx < examplePairs.length - 1 ? '<span style="color:var(--text-muted); opacity:0.4; margin: 0 4px;">|</span>' : ''}
                                        `;
                                    }).join('')}
                                </div>

                                ${hasEn ? `
                                    <div style="margin-top: 6px;">
                                        <button class="ex-en-chip" onclick="this.closest('.back-example-box').querySelector('.ex-en-line').classList.toggle('hidden');" title="Toggle English Example Translations">
                                            🇺🇸 EN
                                        </button>
                                        <div class="ex-en-line hidden" style="margin-top: 4px; font-size: 0.88rem; color: var(--text-muted);">
                                            (${sanitize(examplePairs.map(p => p.en).filter(Boolean).join(' | '))})
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}

                        <!-- Accordion Toggles -->
                        <div class="accordion-toggles-row">
                            <button class="accordion-btn" id="btn-toggle-orig" data-action="toggle-orig">
                                🧠 ${this.showOrigins ? 'Hide Verb Origins & Prefix Logic' : 'View Verb Origins & Prefix Logic'}
                            </button>
                            <button class="accordion-btn" id="btn-toggle-conj" data-action="toggle-conj">
                                📊 ${this.showConjugations ? 'Hide Conjugation Tables' : 'View Conjugation Tables'}
                            </button>
                        </div>

                        ${originsHTML}
                        ${conjTableHTML}
                    </div>
                </div>
            </div>

            <!-- CARD CONTROLS -->
            <div class="verb-card-controls">
                <button class="fc-btn btn-learning" data-action="mark-learning">
                    ❌ Still Learning
                </button>
                <button class="fc-btn btn-known ${isKnown ? 'active' : ''}" data-action="mark-known">
                    ✅ Known
                </button>
            </div>

            <div class="verb-card-nav">
                <button class="btn" data-action="prev-card" ${this.currentIndex === 0 ? 'disabled' : ''}>◀ Prev</button>
                <span class="verb-counter-text">${this.currentIndex + 1} / ${activeQueue.length}</span>
                <button class="btn" data-action="next-card" ${this.currentIndex === activeQueue.length - 1 ? 'disabled' : ''}>Next ▶</button>
            </div>
        `;

        cardContainer.innerHTML = cardHTML;
    }

    flipCard() {
        this.isFlipped = !this.isFlipped;
        const card = document.querySelector('.verb-flashcard');
        if (card) {
            card.classList.toggle('flipped', this.isFlipped);
        }
    }

    toggleHint() {
        this.showHint = !this.showHint;
        const hintBox = document.querySelector('.verb-hint-box');
        const hintBtn = document.querySelector('[data-action="toggle-hint"]');
        if (hintBox) {
            hintBox.classList.toggle('hidden', !this.showHint);
        }
        if (hintBtn) {
            hintBtn.innerHTML = `💡 ${this.showHint ? 'Hide Hint' : 'Get a hint'}`;
        }
    }

    toggleConjugations() {
        this.showConjugations = !this.showConjugations;
        const block = document.querySelector('.conjugation-tables-block');
        const btn = document.querySelector('#btn-toggle-conj');
        if (block) {
            block.classList.toggle('hidden', !this.showConjugations);
        }
        if (btn) {
            btn.innerHTML = `📊 ${this.showConjugations ? 'Hide Conjugation Tables' : 'View Conjugation Tables'}`;
        }
    }

    toggleOrigins() {
        this.showOrigins = !this.showOrigins;
        const block = document.querySelector('.origins-block');
        const btn = document.querySelector('#btn-toggle-orig');
        if (block) {
            block.classList.toggle('hidden', !this.showOrigins);
        }
        if (btn) {
            btn.innerHTML = `🧠 ${this.showOrigins ? 'Hide Verb Origins & Prefix Logic' : 'View Verb Origins & Prefix Logic'}`;
        }
    }

    nextCard() {
        let activeQueue = this.queue;
        if (this.flashcardFavOnly) {
            activeQueue = this.queue.filter(w => this.isVerbFavorite(w));
        }

        if (this.currentIndex < activeQueue.length - 1) {
            this.currentIndex++;
            this.isFlipped = false;
            this.showHint = false;
            this.renderCard();
        }
    }

    prevCard() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.isFlipped = false;
            this.showHint = false;
            this.renderCard();
        }
    }

    markCard(known) {
        let activeQueue = this.queue;
        if (this.flashcardFavOnly) {
            activeQueue = this.queue.filter(w => this.isVerbFavorite(w));
        }

        const verb = activeQueue[this.currentIndex];
        if (!verb) return;

        const inf = (verb.infinitive || '').toLowerCase();
        const id = verb.id;

        if (known) {
            if (!this.userData.knownVerbIds.includes(id)) this.userData.knownVerbIds.push(id);
            if (!this.userData.knownVerbIds.includes(verb.infinitive)) this.userData.knownVerbIds.push(verb.infinitive);
            if (!this.userData.knownVerbIds.includes(inf)) this.userData.knownVerbIds.push(inf);
        } else {
            this.userData.knownVerbIds = this.userData.knownVerbIds.filter(x => x !== id && x !== verb.infinitive && x !== inf && x !== `v_${inf}`);

            if (this.queue.length > 1) {
                const qIdx = this.queue.findIndex(v => v.id === verb.id);
                if (qIdx > -1) {
                    const [unlearnedVerb] = this.queue.splice(qIdx, 1);
                    this.queue.push(unlearnedVerb);
                }
            }
        }

        const deckVerbs = this.queue;
        const allKnown = deckVerbs.every(v => this.isVerbKnown(v));
        if (allKnown && !(this.userData.finishedVerbDecks || []).includes(this.currentDeckId)) {
            if (!this.userData.finishedVerbDecks) this.userData.finishedVerbDecks = [];
            this.userData.finishedVerbDecks.push(this.currentDeckId);
        } else if (!allKnown && this.userData.finishedVerbDecks) {
            const dIdx = this.userData.finishedVerbDecks.indexOf(this.currentDeckId);
            if (dIdx > -1) {
                this.userData.finishedVerbDecks.splice(dIdx, 1);
            }
        }

        this._save();
        this.renderDeckTracker();
        this.updateOverallProgress();

        this.isFlipped = false;
        this.showHint = false;

        if (known) {
            if (this.currentIndex < activeQueue.length - 1) {
                this.nextCard();
            } else {
                this.renderCard();
            }
        } else {
            if (this.currentIndex >= activeQueue.length) {
                this.currentIndex = Math.max(0, activeQueue.length - 1);
            }
            this.renderCard();
        }
    }

    toggleFavorite(verbId) {
        let verb = this.queue.find(v => v.id === verbId);
        if (!verb) {
            const all = this.dataset ? this.dataset.decks.flatMap(d => d.verbs) : [];
            verb = all.find(v => v.id === verbId);
        }

        const targetId = verb ? verb.id : verbId;
        const inf = verb ? (verb.infinitive || '').toLowerCase() : '';

        const isFav = verb ? this.isVerbFavorite(verb) : (this.userData.verbFavorites || []).includes(verbId);

        if (!this.userData.verbFavorites) this.userData.verbFavorites = [];

        if (isFav) {
            this.userData.verbFavorites = this.userData.verbFavorites.filter(x => x !== targetId && x !== inf && x !== `v_${inf}`);
        } else {
            if (targetId) this.userData.verbFavorites.push(targetId);
            if (inf && !this.userData.verbFavorites.includes(inf)) this.userData.verbFavorites.push(inf);
        }

        this._save();
        this.renderCard();
        this.renderTable();
    }

    speakCurrentCard() {
        let activeQueue = this.queue;
        if (this.flashcardFavOnly) {
            activeQueue = this.queue.filter(w => this.isVerbFavorite(w));
        }

        const verb = activeQueue[this.currentIndex];
        if (verb) {
            speak(cleanTextForAudio(verb.infinitive), 'de');
        }
    }

    speakText(txt, lang = 'de') {
        speak(txt, lang);
    }

    switchMode(mode) {
        this.activeMode = mode;
        const glossaryView = document.getElementById('view-glossary');
        const flashcardView = document.getElementById('view-flashcard');

        if (mode === 'glossary') {
            if (glossaryView) glossaryView.classList.remove('hidden');
            if (flashcardView) flashcardView.classList.add('hidden');
        } else {
            if (glossaryView) glossaryView.classList.add('hidden');
            if (flashcardView) flashcardView.classList.remove('hidden');
        }
    }

    bindEvents() {
        const searchInput = document.getElementById('verbs-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const q = e.target.value.toLowerCase().trim();
                if (!q) {
                    this.loadDeck(this.currentDeckId);
                    return;
                }
                const allVerbs = this.dataset.decks.flatMap(d => d.verbs);
                const filtered = allVerbs.filter(v => 
                    v.infinitive.toLowerCase().includes(q) || 
                    v.meaning.toLowerCase().includes(q)
                );
                this.queue = filtered;
                this.currentIndex = 0;
                this.renderCard();
                this.renderTable();
                this.populateStartVerbDropdown();
            });
        }

        // Global Event Delegation
        document.body.addEventListener('click', (e) => {
            const deckCard = e.target.closest('[data-deck-id]');
            if (deckCard) {
                const deckId = parseInt(deckCard.dataset.deckId, 10);
                this.loadDeck(deckId);
                return;
            }

            const actionBtn = e.target.closest('[data-action]');
            if (!actionBtn) return;

            const action = actionBtn.dataset.action;
            e.stopPropagation();

            if (action === 'toggle-hint') this.toggleHint();
            else if (action === 'toggle-conj') this.toggleConjugations();
            else if (action === 'toggle-orig') this.toggleOrigins();
            else if (action === 'speak') this.speakCurrentCard();
            else if (action === 'speak-text') this.speakText(actionBtn.dataset.text, 'de');
            else if (action === 'play-from-row') {
                const rowIdx = parseInt(actionBtn.dataset.arrayIdx, 10) || 0;
                this.playAllVerbsAudio(rowIdx);
            }
            else if (action === 'fav') this.toggleFavorite(actionBtn.dataset.verbId);
            else if (action === 'mark-known') this.markCard(true);
            else if (action === 'mark-learning') this.markCard(false);
            else if (action === 'prev-card') this.prevCard();
            else if (action === 'next-card') this.nextCard();
            else if (action === 'flip') {
                if (!e.target.closest('button') && !e.target.closest('.accordion-btn') && !e.target.closest('.ex-en-chip') && !e.target.closest('.ex-sentence-span')) {
                    this.flipCard();
                }
            }
        });
    }
}

export const VerbsEngine = new VerbsEngineClass();
if (typeof window !== 'undefined') {
    window.verbsEngine = VerbsEngine;
}
