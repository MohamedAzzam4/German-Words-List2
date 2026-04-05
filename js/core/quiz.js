export class QuizEngine {
    constructor(words, onUpdateScore) {
        this.words = words || [];
        this.onUpdateScore = onUpdateScore || (() => { });
        this.score = 0;
        this.total = 0;
        this.nouns = [];
        this.current = null;
        this.loadUnit(this.words);
    }

    loadUnit(newWords) {
        this.words = newWords || [];
        this.nouns = this.words.filter(w => /^(der|die|das)\s+/i.test(w.de));
        this._render();
    }

    _render() {
        const working = document.getElementById('quiz-working-area');
        const empty = document.getElementById('quiz-empty-state');

        if (this.nouns.length === 0) {
            if (working) working.classList.add('hidden');
            if (empty) empty.classList.remove('hidden');
            return;
        }
        if (working) working.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');

        this._loadQuestion();
    }

    _loadQuestion() {
        if (this.nouns.length === 0) return;
        this.current = this.nouns[Math.floor(Math.random() * this.nouns.length)];

        const meaningEl = document.getElementById('quiz-meaning');
        const wordEl = document.getElementById('quiz-de-word');

        if (meaningEl) meaningEl.textContent = this.current.en || '';
        if (wordEl) {
            // Remove article for display
            const withoutArticle = this.current.de.replace(/^(der|die|das)\s+/i, '').trim();
            wordEl.textContent = withoutArticle;
        }

        // Reset buttons
        document.querySelectorAll('.quiz-btn').forEach(btn => {
            btn.className = 'quiz-btn';
            btn.disabled = false;
        });
    }

    answer(chosen, btnEl) {
        if (!this.current || btnEl.disabled) return;

        const correct = this.current.de.match(/^(der|die|das)/i)?.[0].toLowerCase();
        const isCorrect = chosen.toLowerCase() === correct;

        // Disable all buttons
        document.querySelectorAll('.quiz-btn').forEach(b => b.disabled = true);

        if (isCorrect) {
            btnEl.classList.add('correct');
            this.score++;
            // Play success chime
            if (window.app?._showToast) {
                // Optional: subtle feedback
            }
        } else {
            btnEl.classList.add('wrong');
            // Highlight correct answer
            const correctBtn = Array.from(document.querySelectorAll('.quiz-btn'))
                .find(b => b.textContent.toLowerCase() === correct);
            if (correctBtn) correctBtn.classList.add('correct');
        }

        this.total++;
        if (this.onUpdateScore) this.onUpdateScore(this.score, this.total);

        // Next question after delay
        setTimeout(() => this._loadQuestion(), 1200);
    }
}