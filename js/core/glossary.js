export class GlossaryEngine {
    constructor(tbodyId, words, knownIds, favoritesIds, onSpeak) {
        this.tbody = document.getElementById(tbodyId);
        this.words = words || [];
        this.knownIds = knownIds || new Set();
        this.favoritesIds = favoritesIds || new Set();
        this.onSpeak = onSpeak || (() => { });
        this.hiddenCols = new Set();
        this.typeFilter = 'all';
        this.render();
    }

    loadUnit(newWords) {
        this.words = newWords || [];
        this.render();
    }

    setFilter(type) {
        this.typeFilter = type;
        this.render();
    }

    toggleColumn(col) {
        const wasHidden = this.hiddenCols.has(col);
        this.hiddenCols.clear();
        if (!wasHidden) {
            this.hiddenCols.add(col);
        }
        this.render();
    }

    revealAll() {
        this.hiddenCols.clear();
        this.render();
    }

    speakAll() {
        const visible = Array.from(this.tbody.querySelectorAll('tr'))
            .filter(tr => !tr.classList.contains('hidden'))
            .map(tr => tr.querySelector('.hideable:not(.hidden-word)')?.textContent.trim())
            .filter(Boolean);
        visible.forEach((text, i) => {
            setTimeout(() => this.onSpeak(text), i * 800);
        });
    }

    render() {
        const filtered = this.words.filter(w => {
            if (this.typeFilter === 'fav') return this.favoritesIds.has(w.id);
            return this.typeFilter === 'all' || w.type?.toLowerCase() === this.typeFilter.toLowerCase();
        });

        if (filtered.length === 0) {
            this.tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem;">No words match your current filter</td></tr>`;
            return;
        }

        this.tbody.innerHTML = filtered.map(w => {
            const isKnown = this.knownIds.has(w.id);
            const isFav = this.favoritesIds.has(w.id);
            const article = w.de?.match(/^(der|die|das)/i)?.[0] || '';
            const wordOnly = w.de?.replace(/^(der|die|das)\s*/i, '').trim() || w.de;
            const safeDe = (w.de || '').replace(/'/g, "\\'");

            // Compute per-row hide state (supports 'mixed' mode)
            const isMixed = this.hiddenCols.has('mixed');
            const hideDE = this.hiddenCols.has('de') || (isMixed && Math.random() > 0.5);
            const hideEN = this.hiddenCols.has('en') || (isMixed && !hideDE);
            const hideArticle = this.hiddenCols.has('article') || hideDE;

            return `
        <tr data-id="${w.id}" class="${isKnown ? 'known-row' : ''}">
          <td style="display:flex; align-items:center; gap: 8px;">
            <span onclick="window.app.toggleFavorite(${w.id})" title="Toggle Favorite" style="cursor:pointer; font-size: 1.25rem; filter: grayscale(${isFav ? '0' : '100%'}); opacity: ${isFav ? '1' : '0.25'}; transition: 0.2s;">⭐</span>
            <button class="speak-btn" onclick="event.stopPropagation(); window.app.speakText('${safeDe}')" title="Listen" style="margin-right: 5px;">🔊</button>
            <div style="flex: 1;">
                <span class="${hideArticle ? 'hidden-word' : ''} hideable" style="cursor: pointer;" onclick="this.classList.toggle('hidden-word')" title="Click to reveal/hide">${article ? article + ' ' : ''}</span>
                <span class="${hideDE ? 'hidden-word' : ''} hideable" style="cursor: pointer;" onclick="this.classList.toggle('hidden-word')" title="Click to reveal/hide">${wordOnly}</span>
                ${w.deContext ? `<div class="de-context hideable ${hideDE ? 'hidden-word' : ''}" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px; cursor: pointer;" onclick="this.classList.toggle('hidden-word')" title="Click to reveal/hide">${w.deContext}</div>` : ''}
            </div>
          </td>
          <td>
            <span class="${hideEN ? 'hidden-word' : ''} hideable" style="cursor: pointer;" onclick="this.classList.toggle('hidden-word')" title="Click to reveal/hide">${w.en || '-'}</span>
            ${isKnown ? '<span style="color:var(--success);margin-left:8px;font-weight:bold;">✅</span>' : ''}
          </td>
          <td><span class="type-badge">${w.type || 'Vocab'}</span></td>
          <td>
            ${w.context
                    ? `<button class="example-toggle" onclick="this.nextElementSibling.classList.toggle('hidden')">Show Example</button>
             <div class="example-box hidden">${w.context}</div>`
                    : '<span style="color:var(--text-muted)">-</span>'}
          </td>
        </tr>
      `;
        }).join('');
    }
}