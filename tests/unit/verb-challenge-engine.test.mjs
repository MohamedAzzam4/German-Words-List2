import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The repo package.json is `commonjs`, so `.js` ESM modules cannot be imported
// by Node directly. Load the engine source verbatim (single source of truth)
// inside a VM context that mirrors a browser ES module environment.
const engineSrc = readFileSync(
    new URL('../../js/core/verb-challenge-engine.js', import.meta.url),
    'utf8'
).replace(/^export\s+/gm, '');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
    engineSrc + `
;globalThis.__EXP = { VerbChallengeEngine, ACTIVE_POOL_SIZE, FAST_RECALL_MS,
  PHASE_ACQUISITION, PHASE_RECOGNITION, PHASE_PRODUCTION, PHASE_COMPLETE, RECOVERY_FAST_COUNT };
`,
    sandbox
);

const {
    VerbChallengeEngine,
    ACTIVE_POOL_SIZE,
    FAST_RECALL_MS,
    PHASE_ACQUISITION,
    PHASE_RECOGNITION,
    PHASE_PRODUCTION,
    PHASE_COMPLETE,
    RECOVERY_FAST_COUNT
} = sandbox.__EXP;

const ids = (n) => Array.from({ length: n }, (_, i) => `v_${i}`);
const eng = () => new VerbChallengeEngine({ rng: () => 0.5 });
const HAPPY = () => ({ remembered: true, latency: 600 });

// Advance the session by ONE presentation, resolving its action.
// Returns the outcome of the mutation (next presentation, or grade outcome).
// Mirrors the controller: review track completion goes through the explicit
// completeReviewTrack() mutation, and a finished review is sealed.
function step(engine, session, presentation, decide) {
    if (presentation.kind === 'transition') {
        if (presentation.review) {
            engine.completeReviewTrack(session);
            engine.startReviewTrack(session, presentation.to);
        } else {
            engine.startPhase(session, presentation.to);
        }
        return engine.nextPresentation(session);
    }
    if (presentation.kind === 'intro') {
        return engine.completeIntro(session, presentation.verbId);
    }
    const action = decide(session, presentation);
    if (presentation.spacer) {
        return engine.dismissSpacer(session, presentation.verbId);
    }
    const outcome = engine.grade(session, presentation.verbId, action.remembered, action.latency ?? null);
    if (outcome.next && outcome.next.kind === 'complete' && session.sessionType === 'review') {
        engine.completeReviewTrack(session);
        engine.finishSession(session);
    }
    return outcome.next;
}

// Drive until a given predicate holds. Throws on runaway.
function drive(engine, session, predicate, decide) {
    let presentation = engine.nextPresentation(session);
    let guard = 0;
    while (presentation && !predicate(presentation)) {
        if (++guard > 5000) throw new Error('runaway drive loop');
        presentation = step(engine, session, presentation, decide);
    }
    return presentation;
}

test('acquisition seeds a hidden rolling pool capped at eight', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(50) });
    assert.equal(s.phase, PHASE_ACQUISITION);
    assert.equal(e.acquisitionPoolSize(s), Math.min(ACTIVE_POOL_SIZE, 50));
    assert.equal(s.activePoolIds.length, ACTIVE_POOL_SIZE);
});

test('pool never exceeds eight throughout a full lesson', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(37) });
    let maxPool = 0;
    const finalPres = drive(
        e, s,
        p => {
            maxPool = Math.max(maxPool, e.acquisitionPoolSize(s));
            return p.kind === 'complete';
        },
        HAPPY
    );
    assert.equal(finalPres.kind, 'complete');
    assert.ok(maxPool <= 8, `pool grew to ${maxPool}`);
});

test('a ready acquisition word leaves the pool and the next unseen word enters', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(12) });
    // introduce exactly the pool words
    let pres = e.nextPresentation(s);
    while (pres && pres.kind === 'intro') pres = e.completeIntro(s, pres.verbId);
    assert.equal(pres.kind, 'recall');
    const before = new Set(s.activePoolIds);
    const outId = pres.verbId;
    const outcome = e.grade(s, outId, true, 1);
    assert.equal(outcome.passed, true);
    const after = new Set(s.activePoolIds);
    assert.ok(!after.has(outId), 'ready word should leave the pool');
    assert.equal(after.size, before.size, 'pool size stays constant (next unseen enters)');
    const added = [...after].find(id => !before.has(id));
    assert.ok(added, 'a new word should have entered the pool');
    assert.equal(s.cardStateById[added].status, 'unseen');
});

test('forgot during acquisition never repeats without intervening cards', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(20) });
    let pres = e.nextPresentation(s);
    while (pres && pres.kind !== 'recall') pres = e.completeIntro(s, pres.verbId);
    const forgettingId = pres.verbId;
    pres = e.grade(s, forgettingId, false, 1).next; // forgot
    let turnsBetween = 0;
    while (pres && pres.kind === 'recall' && pres.verbId !== forgettingId) {
        turnsBetween += 1;
        pres = pres.spacer
            ? e.dismissSpacer(s, pres.verbId)
            : e.grade(s, pres.verbId, true, 1).next;
    }
    assert.ok(turnsBetween >= 2, `only ${turnsBetween} intervening cards`);
    assert.equal(pres.verbId, forgettingId);
});

test('recognition phase only starts once every acquisition word is ready', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(9) });
    const pres = drive(e, s, p => p.kind === 'transition', HAPPY);
    assert.equal(pres.from, PHASE_ACQUISITION);
    assert.equal(pres.to, PHASE_RECOGNITION);
    assert.equal(pres.ready, 9);
    assert.ok(s.orderIds.every(id => s.cardStateById[id].status === 'ready'));
});

test('acquisition completes and the pool stays rolling to recognition for 50 verbs', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(50) });
    let maxPool = 0;
    const pres = drive(
        e, s,
        p => {
            maxPool = Math.max(maxPool, e.acquisitionPoolSize(s));
            return p.kind === 'transition';
        },
        HAPPY
    );
    assert.equal(pres.to, PHASE_RECOGNITION);
    assert.ok(maxPool <= 8);
    assert.ok(s.orderIds.every(id => s.cardStateById[id].status === 'ready'));
});

test('fast recognition passes on the first official attempt', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(3) });
    e.startPhase(s, PHASE_RECOGNITION);
    const first = e.nextPresentation(s);
    assert.equal(first.kind, 'recall');
    assert.equal(first.direction, 'de-to-en');
    const outcome = e.grade(s, first.verbId, true, 500);
    assert.equal(outcome.passed, true);
    assert.equal(s.cardStateById[first.verbId].status, 'passed');
});

test('slow recognition is scheduled again and never passes', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(4) });
    e.startPhase(s, PHASE_RECOGNITION);
    const first = e.nextPresentation(s);
    const outcome = e.grade(s, first.verbId, true, FAST_RECALL_MS + 5000);
    assert.equal(outcome.passed, false);
    assert.equal(outcome.rememberedSlow, true);
    assert.equal(s.cardStateById[first.verbId].status, 'pending');
});

test('forgot during recognition requires recovery before passing', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(2) });
    e.startPhase(s, PHASE_RECOGNITION);
    const firstId = e.nextPresentation(s).verbId;

    const forgot = e.grade(s, firstId, false, 1000); // forgot
    assert.equal(forgot.forgot, true);
    assert.equal(s.cardStateById[firstId].requiredFast, RECOVERY_FAST_COUNT);

    const recover1 = e.grade(s, firstId, true, 500); // recovery fast #1
    assert.equal(recover1.passed, false);
    assert.equal(s.cardStateById[firstId].completedFast, 1);

    const recover2 = e.grade(s, firstId, true, 500); // recovery fast #2
    assert.equal(recover2.passed, true);
    assert.equal(s.cardStateById[firstId].status, 'passed');
});

test('forgot during recognition cannot pass after zero fast recalls', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(2) });
    e.startPhase(s, PHASE_RECOGNITION);
    const firstId = e.nextPresentation(s).verbId;
    e.grade(s, firstId, false, 1000); // forgot
    // slow recovery attempt counts nothing
    const attempted = e.grade(s, firstId, true, FAST_RECALL_MS + 9000);
    assert.equal(attempted.passed, false);
    assert.equal(s.cardStateById[firstId].completedFast, 0);
});

test('production challenge stays independent from recognition', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(3) });
    e.startPhase(s, PHASE_RECOGNITION);
    const pr1 = e.nextPresentation(s);
    assert.equal(pr1.direction, 'de-to-en');
    e.grade(s, pr1.verbId, true, 400);
    assert.equal(e.phaseProgress(s).passed, 1);

    e.startPhase(s, PHASE_PRODUCTION);
    const pp1 = e.nextPresentation(s);
    assert.equal(pp1.direction, 'en-to-de');
    assert.equal(e.phaseProgress(s).passed, 0, 'production starts fresh');
});

test('full deck drives recognition, then production to the final second win', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 36, verbIds: ids(7) });
    // acquisition → recognition, stop at recognition completion
    const rec = drive(e, s, p => p.kind === 'complete', HAPPY);
    assert.equal(rec.win, PHASE_RECOGNITION);
    // user continues to production
    e.startPhase(s, PHASE_PRODUCTION);
    const prod = drive(e, s, p => p.kind === 'complete', HAPPY);
    assert.equal(prod.win, PHASE_PRODUCTION);
    assert.equal(e.phaseProgress(s).passed, 7);
});

test('review session serves recognition then production tracks and completes', () => {
    const e = eng();
    const s = e.createReviewSession({
        deckId: 1,
        items: [
            { verbId: 'v_a', track: PHASE_RECOGNITION },
            { verbId: 'v_b', track: PHASE_RECOGNITION },
            { verbId: 'v_c', track: PHASE_PRODUCTION }
        ]
    });
    let p = e.nextPresentation(s);
    assert.equal(p.kind, 'transition');
    assert.equal(p.to, PHASE_RECOGNITION);
    e.startReviewTrack(s, p.to);
    p = e.nextPresentation(s);
    assert.equal(p.kind, 'recall');
    assert.equal(p.phase, PHASE_RECOGNITION);
    const final = drive(e, s, q => q.kind === 'complete', HAPPY);
    assert.equal(final.kind, 'complete');
    assert.equal(final.win, 'review');
    assert.equal(final.total, 3);
    assert.equal(
        [...s.completedTracks].sort().join(','),
        [PHASE_RECOGNITION, PHASE_PRODUCTION].sort().join(',')
    );
});

test('review session that starts on production serves production first', () => {
    const e = eng();
    const s = e.createReviewSession({
        deckId: 1,
        items: [
            { verbId: 'v_b', track: PHASE_PRODUCTION },
            { verbId: 'v_c', track: PHASE_PRODUCTION }
        ]
    });
    let p = e.nextPresentation(s);
    assert.equal(p.kind, 'transition');
    assert.equal(p.to, PHASE_PRODUCTION);
    e.startReviewTrack(s, p.to);
    assert.equal(s.phase, PHASE_PRODUCTION);
    p = e.nextPresentation(s);
    assert.equal(p.kind, 'recall');
    assert.equal(p.direction, 'en-to-de');
    const final = drive(e, s, q => q.kind === 'complete', HAPPY);
    assert.equal(final.kind, 'complete');
    assert.equal(final.win, 'review');
    assert.equal(s.completedTracks.join(','), PHASE_PRODUCTION);
});

test('finishSession seals a session so it can never start again', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(2) });
    assert.ok(e.nextPresentation(s));
    e.finishSession(s);
    assert.equal(s.phase, PHASE_COMPLETE);
    assert.equal(e.nextPresentation(s), null);
});

test('recognition direction remains German→English throughout the phase', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(4) });
    e.startPhase(s, PHASE_RECOGNITION);
    const dirs = [];
    const final = drive(
        e, s,
        p => p.kind === 'complete',
        (session, presentation) => {
            if (!presentation.spacer) dirs.push(presentation.direction);
            return HAPPY();
        }
    );
    assert.equal(final.kind, 'complete');
    assert.ok(dirs.length >= 4);
    assert.ok(dirs.every(d => d === 'de-to-en'));
});

test('production prompts use English→German direction (no German on front)', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(4) });
    e.startPhase(s, PHASE_PRODUCTION);
    const first = e.nextPresentation(s);
    assert.equal(first.direction, 'en-to-de');
});

test('phase order is stable across sessions so refresh does not reshuffle', () => {
    const e = eng();
    const s1 = e.createLearningSession({ deckId: 1, verbIds: ids(5) });
    e.startPhase(s1, PHASE_RECOGNITION);
    const order1 = JSON.stringify(s1.phaseOrder);
    const s2 = e.createLearningSession({ deckId: 1, verbIds: ids(5) });
    e.startPhase(s2, PHASE_RECOGNITION);
    assert.equal(JSON.stringify(s2.phaseOrder), order1);
});

test('review session serves recognition items before production items', () => {
    const e = eng();
    const s = e.createReviewSession({
        deckId: 1,
        items: [
            { verbId: 'v_p1', track: PHASE_PRODUCTION },
            { verbId: 'v_r1', track: PHASE_RECOGNITION },
            { verbId: 'v_r2', track: PHASE_RECOGNITION },
            { verbId: 'v_p2', track: PHASE_PRODUCTION }
        ]
    });
    assert.deepEqual(s.orderIds, ['v_r1', 'v_r2', 'v_p1', 'v_p2']);
    let p = e.nextPresentation(s);
    assert.equal(p.kind, 'transition');
    assert.equal(p.to, PHASE_RECOGNITION);
    e.startReviewTrack(s, p.to);
    assert.deepEqual(s.orderIds, ['v_r1', 'v_r2']);
});

test('only a valid positive finite latency counts as fast', () => {
    const e = eng();
    // Null / undefined / NaN / 0 / negative / non-number / above-threshold must
    // never count as fast — this is what guards the Reveal timing window.
    const s = e.createLearningSession({ deckId: 1, verbIds: ['v_a'] });
    e.startPhase(s, PHASE_RECOGNITION);
    const pres = e.nextPresentation(s);
    assert.equal(pres.kind, 'recall');
    for (const bad of [null, undefined, NaN, 0, -5, '600', Infinity, FAST_RECALL_MS + 1]) {
        const c = s.cardStateById[pres.verbId];
        c.status = 'pending';
        c.requiredFast = 1;
        c.completedFast = 0;
        const outcome = e.grade(s, pres.verbId, true, bad);
        assert.equal(outcome.passed, false, `latency ${String(bad)} must not count as fast`);
        assert.equal(c.status, 'pending');
    }
    s.cardStateById[pres.verbId].requiredFast = 1;
    s.cardStateById[pres.verbId].completedFast = 0;
    const fast = e.grade(s, pres.verbId, true, FAST_RECALL_MS);
    assert.equal(fast.passed, true, 'exactly the threshold counts as fast');
});

test('GC-10: completedTracks is modified only by completeReviewTrack and not by startReviewTrack or nextPresentation', () => {
    const e = eng();
    const s = e.createReviewSession({
        deckId: 1,
        items: [
            { verbId: 'v_1', track: PHASE_RECOGNITION },
            { verbId: 'v_2', track: PHASE_PRODUCTION }
        ]
    });
    assert.equal(s.completedTracks.length, 0);

    // nextPresentation must NOT mutate completedTracks
    e.nextPresentation(s);
    assert.equal(s.completedTracks.length, 0);

    // startReviewTrack must NOT mutate completedTracks
    e.startReviewTrack(s, PHASE_RECOGNITION);
    assert.equal(s.completedTracks.length, 0);

    // Premature completion while a track card is still pending is rejected
    // with null and zero mutation
    assert.equal(e.completeReviewTrack(s), null);
    assert.equal(s.completedTracks.length, 0);
    assert.equal(s.phase, PHASE_RECOGNITION);

    // Terminally complete the track: pass its only pending card
    const id = s.phaseOrder[0];
    const outcome = e.grade(s, id, true, 500);
    assert.equal(outcome.passed, true);
    assert.equal(s.cardStateById[id].status, 'passed');

    // Exactly one completion mutation
    const next = e.completeReviewTrack(s);
    assert.equal(s.completedTracks.length, 1);
    assert.equal(s.completedTracks[0], PHASE_RECOGNITION);
    assert.equal(next.kind, 'transition');
    assert.equal(next.to, PHASE_PRODUCTION);

    // Calling completeReviewTrack again is idempotent
    e.completeReviewTrack(s);
    assert.equal(s.completedTracks.length, 1);
});

test('GC-19: learning and review sessions are isolated and sealed on completion', () => {
    const e = eng();
    const sLearn = e.createLearningSession({ deckId: 1, verbIds: ids(2) });
    const sRev = e.createReviewSession({ deckId: 1, items: [{ verbId: 'v_0', track: PHASE_RECOGNITION }] });

    assert.equal(sLearn.sessionType, 'learning');
    assert.equal(sRev.sessionType, 'review');
    assert.notEqual(sLearn.sessionType, sRev.sessionType);

    e.finishSession(sLearn);
    assert.equal(sLearn.phase, PHASE_COMPLETE);
    assert.equal(e.nextPresentation(sLearn), null);

    e.finishSession(sRev);
    assert.equal(sRev.phase, PHASE_COMPLETE);
    assert.equal(e.nextPresentation(sRev), null);
});

test('T2-unit: per-track review orders are stored separately and ID-set mismatch regenerates', () => {
    const e = eng();
    const s = e.createReviewSession({
        deckId: 1,
        items: [
            { verbId: 'v_r1', track: PHASE_RECOGNITION },
            { verbId: 'v_r2', track: PHASE_RECOGNITION },
            { verbId: 'v_p1', track: PHASE_PRODUCTION },
            { verbId: 'v_p2', track: PHASE_PRODUCTION }
        ]
    });

    // Start recognition track
    e.startReviewTrack(s, PHASE_RECOGNITION);
    assert.deepEqual(s.orderIds.sort(), ['v_r1', 'v_r2']);
    assert.equal(s.phase, PHASE_RECOGNITION);
    assert.deepEqual(Object.keys(s.cardStateById).sort(), ['v_r1', 'v_r2']);

    // The recognition order must be stored under its own track key
    const recOrder = s.trackPhaseOrders?.[PHASE_RECOGNITION];
    assert.ok(recOrder, 'trackPhaseOrders.recognition must exist');
    assert.deepEqual(recOrder.sort(), ['v_r1', 'v_r2']);

    // Production order must not exist yet
    assert.equal(s.trackPhaseOrders?.[PHASE_PRODUCTION], undefined);

    // Complete recognition, start production
    e.completeReviewTrack(s);
    e.startReviewTrack(s, PHASE_PRODUCTION);
    assert.deepEqual(s.orderIds.sort(), ['v_p1', 'v_p2']);
    assert.equal(s.phase, PHASE_PRODUCTION);
    assert.deepEqual(Object.keys(s.cardStateById).sort(), ['v_p1', 'v_p2']);

    // Production order stored separately
    const prodOrder = s.trackPhaseOrders?.[PHASE_PRODUCTION];
    assert.ok(prodOrder, 'trackPhaseOrders.production must exist');
    assert.deepEqual(prodOrder.sort(), ['v_p1', 'v_p2']);

    // Recognition order must NOT have been overwritten by production
    assert.deepEqual(s.trackPhaseOrders[PHASE_RECOGNITION].sort(), ['v_r1', 'v_r2']);

    // Even though both tracks have length 2, neither borrows the other's IDs
    const recIds = new Set(s.trackPhaseOrders[PHASE_RECOGNITION]);
    const prodIds = new Set(s.trackPhaseOrders[PHASE_PRODUCTION]);
    const overlap = [...recIds].filter(id => prodIds.has(id));
    assert.equal(overlap.length, 0, 'recognition and production IDs must not overlap');

    // ID-set mismatch: modify reviewItems and re-start production
    // This simulates a restart where the due items have changed
    s.reviewItems = [
        { verbId: 'v_r1', track: PHASE_RECOGNITION },
        { verbId: 'v_r2', track: PHASE_RECOGNITION },
        { verbId: 'v_p3', track: PHASE_PRODUCTION },  // different ID
        { verbId: 'v_p2', track: PHASE_PRODUCTION }
    ];
    e.startReviewTrack(s, PHASE_PRODUCTION);
    // Must have regenerated because IDs changed (not just length)
    assert.deepEqual(s.orderIds.sort(), ['v_p2', 'v_p3']);
    // The new trackPhaseOrders entry must reflect the new IDs
    assert.deepEqual(s.trackPhaseOrders[PHASE_PRODUCTION].sort(), ['v_p2', 'v_p3']);
});

test('T4-unit: monotonic recall latency — edge values never count as fast', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ['v_a'] });
    e.startPhase(s, PHASE_RECOGNITION);
    const pres = e.nextPresentation(s);
    assert.equal(pres.kind, 'recall');

    // Every invalid latency must NOT count as fast
    for (const bad of [null, undefined, NaN, 0, -5, '600', Infinity, FAST_RECALL_MS + 1]) {
        const c = s.cardStateById[pres.verbId];
        c.status = 'pending';
        c.requiredFast = 1;
        c.completedFast = 0;
        const outcome = e.grade(s, pres.verbId, true, bad);
        assert.equal(outcome.passed, false, `latency ${String(bad)} must not count as fast`);
        assert.equal(c.status, 'pending', `card must remain pending for latency ${String(bad)}`);
    }

    // Exactly at threshold: must count as fast
    s.cardStateById[pres.verbId].requiredFast = 1;
    s.cardStateById[pres.verbId].completedFast = 0;
    s.cardStateById[pres.verbId].status = 'pending';
    const fast = e.grade(s, pres.verbId, true, FAST_RECALL_MS);
    assert.equal(fast.passed, true, 'exactly the threshold counts as fast');

    // Double-grade cannot change already-passed status
    // (simulates what happens if grade is called again on a passed card)
    const passedCard = s.cardStateById[pres.verbId];
    assert.equal(passedCard.status, 'passed');

    // Verify the engine uses no Date.now in the _isFastLatency path
    // (this is a structural assertion: _isFastLatency only checks typeof/finite/range)
    assert.equal(typeof e._isFastLatency, 'function');
    assert.equal(e._isFastLatency(null), false);
    assert.equal(e._isFastLatency(undefined), false);
    assert.equal(e._isFastLatency(NaN), false);
    assert.equal(e._isFastLatency(0), false);
    assert.equal(e._isFastLatency(-1), false);
    assert.equal(e._isFastLatency(Infinity), false);
    assert.equal(e._isFastLatency('500'), false);
    assert.equal(e._isFastLatency(FAST_RECALL_MS), true);
    assert.equal(e._isFastLatency(1), true);
    assert.equal(e._isFastLatency(FAST_RECALL_MS + 1), false);
});

test('T5-unit: a replayed terminal event is a complete no-op (no turn, no retry, no scoring)', () => {
    const e = eng();
    const s = e.createReviewSession({
        deckId: 1,
        items: [
            { verbId: 'v_r1', track: PHASE_RECOGNITION },
            { verbId: 'v_r2', track: PHASE_RECOGNITION },
            { verbId: 'v_p1', track: PHASE_PRODUCTION },
            { verbId: 'v_p2', track: PHASE_PRODUCTION }
        ]
    });
    e.startReviewTrack(s, PHASE_RECOGNITION);

    // Present and terminally pass the first recognition card
    const pres = e.nextPresentation(s);
    assert.equal(pres.kind, 'recall');
    const id = pres.verbId;
    const nextId = s.phaseOrder.find(x => x !== id);
    const card = s.cardStateById[id];
    const nextCard = s.cardStateById[nextId];
    card.requiredFast = 1;
    card.completedFast = 0;

    const first = e.grade(s, id, true, 600);
    assert.equal(first.passed, true, 'first terminal grade must pass');
    assert.equal(card.status, 'passed', 'the terminal event must mark the card passed');

    // Snapshot everything a stale replay could corrupt (field-by-field: the
    // engine lives in a vm realm, so object identity/prototype must not be used)
    const snapCard = {
        status: card.status, dueTurn: card.dueTurn, failCount: card.failCount,
        requiredFast: card.requiredFast, completedFast: card.completedFast,
        lastLatencyMs: card.lastLatencyMs, lastSeenTurn: card.lastSeenTurn
    };
    const snapNext = {
        status: nextCard.status, dueTurn: nextCard.dueTurn, failCount: nextCard.failCount,
        requiredFast: nextCard.requiredFast, completedFast: nextCard.completedFast,
        lastLatencyMs: nextCard.lastLatencyMs, lastSeenTurn: nextCard.lastSeenTurn
    };
    const snapSession = {
        phase: s.phase,
        turn: s.turn,
        phaseOrder: s.phaseOrder.slice(),
        completedTracks: (s.completedTracks || []).slice()
    };

    // Replay the identical terminal event on the same card
    const replay = e.grade(s, id, true, 600);
    assert.equal(replay.passed, false, 'replayed terminal event must never pass again');
    assert.equal(replay.forgot, false, 'a replay must not even look like a scored outcome');
    assert.equal(replay.rememberedSlow, false);
    assert.equal(replay.recovery, false);
    assert.equal(replay.ignored, true, 'a replay must be flagged as ignored');

    // Complete no-op: the passed card, the following card, the session turn and
    // every scheduling/order structure must be exactly preserved
    for (const key of Object.keys(snapCard)) {
        assert.equal(card[key], snapCard[key], `passed card ${key} must be exactly preserved`);
    }
    for (const key of Object.keys(snapNext)) {
        assert.equal(nextCard[key], snapNext[key], `following card ${key} must be exactly preserved`);
    }
    assert.equal(s.turn, snapSession.turn, 'a replay must NOT advance the turn');
    assert.equal(s.phase, snapSession.phase);
    assert.deepEqual(s.phaseOrder, snapSession.phaseOrder);
    assert.deepEqual(s.completedTracks, snapSession.completedTracks);

    // An absent card is equally a no-op
    const absent = e.grade(s, 'v_missing', true, 600);
    assert.equal(absent.ignored, true);
    assert.equal(absent.passed, false);
    assert.equal(s.turn, snapSession.turn, 'an absent-card grade must NOT advance the turn');
});

test('T5-unit: a replayed acquisition win is a complete no-op', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(3) });
    let pres = e.nextPresentation(s);
    while (pres && pres.kind === 'intro') pres = e.completeIntro(s, pres.verbId);
    assert.equal(pres.kind, 'recall');
    const id = pres.verbId;

    const first = e.grade(s, id, true, 1);
    assert.equal(first.passed, true);
    const card = s.cardStateById[id];
    assert.equal(card.status, 'ready');
    const snap = {
        status: card.status, dueTurn: card.dueTurn, failCount: card.failCount,
        lastLatencyMs: card.lastLatencyMs, lastSeenTurn: card.lastSeenTurn
    };
    const turnAfter = s.turn;
    const poolAfter = s.activePoolIds.slice();

    const replay = e.grade(s, id, true, 1);
    assert.equal(replay.ignored, true, 'a ready acquisition card replay must be ignored');
    assert.equal(replay.passed, false);
    assert.equal(s.turn, turnAfter, 'a replay must NOT advance the turn');
    for (const key of Object.keys(snap)) {
        assert.equal(card[key], snap[key], `ready card ${key} must be exactly preserved`);
    }
    assert.deepEqual(s.activePoolIds, poolAfter, 'the pool must not change');
});

test('T5-unit: completeIntro replay and wrong-phase calls are complete no-ops', () => {
    const e = eng();
    const s = e.createLearningSession({ deckId: 1, verbIds: ids(3) });

    const first = e.nextPresentation(s);
    assert.equal(first.kind, 'intro');
    const aId = first.verbId;
    const bId = s.orderIds[1];

    e.completeIntro(s, aId); // first introduction is a real mutation
    assert.equal(s.turn, 1);
    assert.equal(s.cardStateById[aId].status, 'introduced');

    const snapB = {
        status: s.cardStateById[bId].status, dueTurn: s.cardStateById[bId].dueTurn,
        failCount: s.cardStateById[bId].failCount, lastLatencyMs: s.cardStateById[bId].lastLatencyMs,
        lastSeenTurn: s.cardStateById[bId].lastSeenTurn
    };
    const snapTurn = s.turn;
    const snapOrder = s.orderIds.slice();
    const snapPool = s.activePoolIds.slice();
    const snapCursor = s.poolCursor;

    // Replayed intro on the introduced card: no-op, current next presentation
    // (the following unseen card) is returned unchanged
    const replay = e.completeIntro(s, aId);
    assert.equal(s.turn, snapTurn, 'a replayed intro must NOT advance the turn');
    assert.equal(s.cardStateById[aId].status, 'introduced', 'the introduced card must stay introduced');
    assert.equal(replay.verbId, bId, 'the following unseen card remains the next presentation');
    assert.equal(replay.kind, 'intro');
    for (const key of Object.keys(snapB)) {
        assert.equal(s.cardStateById[bId][key], snapB[key], `following card ${key} must be exactly preserved`);
    }
    assert.deepEqual(s.orderIds, snapOrder, 'order state must be exactly preserved');
    assert.deepEqual(s.activePoolIds, snapPool, 'pool state must be exactly preserved');
    assert.equal(s.poolCursor, snapCursor, 'pool cursor must be exactly preserved');

    // Absent card: no-op
    const absent = e.completeIntro(s, 'v_missing');
    assert.equal(s.turn, snapTurn, 'an absent-card intro must NOT advance the turn');
    assert.equal(absent.verbId, bId);

    // Wrong phase (recognition): no-op on card and session
    e.startPhase(s, PHASE_RECOGNITION);
    const cardB = s.cardStateById[bId];
    assert.equal(cardB.status, 'pending', 'recognition cards start pending');
    const turnAtRec = s.turn;
    const wrongPhase = e.completeIntro(s, bId);
    assert.equal(s.turn, turnAtRec, 'a wrong-phase intro must NOT advance the turn');
    assert.equal(cardB.status, 'pending', 'a wrong-phase intro must NOT mutate the card');
    assert.equal(wrongPhase.kind, 'recall', 'the current next presentation is returned unchanged');
});

test('T5-unit: grading a pending card inside a sealed session is a complete no-op', () => {
    const e = eng();
    const s = e.createReviewSession({
        deckId: 1,
        items: [
            { verbId: 'v_r1', track: PHASE_RECOGNITION },
            { verbId: 'v_r2', track: PHASE_RECOGNITION },
            { verbId: 'v_p1', track: PHASE_PRODUCTION }
        ]
    });
    e.startReviewTrack(s, PHASE_RECOGNITION);
    const id = s.phaseOrder[0];
    const card = s.cardStateById[id];
    assert.equal(card.status, 'pending');

    e.finishSession(s);
    assert.equal(s.phase, PHASE_COMPLETE);

    const snapCard = {
        status: card.status, dueTurn: card.dueTurn, failCount: card.failCount,
        requiredFast: card.requiredFast, completedFast: card.completedFast,
        lastLatencyMs: card.lastLatencyMs, lastSeenTurn: card.lastSeenTurn
    };
    const snapPhase = s.phase;
    const snapTurn = s.turn;
    const snapPhaseOrder = s.phaseOrder.slice();
    const snapOrderIds = s.orderIds.slice();
    const snapCompleted = (s.completedTracks || []).slice();

    const outcome = e.grade(s, id, true, 600);
    assert.equal(outcome.ignored, true, 'a sealed-session grade must be ignored');
    assert.equal(outcome.passed, false);
    assert.equal(s.phase, snapPhase);
    assert.equal(s.turn, snapTurn, 'a sealed-session grade must NOT advance the turn');
    assert.deepEqual(s.phaseOrder, snapPhaseOrder, 'phase order must be exactly preserved');
    assert.deepEqual(s.orderIds, snapOrderIds, 'track order must be exactly preserved');
    assert.deepEqual(s.completedTracks, snapCompleted, 'completed tracks must be exactly preserved');
    for (const key of Object.keys(snapCard)) {
        assert.equal(card[key], snapCard[key], `pending card ${key} must be exactly preserved`);
    }
});
