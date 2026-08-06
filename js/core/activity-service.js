// WP-040: ActivityService — GitHub-style learning streak & contribution tracker
// Tracks days where the user learned a new word (flashcards "Known" on a brand-new card)
// or listened to 15+ words (TTS fallback). Persisted in state.data.activity / state.data.ttsDaily.

import { getLocalDateString } from './srs-logic.js?v=3';

export const TTS_LISTEN_THRESHOLD = 15;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export class ActivityService {
    constructor({ state, onSave }) {
        this.state = state;
        this._onSave = onSave || (() => {});
    }

    // Flashcard: a completely new card was marked as Known → +1 new word learned today
    recordWordLearned() {
        const today = getLocalDateString();
        const data = this.state.data || {};
        data.activity = data.activity || {};
        data.activity[today] = (data.activity[today] || 0) + 1;
        this._onSave();
    }

    // TTS: one word listened. When the day reaches the threshold, the day counts as
    // "learned something new" (acts as a fallback when flashcards were not used).
    recordListen() {
        const today = getLocalDateString();
        const data = this.state.data || {};
        data.ttsDaily = data.ttsDaily || {};
        data.ttsDaily[today] = (data.ttsDaily[today] || 0) + 1;
        if (data.ttsDaily[today] >= TTS_LISTEN_THRESHOLD) {
            data.activity = data.activity || {};
            data.activity[today] = Math.max(data.activity[today] || 0, 1);
        }
        this._onSave();
    }

    _activeDays() {
        const activity = this.state.data?.activity || {};
        return Object.entries(activity)
            .filter(([, count]) => count >= 1)
            .map(([date]) => date)
            .sort();
    }

    // Current streak: consecutive active days ending today (or yesterday, so the streak
    // stays alive until the day ends — GitHub-style).
    getCurrentStreak() {
        const days = new Set(this._activeDays());
        if (days.size === 0) return 0;

        let cursor = new Date();
        if (!days.has(getLocalDateString(cursor))) {
            cursor.setDate(cursor.getDate() - 1);
        }

        let streak = 0;
        while (days.has(getLocalDateString(cursor))) {
            streak++;
            cursor.setDate(cursor.getDate() - 1);
        }
        return streak;
    }

    getBestStreak() {
        const days = this._activeDays();
        if (days.length === 0) return 0;

        let best = 1;
        let run = 1;
        for (let i = 1; i < days.length; i++) {
            const diffMs = new Date(days[i]) - new Date(days[i - 1]);
            if (Math.round(diffMs / 86400000) === 1) {
                run++;
            } else {
                run = 1;
            }
            best = Math.max(best, run);
        }
        return best;
    }

    getActiveDaysCount() {
        return this._activeDays().length;
    }

    getTodayCount() {
        return this.state.data?.activity?.[getLocalDateString()] || 0;
    }

    _levelFor(count) {
        if (count <= 0) return 0;
        if (count <= 2) return 1;
        if (count <= 5) return 2;
        if (count <= 9) return 3;
        return 4;
    }

    // Renders the GitHub-style contribution graph into #activity-graph and streak stats.
    render() {
        const container = document.getElementById('activity-graph');
        if (!container) return;

        const activity = this.state.data?.activity || {};
        const todayStr = getLocalDateString();

        // Grid: 53 columns (weeks), 7 rows (Mon..Sun), ending with the current week.
        const now = new Date();
        const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
        const lastColStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
        const firstColStart = new Date(lastColStart);
        firstColStart.setDate(firstColStart.getDate() - 52 * 7);

        // Month labels row (aligned with the grid columns)
        let monthsHtml = '<span class="act-month act-month-spacer"></span>';
        let prevMonth = -1;
        for (let c = 0; c < 53; c++) {
            const colDate = new Date(firstColStart);
            colDate.setDate(firstColStart.getDate() + c * 7);
            if (colDate.getMonth() !== prevMonth) {
                monthsHtml += `<span class="act-month" style="grid-column: ${c + 2}">${MONTH_NAMES[colDate.getMonth()]}</span>`;
                prevMonth = colDate.getMonth();
            }
        }

        // Weekday labels (Mon/Wed/Fri rows)
        const weekdayRows = ['Mon', '', 'Wed', '', 'Fri', '', ''];

        // Cells: column-major (week by week)
        let cellsHtml = '';
        for (let c = 0; c < 53; c++) {
            for (let r = 0; r < 7; r++) {
                const d = new Date(firstColStart);
                d.setDate(firstColStart.getDate() + c * 7 + r);
                const dateStr = getLocalDateString(d);
                const count = activity[dateStr] || 0;
                const level = this._levelFor(count);
                const title = count > 0
                    ? `${count} new word${count === 1 ? '' : 's'} on ${dateStr}`
                    : `No activity on ${dateStr}`;
                cellsHtml += `<div class="act-cell act-l${level}${dateStr === todayStr ? ' act-today' : ''}" title="${title}"></div>`;
            }
        }

        const legendLevels = [0, 1, 2, 3, 4].map(l => `<span class="act-cell act-l${l}"></span>`).join('');

        container.innerHTML = `
            <div class="act-months">${monthsHtml}</div>
            <div class="act-body">
                <div class="act-weekdays">${weekdayRows.map(w => `<span>${w}</span>`).join('')}</div>
                <div class="act-grid">${cellsHtml}</div>
            </div>
            <div class="act-legend">
                <span class="act-legend-label">Less</span>
                ${legendLevels}
                <span class="act-legend-label">More</span>
            </div>
        `;

        const setEl = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setEl('stat-streak-current', this.getCurrentStreak());
        setEl('stat-streak-best', this.getBestStreak());
        setEl('stat-active-days', this.getActiveDaysCount());
        setEl('stat-today-count', this.getTodayCount());
    }
}
