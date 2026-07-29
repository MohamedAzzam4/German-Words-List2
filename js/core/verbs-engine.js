/**
 * VerbsEngine
 * Controller for the Top German Verbs Mastery page (50-Verb Decks).
 */
import { speak, cleanTextForAudio } from './tts.js';
import { getLocalProgress, saveLocalProgress } from './storage.js';

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
        this.activeMode = 'flashcard';
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
            const res = await fetch('content/generated/verbs/top_verbs_2000.json');
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            this.dataset = await res.json();
            
            this.renderDeckTracker();
            this.loadDeck(this.currentDeckId);
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

    _save() {
        saveLocalProgress(this.appId, this.userData);
    }

    loadDeck(deckId) {
        if (!this.dataset) return;
        const deck = this.dataset.decks.find(d => d.deckId === deckId);
        if (!deck) return;

        this.currentDeckId = deckId;
        this.queue = [...deck.verbs];
        this.currentIndex = 0;
        this.isFlipped = false;
        this.showHint = false;
        this.showConjugations = false;
        this.showOrigins = false;

        this.updateDeckHeader(deck);
        this.renderCard();
        this.renderTable();
        this.renderDeckTracker();
    }

    updateDeckHeader(deck) {
        const titleEl = document.getElementById('verbs-deck-title');
        if (titleEl) {
            titleEl.textContent = deck.title;
        }
        const counterEl = document.getElementById('verbs-deck-counter');
        if (counterEl) {
            counterEl.textContent = `Deck ${deck.deckId} of ${this.dataset.totalDecks}`;
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

        const cardHTML = `
            <div class="verb-flashcard ${this.isFlipped ? 'flipped' : ''}" data-action="flip">
                <div class="verb-card-inner">
                    <!-- FRONT OF CARD -->
                    <div class="verb-card-front">
                        <div class="verb-card-topbar">
                            <button class="hint-btn" data-action="toggle-hint" title="Get a hint">
                                💡 ${this.showHint ? 'Hide Hint' : 'Get a hint'}
                            </button>
                            <div class="topbar-right-btns">
                                <button class="speak-btn" data-action="speak" title="Speak Verb">🔊</button>
                                <button class="fav-btn ${isFav ? 'fav-active' : ''}" data-action="fav" data-verb-id="${verb.id}" title="Toggle Favorite">⭐</button>
                            </div>
                        </div>

                        <div class="verb-center-content">
                            <div class="verb-label">Verb</div>
                            <h2 class="verb-infinitive">${verb.infinitive}</h2>
                            <div class="verb-tags-container">${tagsHTML}</div>

                            <div class="verb-hint-box ${this.showHint ? '' : 'hidden'}">
                                <span>Hint / Meaning preview:</span> ${verb.meaning}
                            </div>
                        </div>

                        <div class="verb-tap-hint">Tap card to flip to back 🔄</div>
                    </div>

                    <!-- BACK OF CARD -->
                    <div class="verb-card-back">
                        <div class="verb-card-topbar">
                            <span class="back-accent-sparkles">✨✨✨✨✨✨✨✨✨✨</span>
                            <div class="topbar-right-btns">
                                <button class="speak-btn" data-action="speak" title="Speak Verb">🔊</button>
                                <button class="fav-btn ${isFav ? 'fav-active' : ''}" data-action="fav" data-verb-id="${verb.id}" title="Toggle Favorite">⭐</button>
                            </div>
                        </div>

                        <div class="verb-back-content">
                            <div class="back-main-row">
                                <div class="back-field"><span>Infinitive:</span> <strong>${verb.infinitive}</strong></div>
                                <div class="back-field meaning-field"><span>Meaning:</span> <strong style="color: var(--primary);">${verb.meaning}</strong></div>
                                ${verb.prefixInfo.prefix ? `<div class="back-field"><span>Prefix:</span> <strong>${verb.prefixInfo.prefix}</strong> (separable)</div>` : ''}
                                <div class="back-field"><span>Participle (Partizip II):</span> <strong>${conj.participle}</strong></div>
                                <div class="back-field"><span>Auxiliary:</span> <strong>${conj.auxiliary}</strong></div>
                            </div>

                            ${verb.example ? `
                                <div class="back-example-box">
                                    <div class="ex-label">Example Sentence / Phrase:</div>
                                    <div class="ex-text">${verb.example.replace(/\n/g, '<br>')}</div>
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

    renderTable() {
        const tbody = document.getElementById('verbs-table-tbody');
        if (!tbody || this.queue.length === 0) return;

        tbody.innerHTML = this.queue.map(verb => {
            const isFav = this.userData.verbFavorites.includes(verb.id);

            return `
                <tr data-id="${verb.id}">
                    <td>
                        <button class="speak-btn" data-action="speak-text" data-text="${verb.infinitive}" title="Speak">🔊</button>
                        <strong>${verb.infinitive}</strong>
                    </td>
                    <td>${verb.meaning}</td>
                    <td>${verb.prefixInfo.prefix || '-'}</td>
                    <td>${verb.conjugation.present3rd}</td>
                    <td>${verb.conjugation.past3rd}</td>
                    <td>${verb.conjugation.participle}</td>
                    <td>${verb.conjugation.auxiliary}</td>
                    <td>
                        <button class="fav-btn ${isFav ? 'fav-active' : ''}" data-action="fav" data-verb-id="${verb.id}">⭐</button>
                    </td>
                </tr>
            `;
        }).join('');
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
            const idx = this.userData.knownVerbIds.indexOf(verb.id);
            if (idx > -1) {
                this.userData.knownVerbIds.splice(idx, 1);
            }
        }

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

        if (known && this.currentIndex < this.queue.length - 1) {
            this.nextCard();
        } else {
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
        const flashcardArea = document.getElementById('verbs-card-mode-area');
        const tableArea = document.getElementById('verbs-table-mode-area');
        const btnFc = document.getElementById('verbs-btn-flashcards');
        const btnTbl = document.getElementById('verbs-btn-table');

        if (mode === 'flashcard') {
            if (flashcardArea) flashcardArea.classList.remove('hidden');
            if (tableArea) tableArea.classList.add('hidden');
            if (btnFc) btnFc.classList.add('primary');
            if (btnTbl) btnTbl.classList.remove('primary');
        } else {
            if (flashcardArea) flashcardArea.classList.add('hidden');
            if (tableArea) tableArea.classList.remove('hidden');
            if (btnFc) btnFc.classList.remove('primary');
            if (btnTbl) btnTbl.classList.add('primary');
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

        // Global Event Delegation for Cards & Tracker
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
                if (!e.target.closest('button') && !e.target.closest('.accordion-btn')) {
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
