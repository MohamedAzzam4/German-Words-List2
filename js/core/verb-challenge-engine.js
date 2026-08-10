/**
 * VerbChallengeEngine
 * Pure adaptive scheduling engine for the Guided Challenge workflow.
 *
 * Deliberately independent from DOM / Firebase / LocalStorage / audio / CSS.
 * It accepts deck/session data and returns deterministic next-card models and
 * pure state transitions so it can be unit tested in isolation.
 *
 * Phases:
 *   acquisition  → hidden rolling pool, introduce → recall, then phase pivot.
 *   recognition  → German verb → recall English meaning (first official win).
 *   production   → English meaning → recall German infinitive (optional 2nd win).
 *
 * The same drill machine is reused for daily long-term SRS due reviews.
 */

function localDateString(dateObj = new Date()) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export const ACTIVE_POOL_SIZE = 8;
export const FAST_RECALL_MS = 4000;

// Named constant turn gaps. A card scheduled at gap `g` (dueTurn = turn+1+g)
// will be presented after approximately `g` other card presentations.
export const INTRO_TO_RECALL_GAP = 2;       // first acquisition recall after introduction
export const ACQUISITION_RETRY_GAP = 2;     // acquisition recall after a Forgot
export const SLOW_RECALL_GAP = 8;           // slow Remembered → retry after ~8 cards
export const FORGOT_FIRST_RECOVERY_GAP = 3; // first recovery attempt after a Forgot
export const RECOVERY_RETRY_GAP = 8;        // between recovery attempts
export const RECOVERY_FAST_COUNT = 2;       // fast recalls required to pass after a Forgot

export const PHASE_ACQUISITION = 'acquisition';
export const PHASE_RECOGNITION = 'recognition';
export const PHASE_PRODUCTION = 'production';
export const PHASE_REVIEW = 'review';
export const PHASE_COMPLETE = 'complete';

function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export class VerbChallengeEngine {
    constructor({ rng = Math.random } = {}) {
        this._rng = rng;
    }

    // ── session factories ──

    /**
     * Create a fresh learning session for a whole deck.
     * @param {{deckId: number, verbIds: string[], date?: string}} params
     */
    createLearningSession({ deckId, verbIds, date = localDateString() }) {
        const session = {
            sessionType: 'learning',
            deckId,
            date,
            phase: PHASE_ACQUISITION,
            turn: 0,
            activePoolIds: [],
            poolCursor: 0,
            orderIds: [...verbIds],
            phaseOrder: [],
            cardStateById: {},
            updatedAt: Date.now()
        };
        this._initAcquisition(session, verbIds);
        return session;
    }

    /**
     * Create a review session for a set of due review items.
     * Recognition items always come before production items so a review can
     * never open in Production while any Recognition cards are still due.
     * The order within each track is preserved.
     * @param {{deckId: number, items: [{verbId: string, track: string}], date?: string}} params
     */
    createReviewSession({ deckId, items, date = localDateString() }) {
        const normalized = items
            .map(i => ({ verbId: i.verbId, track: i.track }))
            .sort((a, b) => (a.track === PHASE_RECOGNITION ? 0 : 1) - (b.track === PHASE_RECOGNITION ? 0 : 1));
        return {
            sessionType: 'review',
            reviewItems: normalized,
            completedTracks: [],
            deckId,
            date,
            phase: PHASE_REVIEW,
            turn: 0,
            activePoolIds: [],
            poolCursor: 0,
            orderIds: normalized.map(i => i.verbId),
            phaseOrder: [],
            cardStateById: {},
            updatedAt: Date.now()
        };
    }

    _initAcquisition(session, verbIds) {
        session.phase = PHASE_ACQUISITION;
        session.turn = 0;
        session.phaseOrder = verbIds.slice(); // natural deck order for acquisition
        const poolSize = Math.min(ACTIVE_POOL_SIZE, verbIds.length);
        session.activePoolIds = [];
        session.poolCursor = 0;
        for (let i = 0; i < poolSize; i++) {
            const id = verbIds[i];
            session.activePoolIds.push(id);
            session.cardStateById[id] = this._newAcquisitionCard();
        }
        session.poolCursor = poolSize;
    }

    _newAcquisitionCard() {
        return {
            status: 'unseen',          // unseen → introduced → ready
            dueTurn: -1,
            introTurn: -1,
            failCount: 0,
            lastLatencyMs: null,
            lastSeenTurn: -1
        };
    }

    _newChallengeCard() {
        return {
            status: 'pending',         // pending → passed
            dueTurn: 0,
            failCount: 0,
            requiredFast: 0,
            completedFast: 0,
            lastLatencyMs: null,
            lastSeenTurn: -1
        };
    }

    // ── phase transitions ──

    startPhase(session, phase) {
        if (phase === PHASE_RECOGNITION || phase === PHASE_PRODUCTION) {
            session.phase = phase;
            session.phaseOrder = shuffle(session.orderIds, this._rng);
            for (const id of session.phaseOrder) {
                session.cardStateById[id] = this._newChallengeCard();
                session.cardStateById[id].dueTurn = session.turn;
            }
            // phase order is persisted in the session so a refresh does not reshuffle
        } else if (phase === PHASE_ACQUISITION) {
            this._initAcquisition(session, session.orderIds);
        }
        session.updatedAt = Date.now();
    }

    /**
     * Start (or switch) one review track. Returns true if any items exist.
     */
    startReviewTrack(session, track) {
        const ids = session.reviewItems.filter(i => i.track === track).map(i => i.verbId);
        if (ids.length === 0) return false;
        session.phase = track;
        session.orderIds = ids;
        session.trackPhaseOrders = session.trackPhaseOrders || {};
        const cached = session.trackPhaseOrders[track];
        const idsMatch = cached && cached.length === ids.length && new Set(cached).size === new Set([...cached, ...ids]).size;
        if (!idsMatch) {
            session.trackPhaseOrders[track] = shuffle(ids, this._rng);
        }
        session.phaseOrder = session.trackPhaseOrders[track];
        session.cardStateById = {};
        for (const id of ids) {
            session.cardStateById[id] = this._newChallengeCard();
            session.cardStateById[id].dueTurn = session.turn;
        }
        session.updatedAt = Date.now();
        return true;
    }

    /**
     * Mark the session as closed/complete (finish for today).
     */
    finishSession(session) {
        session.phase = PHASE_COMPLETE;
        session.updatedAt = Date.now();
    }

    // ── state probes ──

    isAcquisitionComplete(session) {
        if (session.phase !== PHASE_ACQUISITION) return false;
        return session.orderIds.every(id => {
            const card = session.cardStateById[id];
            return card && card.status === 'ready';
        });
    }

    phaseProgress(session) {
        if (session.phase === PHASE_ACQUISITION) {
            const ready = session.orderIds.filter(id => {
                const c = session.cardStateById[id];
                return c && c.status === 'ready';
            }).length;
            return { ready, total: session.orderIds.length };
        }
        const passed = session.phaseOrder.filter(id => {
            const c = session.cardStateById[id];
            return c && c.status === 'passed';
        }).length;
        return { passed, total: session.phaseOrder.length };
    }

    acquisitionPoolSize(session) {
        return session.activePoolIds ? session.activePoolIds.length : 0;
    }

    // ── presentation ──

    /**
     * Return the presentation model for the current session state WITHOUT
     * mutating the session. The caller renders it, then calls one of:
     *   - completeIntro(verbId)   for intro cards
     *   - grade(...)              for scored recall cards
     *   - dismissSpacer(verbId)   for non-scored spacer cards
     */
    nextPresentation(session) {
        if (session.phase === PHASE_ACQUISITION) {
            return this._nextAcquisitionPresentation(session);
        }
        if (session.phase === PHASE_RECOGNITION || session.phase === PHASE_PRODUCTION) {
            return this._nextChallengePresentation(session);
        }
        if (session.phase === PHASE_REVIEW) {
            const firstTrack = session.reviewItems.length > 0 ? session.reviewItems[0].track : PHASE_RECOGNITION;
            return { kind: 'transition', from: PHASE_REVIEW, to: firstTrack, review: true };
        }
        return null;
    }

    _nextAcquisitionPresentation(session) {
        if (this.isAcquisitionComplete(session)) {
            return {
                kind: 'transition',
                from: PHASE_ACQUISITION,
                to: PHASE_RECOGNITION,
                ready: session.orderIds.length
            };
        }

        // 1. due recall cards first (introduced && dueTurn <= turn)
        const due = session.activePoolIds
            .filter(id => {
                const c = session.cardStateById[id];
                return c && c.status === 'introduced' && c.dueTurn <= session.turn;
            })
            .sort((a, b) => {
                const ca = session.cardStateById[a];
                const cb = session.cardStateById[b];
                return (ca.dueTurn - cb.dueTurn) || (ca.lastSeenTurn - cb.lastSeenTurn);
            });
        if (due.length > 0) {
            return {
                kind: 'recall',
                verbId: due[0],
                direction: 'de-to-en',
                turn: session.turn,
                phase: session.phase
            };
        }

        // 2. else introduce the next unseen word that is already inside the active pool
        const unseen = session.activePoolIds.filter(id => {
            const c = session.cardStateById[id];
            return c && c.status === 'unseen';
        });
        if (unseen.length > 0) {
            return {
                kind: 'intro',
                verbId: unseen[0],
                turn: session.turn,
                phase: session.phase
            };
        }

        // 3. fallback: nothing unseen, nothing due — re-present the earliest
        //    introduced card so the flow can never stall.
        const introduced = session.activePoolIds
            .filter(id => {
                const c = session.cardStateById[id];
                return c && c.status === 'introduced';
            })
            .sort((a, b) => session.cardStateById[a].dueTurn - session.cardStateById[b].dueTurn);
        if (introduced.length > 0) {
            return {
                kind: 'recall',
                verbId: introduced[0],
                direction: 'de-to-en',
                turn: session.turn,
                phase: session.phase,
                forced: true
            };
        }

        return null;
    }

    _nextChallengePresentation(session) {
        const order = session.phaseOrder;
        const pending = order.filter(id => {
            const c = session.cardStateById[id];
            return c && c.status === 'pending';
        });
        const total = order.length;

        if (pending.length === 0) {
            if (session.sessionType === 'review') {
                // Non-mutating peek: treat the finished track as completed for the
                // purpose of finding the next track. The caller transitions with
                // completeReviewTrack()/startReviewTrack().
                const completed = new Set(session.completedTracks || []);
                completed.add(session.phase);
                const nextTrack = session.reviewItems
                    .map(i => i.track)
                    .find(t => !completed.has(t));
                if (nextTrack) {
                    return {
                        kind: 'transition',
                        from: session.phase,
                        to: nextTrack,
                        review: true
                    };
                }
                return { kind: 'complete', win: 'review', total: session.reviewItems.length, turn: session.turn };
            }
            return { kind: 'complete', win: session.phase, total: total, turn: session.turn };
        }

        const direction = session.phase === PHASE_PRODUCTION ? 'en-to-de' : 'de-to-en';

        // 1. first pending card that is already due, in phase order
        const due = order.find(id => {
            const c = session.cardStateById[id];
            return c && c.status === 'pending' && c.dueTurn <= session.turn;
        });
        if (due) {
            return {
                kind: 'recall',
                verbId: due,
                direction,
                turn: session.turn,
                phase: session.phase
            };
        }

        // 2. no pending card is due → non-scored spacer from a passed card,
        //    preferring the one least recently seen and never back-to-back.
        if (pending.length < total) {
            const spacer = order
                .filter(id => {
                    const c = session.cardStateById[id];
                    return c && c.status === 'passed' && c.lastSeenTurn < session.turn - 1;
                })
                .sort((a, b) => session.cardStateById[a].lastSeenTurn - session.cardStateById[b].lastSeenTurn)[0];
            if (spacer) {
                return {
                    kind: 'recall',
                    verbId: spacer,
                    direction,
                    turn: session.turn,
                    phase: session.phase,
                    spacer: true
                };
            }
        }

        // 3. last resort: earliest pending (not quite due) — only when no safe
        //    spacer alternative exists (e.g. tiny decks mid-recovery).
        const fallback = order.find(id => {
            const c = session.cardStateById[id];
            return c && c.status === 'pending';
        });
        if (fallback) {
            return {
                kind: 'recall',
                verbId: fallback,
                direction,
                turn: session.turn,
                phase: session.phase,
                forced: true
            };
        }

        return null;
    }

    // ── mutations ──

    /**
     * Explicitly close the current review track and return the transition to the
     * next uncompleted track (or the final review completion). This is the only
     * place `completedTracks` is mutated for a finished track.
     */
    completeReviewTrack(session) {
        if (session.sessionType !== 'review' || session.phase === PHASE_REVIEW) return null;
        // A track with any unresolved pending card is unfinished: premature
        // completion must be rejected with zero mutation.
        const unfinished = session.phaseOrder.some(id => {
            const card = session.cardStateById && session.cardStateById[id];
            return !!card && card.status === 'pending';
        });
        if (unfinished) return null;
        if (!session.completedTracks) session.completedTracks = [];
        if (!session.completedTracks.includes(session.phase)) {
            session.completedTracks.push(session.phase);
        }
        const nextTrack = session.reviewItems
            .map(i => i.track)
            .find(t => !session.completedTracks.includes(t));
        if (nextTrack) {
            return { kind: 'transition', from: session.phase, to: nextTrack, review: true };
        }
        return { kind: 'complete', win: 'review', total: session.reviewItems.length, turn: session.turn };
    }

    /**
     * Complete an introduction card. Introduction never counts as a successful
     * recall. The word's first recall is scheduled after INTRO_TO_RECALL_GAP.
     * Only a genuine unseen acquisition introduction mutates state: an absent
     * card, a replayed intro, an introduced/ready card, or a wrong phase is a
     * complete no-op (no turn, no card state, no session mutation) that still
     * returns the current next presentation.
     */
    completeIntro(session, verbId) {
        const card = session.cardStateById[verbId];
        if (session.phase === PHASE_ACQUISITION && card && card.status === 'unseen') {
            card.status = 'introduced';
            card.introTurn = session.turn;
            card.dueTurn = session.turn + 1 + INTRO_TO_RECALL_GAP;
            card.lastSeenTurn = session.turn;
            session.turn += 1;
            session.updatedAt = Date.now();
        }
        return this.nextPresentation(session);
    }

    /**
     * Grade a scored recall card.
     * @param {string} verbId
     * @param {boolean} remembered  self-reported correctness (never replaced by timing)
     * @param {number|null} latencyMs response time from first reveal (nullable)
     */
    grade(session, verbId, remembered, latencyMs) {
        const card = session.cardStateById ? session.cardStateById[verbId] : null;

        // A replayed or spurious event (double click, stale button, retry of an
        // already-decided card) must be a COMPLETE no-op: no turn advance, no
        // card state, no order or retry scheduling, no session mutation. Only
        // cards still awaiting a scored outcome are scorable (introduced
        // acquisition recalls and pending challenge recalls). Absent cards and
        // already-terminal cards are ignored.
        const scorable = !!card && (
            (session.phase === PHASE_ACQUISITION && card.status === 'introduced')
            || ((session.phase === PHASE_RECOGNITION || session.phase === PHASE_PRODUCTION) && card.status === 'pending')
        );
        if (!scorable) {
            return {
                verbId,
                phase: session.phase,
                passed: false,
                forgot: false,
                rememberedSlow: false,
                recovery: false,
                lastLatencyMs: latencyMs === null || latencyMs === undefined ? null : latencyMs,
                ignored: true,
                turn: session.turn,
                next: null
            };
        }

        const outcome = {
            verbId,
            phase: session.phase,
            passed: false,
            forgot: false,
            rememberedSlow: false,
            recovery: false,
            lastLatencyMs: latencyMs === null || latencyMs === undefined ? null : latencyMs
        };

        if (session.phase === PHASE_ACQUISITION) {
            this._gradeAcquisition(session, verbId, remembered, latencyMs, outcome);
        } else {
            this._gradeChallenge(session, verbId, remembered, latencyMs, outcome);
        }

        const turn = session.turn;
        session.turn += 1;
        session.updatedAt = Date.now();

        outcome.turn = turn;
        outcome.next = this.nextPresentation(session);
        return outcome;
    }

    _gradeAcquisition(session, verbId, remembered, latencyMs, outcome) {
        const card = session.cardStateById[verbId];
        if (!card) return;
        card.lastSeenTurn = session.turn;
        if (latencyMs !== null && latencyMs !== undefined) card.lastLatencyMs = latencyMs;

        if (remembered) {
            // light phase: one separated successful recall promotes the word
            card.status = 'ready';
            outcome.passed = true;
            // rolling pool: drop the ready word, immediately add the next unseen one
            session.activePoolIds = session.activePoolIds.filter(id => id !== verbId);
            this._stageNextUnseen(session);
        } else {
            card.failCount += 1;
            card.dueTurn = session.turn + 1 + ACQUISITION_RETRY_GAP;
            outcome.forgot = true;
        }
    }

    _stageNextUnseen(session) {
        while (session.poolCursor < session.orderIds.length) {
            const nextId = session.orderIds[session.poolCursor];
            session.poolCursor += 1;
            if (session.cardStateById[nextId]) continue; // already staged
            session.activePoolIds.push(nextId);
            session.cardStateById[nextId] = this._newAcquisitionCard();
            break;
        }
    }

    /**
     * Advance past a non-scored spacer card. Mastery state is never changed.
     */
    dismissSpacer(session, verbId) {
        const card = session.cardStateById[verbId];
        if (card) card.lastSeenTurn = session.turn;
        session.turn += 1;
        session.updatedAt = Date.now();
        return this.nextPresentation(session);
    }

    // A recall only counts as fast when the latency is a valid, positive,
    // finite number at or below the fast threshold. Unknown, missing, NaN and
    // other invalid values never count as fast.
    _isFastLatency(latencyMs) {
        return typeof latencyMs === 'number'
            && Number.isFinite(latencyMs)
            && latencyMs > 0
            && latencyMs <= FAST_RECALL_MS;
    }

    _gradeChallenge(session, verbId, remembered, latencyMs, outcome) {
        const card = session.cardStateById[verbId];
        if (!card) return;
        // Exactly-once guard: a passed card is terminal. A duplicate or
        // replayed terminal event can never re-apply a scored outcome.
        if (card.status === 'passed') return;
        card.lastSeenTurn = session.turn;
        if (latencyMs !== null && latencyMs !== undefined) card.lastLatencyMs = latencyMs;

        const isFast = this._isFastLatency(latencyMs);

        if (remembered) {
            if (isFast) {
                card.completedFast += 1;
                if (card.requiredFast === 0 || card.completedFast >= card.requiredFast) {
                    // first official win, or the last required recovery fast recall
                    card.status = 'passed';
                    outcome.passed = true;
                    outcome.recovery = card.failCount > 0;
                } else {
                    card.dueTurn = session.turn + 1 + RECOVERY_RETRY_GAP;
                }
            } else {
                // slow Remembered: never fails the word, never passes it yet
                card.dueTurn = session.turn + 1 + SLOW_RECALL_GAP;
                outcome.rememberedSlow = true;
            }
        } else {
            card.failCount += 1;
            // Forgot: reset recovery progress, require RECOVERY_FAST_COUNT clean recalls
            card.completedFast = 0;
            card.requiredFast = RECOVERY_FAST_COUNT;
            card.dueTurn = session.turn + 1 + FORGOT_FIRST_RECOVERY_GAP;
            outcome.forgot = true;
        }
    }
}
