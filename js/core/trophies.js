export const TROPHIES = [
    // Tier 1 - Progress & Mastery
    { id: 'first_steps', tier: 1, name: 'First Steps', desc: 'Learn your first 10 words', icon: '🏅', req: p => (p.known?.length || 0) >= 10 },
    { id: 'slay_vocab', tier: 1, name: 'Slay Vocabulary', desc: 'Mark 50 words as known', icon: '💅', req: p => (p.known?.length || 0) >= 50 },
    { id: 'vocab_vault', tier: 1, name: 'Vocabulary Vault', desc: 'Know 100 words', icon: '📚', req: p => (p.known?.length || 0) >= 100 },
    { id: 'walking_dict', tier: 1, name: 'Walking Dictionary', desc: 'Know 500 words', icon: '📖', req: p => (p.known?.length || 0) >= 500 },
    { id: 'bronze', tier: 1, name: 'Bronze Learner', desc: 'Learn 25% of all words', icon: '🥉', req: p => { const t = p.totalWords || 1; return ((p.known?.length || 0) / t) >= 0.25; } },
    { id: 'silver', tier: 1, name: 'Silver Learner', desc: 'Learn 50% of all words', icon: '🥈', req: p => { const t = p.totalWords || 1; return ((p.known?.length || 0) / t) >= 0.5; } },
    { id: 'gold', tier: 1, name: 'Gold Learner', desc: 'Learn 75% of all words', icon: '🥇', req: p => { const t = p.totalWords || 1; return ((p.known?.length || 0) / t) >= 0.75; } },
    { id: 'unit_master', tier: 1, name: 'Module Champion', desc: 'Get 100% in any single module', icon: '🎯', req: p => false }, // Checked per-unit
    { id: 'a1_conqueror', tier: 1, name: 'A1 Conqueror', desc: 'Master all A1 words', icon: '👑', req: p => false, levelOnly: 'a1' },
    { id: 'b2_boss', tier: 1, name: 'B2 Boss', desc: 'Complete 100% of all B2 modules', icon: '👑', req: p => false, levelOnly: 'b2' },
    { id: 'verb_veteran', tier: 1, name: 'Verb Master', desc: 'Learn 30 verbs', icon: '🏃‍♂️', req: p => (p.known?.filter?.(w => w.type === 'v').length || 0) >= 30 },
    { id: 'noun_ninja', tier: 1, name: 'Noun Collector', desc: 'Learn 50 nouns', icon: '📦', req: p => (p.known?.filter?.(w => w.type === 'n').length || 0) >= 50 },
    { id: 'expression_expert', tier: 1, name: 'Chatterbox', desc: 'Learn 20 expressions', icon: '🗣️', req: p => (p.known?.filter?.(w => w.type === 'e').length || 0) >= 20 },
    { id: 'mode_explorer', tier: 1, name: 'Mode Explorer', desc: 'Use glossary and flashcard modes in one session', icon: '🔀', req: p => (p.modesUsed?.length || 0) >= 3 },
    { id: 'tts_titan', tier: 1, name: 'TTS Titan', desc: 'Use text-to-speech 100 times', icon: '🔊', req: p => (p.ttsCount || 0) >= 100 },

    // Tier 2 - Gen Z / Meme
    { id: 'bro_studied', tier: 2, name: 'Bro Actually Studied', desc: 'Complete your first flashcard session', icon: '😮‍💨', req: p => (p.sessionsCompleted || 0) >= 5, multi: true },
    { id: 'skibidi_sprecher', tier: 2, name: 'Skibidi Sprecher', desc: 'Use text-to-speech 25 times', icon: '🗣️', req: p => (p.quizCorrect || 0) >= 10 },
    { id: 'ohio_behavior', tier: 2, name: 'Ohio Behavior', desc: 'Hide columns 10 times in glossary mode', icon: '🙈', req: p => false }, // Tracked via streak
    { id: 'rizzed_up_dark_mode', tier: 2, name: 'Rizzed Up Dark Mode', desc: 'Switch to dark mode', icon: '🌚', req: p => (p.darkModeStudyMinutes || 0) >= 30 },
    { id: 'npc_arc', tier: 2, name: 'NPC Arc', desc: 'Get the same word wrong 10+ times', icon: '🤖', req: p => false }, // Streak logic
    { id: 'touch_grass', tier: 2, name: 'Touch Grass', desc: 'Accumulate 3+ hours of total study time', icon: '🌱', req: p => false }, // Gap detection
    { id: 'academic_weapon', tier: 2, name: 'Academic Weapon', desc: 'Complete 25 flashcard sessions', icon: '🎓', req: p => (p.sessionKnown || 0) >= 100 },
    { id: 'brain_rot_activated', tier: 2, name: 'Brain Rot Activated', desc: 'Spend 30 min in flashcards in one sitting', icon: '🧠', req: p => Object.values(p.flashcardErrors || {}).reduce((a, b) => a + b, 0) >= 50 },
    { id: 'i_am_so_cooked', tier: 2, name: 'I Am So Cooked', desc: 'Fail the same card 5 times in one session', icon: '😵', req: p => false }, // Streak
    { id: 'on_fire', tier: 2, name: 'On Fire', desc: 'Review 50 words in one session', icon: '🔥', req: p => false, multi: true }, // Streak-based

    // Tier 3 - Consistency & Streaks
    { id: 'streak_3', tier: 3, name: 'Locked TF In', desc: '3-day study streak', icon: '🔒', req: p => false }, // Date array logic
    { id: 'streak_7', tier: 3, name: 'Creature of Habit', desc: '7-day study streak', icon: '🔗', req: p => false },
    { id: 'streak_30', tier: 3, name: 'Dedicated Learner', desc: '30-day study streak', icon: '🧘', req: p => false },
    { id: 'session_stacker', tier: 3, name: 'Session Stacker', desc: 'Complete 10 total sessions', icon: '📊', req: p => (p.sessionsCompleted || 0) >= 20, multi: true },

    // Tier 4 - Secret / Hidden
    { id: 'night_owl', tier: 4, name: 'Sigma Night Owl', desc: 'Study between 10 PM and 4 AM', icon: '🦉', req: p => false, secret: true },
    { id: 'early_bird', tier: 4, name: 'Early Bird', desc: 'Study before 8 AM', icon: '🌅', req: p => false, secret: true },
    { id: 'weekend_warrior', tier: 4, name: 'Weekend Warrior', desc: 'Study on a weekend', icon: '🏕️', req: p => false, secret: true },
    { id: 'google_scholar', tier: 4, name: 'Google Scholar', desc: 'Sign in with Google', icon: '🌐', req: p => !!p.uid, secret: true },
    { id: 'chaotic_neutral', tier: 4, name: 'Chaotic Neutral', desc: 'Toggle dark mode 10 times', icon: '🌓', req: p => false, secret: true },
    { id: 'were_so_back', tier: 4, name: "We're So Back", desc: 'Return after 7+ days away', icon: '🔄', req: p => false, secret: true },
    {
        id: 'portal_walker', tier: 4, name: 'Portal Walker', desc: 'Have progress in at least 2 levels', icon: '🚶', req: async () => {
            // Cross-level check: requires firebase getDoc from other level
            return false; // Placeholder - app.js handles cross-level logic
        }, secret: true, crossLevel: true
    }
];

export class TrophyEngine {
    constructor(containerId, userData, appId, onAward) {
        this.container = document.getElementById(containerId);
        this.userData = userData || {};
        this.appId = appId;
        this.onAward = onAward || (() => { });
        this.trophyCounts = this.userData.trophyCounts || {};
        this.render();
    }

    render() {
        if (!this.container) return;

        let html = '';
        // Group by tier
        for (let tier = 1; tier <= 4; tier++) {
            const tierTrophies = TROPHIES.filter(t => t.tier === tier);
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

        for (const t of TROPHIES) {
            // Skip level-specific trophies
            if (t.levelOnly && t.levelOnly !== this.appId.replace('german-', '').replace('-app', '')) continue;

            // Skip cross-level for now (handled by app.js)
            if (t.crossLevel) continue;

            // Check requirement
            let met = false;
            try {
                met = t.req({ ...progress, totalWords: words.length, known: words.filter(w => progress.known?.includes(w.id)) });
            } catch { met = false; }

            if (met) {
                const currentCount = this.trophyCounts[t.id] || 0;
                // Multi-earn is disabled — every trophy is earned at most once
                if (currentCount === 0) {
                    this.trophyCounts[t.id] = 1;
                    newlyEarned.push(t);
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