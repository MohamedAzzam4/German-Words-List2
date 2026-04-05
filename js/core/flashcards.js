export class FlashcardEngine {
    constructor(words, knownIds, favoritesIds, errors, onSave, onSessionComplete) {
        this.words = words || [];
        this.knownIds = knownIds || new Set();
        this.favoritesIds = favoritesIds || new Set();
        this.errors = errors || {};
        this.onSave = onSave || (() => { });
        this.onSessionComplete = onSessionComplete || (() => { });
        this.queue = [];
        this.index = 0;
        this.flipped = false;
        this.face = 'de'; // 'de' or 'en'
        this.filter = 'all'; // 'all' or 'learning'
        this.shuffle = false;
        this._buildQueue();
    }

    loadUnit(newWords) {
        this.words = newWords || [];
        this._buildQueue();
        this.index = 0;
        this.flipped = false;
        this.render();
    }

    _buildQueue() {
        if (this.filter === 'learning') {
            this.queue = this.words.filter(w => !this.knownIds.has(w.id));
        } else if (this.filter === 'favorites') {
            this.queue = this.words.filter(w => this.favoritesIds.has(w.id));
        } else {
            this.queue = [...this.words];
        }
        if (this.shuffle) this.queue.sort(() => Math.random() - 0.5);
    }

    setFilter(f) { this.filter = f; this._buildQueue(); this.index = 0; this.render(); }
    setFace(f) { this.face = f; this.flipped = false; this.render(); }
    toggleShuffle() { this.shuffle = !this.shuffle; this._buildQueue(); this.render(); }

    flip() {
        this.flipped = !this.flipped;
        const card = document.getElementById('active-flashcard');
        if (card) card.classList.toggle('flipped');
    }

    speak() {
        const w = this.queue[this.index];
        if (!w) return;
        window.app.speakText(this.face === 'de' ? w.de : w.en);
    }

    mark(known) {
        const w = this.queue[this.index];
        if (!w) return;
        if (known) {
            this.knownIds.add(w.id);
        } else {
            this.errors[w.id] = (this.errors[w.id] || 0) + 1;
            // Push to end for review
            this.queue.push(w);
        }
        this.onSave();
        this.next();
    }

    next() {
        if (this.index < this.queue.length - 1) {
            this.index++;
            this.flipped = false;
            this.render();
        } else {
            // Session complete — notify app.js to increment sessionsCompleted
            this.onSessionComplete();
            this.onSave();
            this._buildQueue(); // Refresh queue
            this.index = 0;
            this.flipped = false;
            this.render();
        }
    }

    prev() {
        if (this.index > 0) {
            this.index--;
            this.flipped = false;
            this.render();
        }
    }

    render() {
        const working = document.getElementById('fc-working-area');
        const empty = document.getElementById('fc-empty-state');
        const q = this.queue;

        if (q.length === 0) {
            if (working) working.classList.add('hidden');
            if (empty) empty.classList.remove('hidden');
            return;
        }
        if (working) working.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');

        const w = q[this.index];
        if (!w) return;

        const isDeFront = this.face === 'de';
        const typeEl = document.getElementById('fc-type');
        const deEl = document.getElementById('fc-de');
        const enEl = document.getElementById('fc-en');
        const exDeEl = document.getElementById('fc-ex-de');
        const exEnEl = document.getElementById('fc-ex-en');
        const counterEl = document.getElementById('fc-counter');
        const filterAllBtn = document.getElementById('filter-all-btn');
        const filterLearnBtn = document.getElementById('filter-learning-btn');
        const filterFavBtn = document.getElementById('filter-favorites-btn');
        const faceDeBtn = document.getElementById('face-de-btn');
        const faceEnBtn = document.getElementById('face-en-btn');
        const shuffleBtn = document.getElementById('shuffle-btn');
        const favBadge = document.getElementById('fc-fav-badge');

        if (typeEl) typeEl.textContent = w.type || 'Vocab';
        if (favBadge) {
            const isFav = this.favoritesIds.has(w.id);
            favBadge.style.filter = isFav ? 'grayscale(0)' : 'grayscale(100%)';
            favBadge.style.opacity = isFav ? '1' : '0.3';
        }
        
        const deHtml = `${w.de} ${w.deContext ? `<div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 5px;">${w.deContext}</div>` : ''}`;
        
        if (deEl) deEl.innerHTML = isDeFront ? deHtml : w.en;
        if (enEl) enEl.innerHTML = isDeFront ? w.en : deHtml;
        
        if (exDeEl) exDeEl.textContent = w.context ? w.de : '';
        if (exEnEl) exEnEl.textContent = w.context ? w.en : '';
        if (counterEl) counterEl.textContent = `${this.index + 1} / ${q.length}`;

        // Update filter button states
        if (filterAllBtn) filterAllBtn.classList.toggle('primary', this.filter === 'all');
        if (filterLearnBtn) filterLearnBtn.classList.toggle('primary', this.filter === 'learning');
        if (filterFavBtn) filterFavBtn.classList.toggle('primary', this.filter === 'favorites');
        if (faceDeBtn) faceDeBtn.classList.toggle('primary', this.face === 'de');
        if (faceEnBtn) faceEnBtn.classList.toggle('primary', this.face === 'en');
        if (shuffleBtn) shuffleBtn.textContent = `🔀 Shuffle: ${this.shuffle ? 'ON' : 'OFF'}`;

        // Reset flip state
        const card = document.getElementById('active-flashcard');
        if (card) {
            card.classList.remove('flipped');
            this.flipped = false;
        }
    }
}