/**
 * VerbsEngine
 * Controller for the Top German Verbs Mastery module.
 * Provides full theme parity with level.html, default List/Glossary view,
 * Hide & Guess practice controls (Hide DE/EN/Mix/Examples/Reveal), TTS SpeechQueue,
 * Single-line example layout with individual sentence-click TTS pronunciation, single EN toggle chip per box,
 * 50-verb decks tracker, collapsible sidebar, Flashcard mode with Still Learning queue recycling & outline/filled star favorite toggles,
 * and Card Direction Mode (DE->EN, EN->DE, Audio->DE).
 */
import { speak, cleanTextForAudio, SpeechQueue } from './tts.js';
import { getLocalProgress, saveLocalProgress } from './storage.js';
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
        this.hiddenCols = new Set(); // 'de', 'en', 'mixed', 'ex'
        this.isSidebarCollapsed = false;
        this.typeFilter = 'all'; // 'all', 'fav', 'sep', 'irreg'
        this.appId = 'a1_app_data';
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
            const res = await fetch('content/generated/verbs/top_verbs_2000.json');
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            this.dataset = await res.json();

            this.renderDeckTracker();
            this.loadDeck(this.currentDeckId);
            this.bindEvents();
            this.updateOverallProgress();
            console.log(`✅ VerbsEngine initialized with ${this.dataset.totalVerbs} verbs across ${this.dataset.totalDecks} decks.`);
        } catch (e) {
            console.error('VerbsEngine initialization failed:', e);
            const container = document.getElementById('verbs-working-area');
            if (container) {
                container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">Failed to load verbs dataset. Please refresh.</div>`;
            }
        }
    }

    _save() {
        saveLocalProgress(this.appId, this.userData);
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
            if (sidebar) sidebar.classList.toggle('active');
            if (overlay) overlay.classList.toggle('active');
        }
    }

    setCardDirectionMode(mode) {
        this.cardDirectionMode = mode;
        this.isFlipped = false;
        this.showHint = false;
        this.renderCard();
    }

    updateOverallProgress() {
        if (!this.dataset) return;
        const total = this.dataset.totalVerbs;
        const knownCount = this.userData.knownVerbIds.length;
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

        const finishedCount = this.userData.finishedVerbDecks.length;
        if (summaryEl) {
            summaryEl.textContent = `${finishedCount} / ${this.dataset.totalDecks} Decks Finished`;
        }

        if (trackerContainer) {
            trackerContainer.innerHTML = this.dataset.decks.map(deck => {
                const isFinished = this.userData.finishedVerbDecks.includes(deck.deckId);
                const isActive = deck.deckId === this.currentDeckId;
                
                const knownInDeck = deck.verbs.filter(v => this.userData.knownVerbIds.includes(v.id)).length;
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

        return deParts.map((de, idx) => ({
            de: de,
            en: enParts[idx] || ''
        }));
    }

    // ── GLOSSARY / LIST VIEW ──
    setFilter(type) {
        this.typeFilter = type;
        this.renderTable();
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
            if (this.typeFilter === 'fav') return this.userData.verbFavorites.includes(w.id);
            if (this.typeFilter === 'sep') return w.prefixInfo.isSeparable;
            if (this.typeFilter === 'irreg') return w.tags.includes('irregular');
            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:2rem;">No verbs match your current filter</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(w => {
            const isKnown = this.userData.knownVerbIds.includes(w.id);
            const isFav = this.userData.verbFavorites.includes(w.id);

            const isMixed = this.hiddenCols.has('mixed');
            const hideDE = this.hiddenCols.has('de') || (isMixed && Math.random() > 0.5);
            const hideEN = this.hiddenCols.has('en') || (isMixed && !hideDE);
            const hideEX = this.hiddenCols.has('ex');

            const examplePairs = this._getExamplePairs(w);
            const hasEn = examplePairs.some(p => p.en);

            return `
                <tr data-id="${w.id}" class="${isKnown ? 'known-row' : ''}">
                    <td>
                        <div style="display:flex; align-items:center; gap: 8px;">
                            <span class="fav-icon-btn ${isFav ? 'active' : ''}" data-action="fav" data-verb-id="${w.id}" title="Toggle Favorite">${isFav ? '⭐' : '☆'}</span>
                            <button class="speak-btn" data-action="speak-text" data-text="${w.infinitive}" title="Listen to Verb">🔊</button>
                            <div style="flex:1;">
                                <span class="${hideDE ? 'hidden-word' : ''} hideable" style="cursor:pointer; font-weight:700;" onclick="this.classList.remove('hidden-word')" title="Click to reveal">${sanitize(w.infinitive)}</span>
                                <div class="${hideDE ? 'hidden-word' : ''} hideable" style="font-size:0.8rem; color:var(--text-muted); cursor:pointer;" onclick="this.classList.remove('hidden-word')" title="Click to reveal">${w.conjugation.present3rd}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="meaning-and-example-cell">
                            <div style="display:flex; align-items:center; gap: 8px;">
                                <span class="${hideEN ? 'hidden-word' : ''} hideable" style="cursor:pointer; font-weight: 600; font-size: 1.05rem;" onclick="this.classList.remove('hidden-word')" title="Click to reveal">${sanitize(w.meaning)}</span>
                                ${isKnown ? '<span style="color:var(--success);" title="Known">✓</span>' : ''}
                            </div>
                            
                            <!-- Inline Example Box (Original single-line layout, Click each sentence to pronounce) -->
                            ${examplePairs.length > 0 ? `
                                <div class="verb-inline-example-box">
                                    <div class="ex-de-line" style="display:flex; align-items:center; gap: 4px; flex-wrap: wrap;">
                                        💬 ${examplePairs.map((pair, idx) => {
                                            const safeDe = pair.de.replace(/"/g, '&quot;');
                                            return `
                                                <span class="${hideEX ? 'hidden-word' : ''} hideable ex-sentence-span" style="cursor:pointer;" onclick="if(this.classList.contains('hidden-word')){this.classList.remove('hidden-word');}else{window.verbsEngine.speakText('${safeDe}');}" title="Click sentence to pronounce">
                                                    ${sanitize(pair.de)}
                                                </span>
                                                ${idx < examplePairs.length - 1 ? '<span style="color:var(--text-muted); opacity:0.4; margin: 0 4px;">|</span>' : ''}
                                            `;
                                        }).join('')}
                                    </div>

                                    ${hasEn ? `
                                        <div style="margin-top: 6px;">
                                            <button class="ex-en-chip" onclick="event.stopPropagation(); this.closest('.verb-inline-example-box').querySelector('.ex-en-line').classList.toggle('hidden');" title="Toggle English Example Translations">
                                                🇺🇸 EN
                                            </button>
                                            <div class="ex-en-line hidden ${hideEN ? 'hidden-word' : ''} hideable" style="margin-top: 4px; font-size: 0.82rem; color: var(--text-muted); cursor:pointer;" onclick="this.classList.remove('hidden-word')">
                                                (${sanitize(examplePairs.map(p => p.en).filter(Boolean).join(' | '))})
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            ` : ''}
                        </div>
                    </td>
                    <td><span class="type-badge">${w.prefixInfo.prefix || 'Base'}</span></td>
                    <td>
                        <div style="font-size:0.85rem;"><strong>Participle:</strong> ${w.conjugation.participle}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted);"><strong>Aux:</strong> ${w.conjugation.auxiliary}</div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ── AUDIO QUEUE (SpeechQueue Integration) ──
    playAllVerbsAudio() {
        if (!this.queue || this.queue.length === 0) return;
        const btn = document.getElementById('btn-play-all-words');
        const pauseBtn = document.getElementById('btn-pause-words');
        if (btn) {
            btn.classList.add('playing');
            btn.innerHTML = '<span>🔊</span> Playing...';
        }
        if (pauseBtn) {
            pauseBtn.classList.remove('hidden');
        }

        const items = this.queue.map(v => ({ id: v.id, de: v.infinitive }));

        SpeechQueue.playAll(
            items,
            (idx, item) => {
                const tr = document.querySelector(`tr[data-id="${item.id}"]`);
                if (tr) {
                    tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    tr.classList.add('highlighted-speech');
                    setTimeout(() => tr.classList.remove('highlighted-speech'), 1500);
                }
            },
            () => {
                this.stopAudioQueue();
            }
        );
    }

    togglePauseAudio() {
        const pauseBtn = document.getElementById('btn-pause-words');
        if (!pauseBtn) return;
        if (SpeechQueue.isPlaying) {
            SpeechQueue.pause();
            pauseBtn.innerHTML = '<span>▶️</span> Resume';
        } else {
            SpeechQueue.resume();
            pauseBtn.innerHTML = '<span>⏸️</span> Pause';
        }
    }

    stopAudioQueue() {
        SpeechQueue.stop();
        const btn = document.getElementById('btn-play-all-words');
        const pauseBtn = document.getElementById('btn-pause-words');
        if (btn) {
            btn.classList.remove('playing');
            btn.innerHTML = '<span>▶️</span> Play All';
        }
        if (pauseBtn) {
            pauseBtn.classList.add('hidden');
        }
    }

    // ── FLASHCARD VIEW ──
    renderCard() {
        const cardContainer = document.getElementById('verbs-card-working-area');
        if (!cardContainer || this.queue.length === 0) return;

        const verb = this.queue[this.currentIndex];
        const isFav = this.userData.verbFavorites.includes(verb.id);
        const isKnown = this.userData.knownVerbIds.includes(verb.id);

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

        // Front Card Content based on cardDirectionMode
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
            // Default: 'de-to-en'
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
                <span class="verb-counter-text">${this.currentIndex + 1} / ${this.queue.length}</span>
                <button class="btn" data-action="next-card" ${this.currentIndex === this.queue.length - 1 ? 'disabled' : ''}>Next ▶</button>
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
        if (this.currentIndex < this.queue.length - 1) {
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
        const verb = this.queue[this.currentIndex];
        if (!verb) return;

        if (known) {
            if (!this.userData.knownVerbIds.includes(verb.id)) {
                this.userData.knownVerbIds.push(verb.id);
            }
        } else {
            // Remove from known if present
            const idx = this.userData.knownVerbIds.indexOf(verb.id);
            if (idx > -1) {
                this.userData.knownVerbIds.splice(idx, 1);
            }

            // Recycle unlearned verb to the END of the active queue
            if (this.queue.length > 1) {
                const [unlearnedVerb] = this.queue.splice(this.currentIndex, 1);
                this.queue.push(unlearnedVerb);
            }
        }

        // Check overall deck completion status
        const deckVerbs = this.queue;
        const allKnown = deckVerbs.every(v => this.userData.knownVerbIds.includes(v.id));
        if (allKnown && !this.userData.finishedVerbDecks.includes(this.currentDeckId)) {
            this.userData.finishedVerbDecks.push(this.currentDeckId);
        } else if (!allKnown) {
            const dIdx = this.userData.finishedVerbDecks.indexOf(this.currentDeckId);
            if (dIdx > -1) {
                this.userData.finishedVerbDecks.splice(dIdx, 1);
            }
        }

        this._save();
        this.renderDeckTracker();
        this.updateOverallProgress();

        // Always reset flip & hint state when moving to new card
        this.isFlipped = false;
        this.showHint = false;

        if (known) {
            if (this.currentIndex < this.queue.length - 1) {
                this.nextCard();
            } else {
                this.renderCard();
            }
        } else {
            // If we recycled the card to the end, the new card at current index is rendered directly
            if (this.currentIndex >= this.queue.length) {
                this.currentIndex = Math.max(0, this.queue.length - 1);
            }
            this.renderCard();
        }
    }

    toggleFavorite(verbId) {
        const idx = this.userData.verbFavorites.indexOf(verbId);
        if (idx > -1) {
            this.userData.verbFavorites.splice(idx, 1);
        } else {
            this.userData.verbFavorites.push(verbId);
        }
        this._save();
        this.renderCard();
        this.renderTable();
    }

    speakCurrentCard() {
        const verb = this.queue[this.currentIndex];
        if (verb) {
            speak(cleanTextForAudio(verb.infinitive));
        }
    }

    speakText(txt) {
        speak(cleanTextForAudio(txt));
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
            else if (action === 'speak-text') this.speakText(actionBtn.dataset.text);
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
