export const TROPHIES = [
    // Tier 1 - Progress & Mastery
    { id: 'first_steps', tier: 1, name: 'First Steps', desc: 'Learn your first 10 words', icon: '🏅', req: p => (p.known?.length || 0) >= 10 },
    { id: 'slay_vocab', tier: 1, name: 'Slay Vocabulary', desc: 'Mark 50 words as known', icon: '💅', req: p => (p.known?.length || 0) >= 50 },
    { id: 'vocab_vault', tier: 1, name: 'Vocabulary Vault', desc: 'Know 100 words', icon: '📚', req: p => (p.known?.length || 0) >= 100 },
    { id: 'walking_dict', tier: 1, name: 'Walking Dictionary', desc: 'Know 500 words', icon: '📖', req: p => (p.known?.length || 0) >= 500 },
    { id: 'bronze', tier: 1, name: 'Bronze Learner', desc: 'Learn 25% of all words', icon: '🥉', req: p => { const t = p.totalWords || 1; return ((p.known?.length || 0) / t) >= 0.25; } },
    { id: 'silver', tier: 1, name: 'Silver Learner', desc: 'Learn 50% of all words', icon: '🥈', req: p => { const t = p.totalWords || 1; return ((p.known?.length || 0) / t) >= 0.5; } },
    { id: 'gold', tier: 1, name: 'Gold Learner', desc: 'Learn 75% of all words', icon: '🥇', req: p => { const t = p.totalWords || 1; return ((p.known?.length || 0) / t) >= 0.75; } },
    { id: 'unit_master', tier: 1, name: 'Module Champion', desc: 'Get 100% in any single module', icon: '🎯', req: p => p.unitPerfect }, // Checked per-unit via app.js
    { id: 'a1_conqueror', tier: 1, name: 'A1 Conqueror', desc: 'Master all A1 words', icon: '👑', req: p => p.known?.length >= (p.totalWords || Infinity), levelOnly: 'a1' },
    { id: 'b2_boss', tier: 1, name: 'B2 Boss', desc: 'Complete 100% of all B2 modules', icon: '👑', req: p => p.known?.length >= (p.totalWords || Infinity), levelOnly: 'b2' },
    { id: 'verb_veteran', tier: 1, name: 'Verb Master', desc: 'Learn 30 verbs', icon: '🏃‍♂️', req: p => (p.known?.filter?.(w => w.type === 'v').length || 0) >= 30 },
    { id: 'noun_ninja', tier: 1, name: 'Noun Collector', desc: 'Learn 50 nouns', icon: '📦', req: p => (p.known?.filter?.(w => w.type === 'n').length || 0) >= 50 },
    { id: 'expression_expert', tier: 1, name: 'Chatterbox', desc: 'Learn 20 expressions', icon: '🗣️', req: p => (p.known?.filter?.(w => w.type === 'e').length || 0) >= 20 },
    { id: 'mode_explorer', tier: 1, name: 'Mode Explorer', desc: 'Use glossary and flashcard modes in one session', icon: '🔀', req: p => (p.modesUsed?.length || 0) >= 2 },
    { id: 'tts_titan', tier: 1, name: 'TTS Titan', desc: 'Use text-to-speech 100 times', icon: '🔊', req: p => (p.ttsCount || 0) >= 100 },

    // Tier 2 - Gen Z / Meme
    { id: 'bro_studied', tier: 2, name: 'Bro Actually Studied', desc: 'Complete your first flashcard session', icon: '😮‍💨', req: p => (p.sessionsCompleted || 0) >= 1, multi: true, milestones: [1, 5, 15, 30] },
    { id: 'skibidi_sprecher', tier: 2, name: 'Skibidi Sprecher', desc: 'Use text-to-speech 25 times', icon: '🗣️', req: p => (p.ttsCount || 0) >= 25 },
    { id: 'ohio_behavior', tier: 2, name: 'Ohio Behavior', desc: 'Hide columns 10 times in glossary mode', icon: '🙈', req: p => (p.columnHideCount || 0) >= 10 },
    { id: 'rizzed_up_dark_mode', tier: 2, name: 'Rizzed Up Dark Mode', desc: 'Switch to dark mode', icon: '🌚', req: p => (p.darkModeStudyMinutes || 0) >= 30 },
    { id: 'npc_arc', tier: 2, name: 'NPC Arc', desc: 'Get the same word wrong 10+ times', icon: '🤖', req: p => { const vals = Object.values(p.flashcardErrors || {}); return vals.length > 0 ? Math.max(...vals) >= 10 : false; } },
    { id: 'touch_grass', tier: 2, name: 'Touch Grass', desc: 'Accumulate 3+ hours of total study time', icon: '🌱', req: p => (p.totalStudyTimeMs || 0) >= 3 * 60 * 60 * 1000 },
    { id: 'academic_weapon', tier: 2, name: 'Academic Weapon', desc: 'Complete 25 flashcard sessions', icon: '🎓', req: p => (p.sessionsCompleted || 0) >= 25 },
    { id: 'brain_rot_activated', tier: 2, name: 'Brain Rot Activated', desc: 'Spend 30 min in flashcards in one sitting', icon: '🧠', req: p => (p.totalStudyTimeMs || 0) >= 30 * 60 * 1000 },
    { id: 'i_am_so_cooked', tier: 2, name: 'I Am So Cooked', desc: 'Fail the same card 5 times in one session', icon: '😵', req: p => { const vals = Object.values(p.flashcardErrors || {}); return vals.length > 0 ? Math.max(...vals) >= 5 : false; } },
    { id: 'on_fire', tier: 2, name: 'On Fire', desc: 'Review 50 words in one session', icon: '🔥', req: p => (p.sessionWordsReviewed || 0) >= 50, multi: true, milestones: [50, 100, 200] },

    // Tier 3 - Consistency & Streaks — WP-021: now using calcStreak with dedup
    { id: 'streak_3', tier: 3, name: 'Locked TF In', desc: '3-day study streak', icon: '🔒', req: p => calcStreak(p.studyDates || []) >= 3 },
    { id: 'streak_7', tier: 3, name: 'Creature of Habit', desc: '7-day study streak', icon: '🔗', req: p => calcStreak(p.studyDates || []) >= 7 },
    { id: 'streak_30', tier: 3, name: 'Dedicated Learner', desc: '30-day study streak', icon: '🧘', req: p => calcStreak(p.studyDates || []) >= 30 },
    { id: 'session_stacker', tier: 3, name: 'Session Stacker', desc: 'Complete 10 total sessions', icon: '📊', req: p => (p.sessionsCompleted || 0) >= 10, multi: true, milestones: [10, 25, 50] },

    // Tier 4 - Secret / Hidden
    { id: 'night_owl', tier: 4, name: 'Sigma Night Owl', desc: 'Study between 10 PM and 4 AM', icon: '🦉', req: p => { const h = new Date().getHours(); return h >= 22 || h < 4; }, secret: true },
    { id: 'early_bird', tier: 4, name: 'Early Bird', desc: 'Study before 8 AM', icon: '🌅', req: p => new Date().getHours() < 8, secret: true },
    { id: 'weekend_warrior', tier: 4, name: 'Weekend Warrior', desc: 'Study on a weekend', icon: '🏕️', req: p => { const d = new Date().getDay(); return d === 0 || d === 6; }, secret: true },
    { id: 'google_scholar', tier: 4, name: 'Google Scholar', desc: 'Sign in with Google', icon: '🌐', req: p => !!p.uid, secret: true },
    { id: 'chaotic_neutral', tier: 4, name: 'Chaotic Neutral', desc: 'Toggle dark mode 10 times', icon: '🌓', req: p => (p.darkModeToggleCount || 0) >= 10, secret: true },
    { id: 'were_so_back', tier: 4, name: "We're So Back", desc: 'Return after 7+ days away', icon: '🔄', req: p => !!p.returnedAfter7Days, secret: true },
    {
        id: 'portal_walker', tier: 4, name: 'Portal Walker', desc: 'Have progress in at least 2 levels', icon: '🚶', req: async () => {
            // Cross-level check: requires firebase getDoc from other level
            return false; // Placeholder - app.js handles cross-level logic
        }, secret: true, crossLevel: true
    }
];

// WP-041: Trophy shelf for the verbs module — reuses TrophyEngine + calcStreak.
// Progress shape used by these reqs: { knownVerbIds, finishedVerbDecks, studyDates, ttsCount }
export const VERB_TROPHIES = [
    // Tier 1 - Progress & Mastery
    { id: 'verb_first_steps', tier: 1, name: 'First Steps', desc: 'Learn your first 10 verbs', icon: '🏅', req: p => (p.knownVerbIds?.length || 0) >= 10 },
    { id: 'verb_slayer', tier: 1, name: 'Verb Slayer', desc: 'Mark 50 verbs as known', icon: '💅', req: p => (p.knownVerbIds?.length || 0) >= 50 },
    { id: 'verb_vault', tier: 1, name: 'Verb Vault', desc: 'Know 100 verbs', icon: '📚', req: p => (p.knownVerbIds?.length || 0) >= 100 },
    { id: 'verb_walking_dict', tier: 1, name: 'Walking Dictionary', desc: 'Know 500 verbs', icon: '📖', req: p => (p.knownVerbIds?.length || 0) >= 500 },
    { id: 'verb_bronze', tier: 1, name: 'Bronze Deck Learner', desc: 'Learn 25% of all verbs', icon: '🥉', req: p => { const t = p.totalWords || 1; return ((p.knownVerbIds?.length || 0) / t) >= 0.25; } },
    { id: 'verb_silver', tier: 1, name: 'Silver Deck Learner', desc: 'Learn 50% of all verbs', icon: '🥈', req: p => { const t = p.totalWords || 1; return ((p.knownVerbIds?.length || 0) / t) >= 0.5; } },
    { id: 'verb_gold', tier: 1, name: 'Gold Deck Learner', desc: 'Learn 75% of all verbs', icon: '🥇', req: p => { const t = p.totalWords || 1; return ((p.knownVerbIds?.length || 0) / t) >= 0.75; } },
    { id: 'verb_deck_master', tier: 1, name: 'Deck Champion', desc: 'Finish any single 50-verb deck', icon: '🎯', req: p => (p.finishedVerbDecks?.length || 0) >= 1 },
    { id: 'verb_5_decks', tier: 1, name: 'Deck Collector', desc: 'Finish 5 verb decks', icon: '🗂️', req: p => (p.finishedVerbDecks?.length || 0) >= 5 },
    { id: 'verb_10_decks', tier: 1, name: 'Deck Hoarder', desc: 'Finish 10 verb decks', icon: '📦', req: p => (p.finishedVerbDecks?.length || 0) >= 10 },
    { id: 'verb_all_decks', tier: 1, name: 'Verbs Conqueror', desc: 'Master all 36 verb decks', icon: '👑', req: p => (p.finishedVerbDecks?.length || 0) >= 36 },

    // Tier 2 - Gen Z / Meme
    { id: 'verb_speaker_100', tier: 2, name: 'TTS Titan', desc: 'Use text-to-speech 100 times', icon: '🔊', req: p => (p.ttsCount || 0) >= 100 },
    { id: 'verb_skibidi', tier: 2, name: 'Skibidi Sprecher', desc: 'Use text-to-speech 25 times', icon: '🗣️', req: p => (p.ttsCount || 0) >= 25 },
    { id: 'verb_npc', tier: 2, name: 'NPC Arc', desc: 'Get the same verb wrong 10+ times', icon: '🤖', req: p => { const vals = Object.values(p.flashcardErrors || {}); return vals.length > 0 ? Math.max(...vals) >= 10 : false; } },
    { id: 'verb_brain_rot', tier: 2, name: 'Brain Rot Activated', desc: 'Spend 30 min studying verbs', icon: '🧠', req: p => (p.totalStudyTimeMs || 0) >= 30 * 60 * 1000 },
    { id: 'verb_rizzed_dark', tier: 2, name: 'Rizzed Up Dark Mode', desc: 'Study 30 min in dark mode', icon: '🌚', req: p => (p.darkModeStudyMinutes || 0) >= 30 },

    // Tier 3 - Consistency & Streaks
    { id: 'verb_streak_3', tier: 3, name: 'Locked TF In', desc: '3-day study streak', icon: '🔒', req: p => calcStreak(p.studyDates || []) >= 3 },
    { id: 'verb_streak_7', tier: 3, name: 'Creature of Habit', desc: '7-day study streak', icon: '🔗', req: p => calcStreak(p.studyDates || []) >= 7 },
    { id: 'verb_streak_30', tier: 3, name: 'Dedicated Learner', desc: '30-day study streak', icon: '🧘', req: p => calcStreak(p.studyDates || []) >= 30 },

    // Tier 4 - Secret / Hidden
    { id: 'verb_night_owl', tier: 4, name: 'Sigma Night Owl', desc: 'Study between 10 PM and 4 AM', icon: '🦉', req: p => { const h = new Date().getHours(); return h >= 22 || h < 4; }, secret: true },
    { id: 'verb_early_bird', tier: 4, name: 'Early Bird', desc: 'Study before 8 AM', icon: '🌅', req: p => new Date().getHours() < 8, secret: true },
    { id: 'verb_weekend_warrior', tier: 4, name: 'Weekend Warrior', desc: 'Study on a weekend', icon: '🏕️', req: p => { const d = new Date().getDay(); return d === 0 || d === 6; }, secret: true }
];

// WP-021: Calculate study streak from dates, handling duplicates
export function calcStreak(dates) {
    if (!dates || dates.length === 0) return 0;

    // Deduplicate and sort descending (most recent first)
    const uniqueDates = [...new Set(dates)].sort().reverse();

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Streak must include today or yesterday to be active
    if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0;

    let streak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
        const current = new Date(uniqueDates[i - 1]);
        const prev = new Date(uniqueDates[i]);
        const diffDays = Math.round((current - prev) / 86400000);
        if (diffDays === 1) {
            streak++;
        } else {
            break; // Gap breaks the streak
        }
    }
    return streak;
}

export class TrophyEngine {
    constructor(containerId, userData, appId, onAward, trophies = TROPHIES) {
        this.container = document.getElementById(containerId);
        this.userData = userData || {};
        this.appId = appId;
        this.onAward = onAward || (() => { });
        this.trophies = trophies;
        this.trophyCounts = this.userData.trophyCounts || {};
        this.render();
    }

    render() {
        if (!this.container) return;

        let html = '';
        // Group by tier
        for (let tier = 1; tier <= 4; tier++) {
            const tierTrophies = this.trophies.filter(t => t.tier === tier);
            if (tierTrophies.length === 0) continue;

            html += `<div class="tier-header">Tier ${tier} ${['Progress', 'Meme', 'Streaks', 'Secret'][tier - 1]}</div>`;

            tierTrophies.forEach(t => {
                const count = this.trophyCounts[t.id] || 0;
                const earned = count > 0;
                const isSecret = t.secret && !earned;

                html += `
          <div class="trophy-card ${earned ? 'earned' : ''} ${isSecret ? 'secret-locked' : ''}" data-id="${t.id}">
            <div class="trophy-icon">${isSecret ? '🔒' : t.icon}</div>
            <div class="trophy-title">${isSecret ? '???' : t.name}</div>
            <div class="trophy-desc">${isSecret ? 'Keep studying...' : t.desc}</div>
            ${count > 1 ? `<div class="trophy-badge">x${count}</div>` : ''}
          </div>
        `;
            });
        }
        this.container.innerHTML = html;
    }

    async evaluate(progress, words = []) {
        const newlyEarned = [];

        // WP-032: Compute unitPerfect for unit_master trophy
        const knownIds = new Set(progress.known || []);
        // Group words by unit (word IDs like "1-0" → unit 1)
        const unitMap = {};
        for (const w of words) {
            const unitKey = typeof w.id === 'string' ? w.id.split('-')[0] : Math.floor(w.id / 100);
            if (!unitMap[unitKey]) unitMap[unitKey] = { total: 0, known: 0 };
            unitMap[unitKey].total++;
            if (knownIds.has(w.id)) unitMap[unitKey].known++;
        }
        const unitPerfect = Object.values(unitMap).some(u => u.total > 0 && u.known >= u.total);

        for (const t of this.trophies) {
            // Skip level-specific trophies
            if (t.levelOnly && t.levelOnly !== this.appId.replace('german-', '').replace('-app', '')) continue;

            // Skip cross-level for now (handled by app.js)
            if (t.crossLevel) continue;

            // Check requirement
            let met = false;
            try {
                met = t.req({ ...progress, totalWords: words.length, known: words.filter(w => progress.known?.includes(w.id)), unitPerfect });
            } catch { met = false; }

            if (met) {
                const currentCount = this.trophyCounts[t.id] || 0;
                if (t.multi && t.milestones) {
                    // Multi-earn with milestones: count = number of milestones achieved
                    // Count how many milestones are reached
                    let reachedMilestones = 0;
                    for (const m of t.milestones) {
                        if (t.req({ ...progress, totalWords: words.length, known: words.filter(w => progress.known?.includes(w.id)) })) {
                            // The req is already met (we're inside the `if (met)` block)
                            // Check which milestone level we're at by the metric value
                            reachedMilestones++;
                        }
                    }
                    // Determine the correct milestone count based on the actual progress value
                    // For session-based milestones, check sessionsCompleted directly
                    let newCount = 0;
                    if (t.id === 'bro_studied' || t.id === 'session_stacker') {
                        const val = progress.sessionsCompleted || 0;
                        for (const m of t.milestones) {
                            if (val >= m) newCount++; else break;
                        }
                    } else if (t.id === 'on_fire') {
                        const val = progress.sessionWordsReviewed || 0;
                        for (const m of t.milestones) {
                            if (val >= m) newCount++; else break;
                        }
                    } else {
                        newCount = currentCount || 1;
                    }
                    if (newCount > currentCount) {
                        this.trophyCounts[t.id] = newCount;
                        if (currentCount === 0) newlyEarned.push(t);
                    }
                } else if (t.multi) {
                    // Multi-earn without milestones: simple increment on each evaluate
                    if (currentCount === 0) {
                        this.trophyCounts[t.id] = 1;
                        newlyEarned.push(t);
                    }
                } else {
                    // Single-earn: trophy can only be earned once
                    if (currentCount === 0) {
                        this.trophyCounts[t.id] = 1;
                        newlyEarned.push(t);
                    }
                }
            }
        }

        if (newlyEarned.length > 0) {
            this.render();
            for (const t of newlyEarned) {
                this.onAward(`${t.name}${t.count ? ` x${t.count}` : ''}`);
            }
        }

        return newlyEarned;
    }
}