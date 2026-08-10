import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Load storage.js verbatim (package.json is commonjs) inside a VM and strip
// the `export` keywords — same technique as the engine unit tests.
const src = readFileSync(new URL('../../js/core/storage.js', import.meta.url), 'utf8').replace(/^export\s+/gm, '');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
    src + `
;globalThis.__STORAGE = { mergeVerbRecord, trackNumericTime, pickTrackSide, mergeVerbLearning, mergeProgress, VERB_LEARNING_SCHEMA_VERSION };
`,
    sandbox
);
const { mergeVerbRecord, trackNumericTime, pickTrackSide, mergeVerbLearning, VERB_LEARNING_SCHEMA_VERSION } = sandbox.__STORAGE;

const t = (ms) => new Date(ms).toISOString();

const fullRecord = (over = {}) => ({
    recognitionWin: null,
    productionWin: null,
    srs: { level: 0, nextReviewDate: '' },
    productionSrs: { level: 0, nextReviewDate: '' },
    updatedAt: 0,
    ...over
});

test('schema version is bumped to 2 for per-track merging', () => {
    assert.equal(VERB_LEARNING_SCHEMA_VERSION, 2);
});

test('trackNumericTime returns null for a track that does not exist', () => {
    const rec = fullRecord();
    assert.equal(trackNumericTime(rec, 'recognitionWin', 'srs', 'recognitionUpdatedAt'), null);
    assert.equal(trackNumericTime(rec, 'productionWin', 'productionSrs', 'productionUpdatedAt'), null);
});

test('trackNumericTime falls back to record updatedAt for legacy explicit win', () => {
    const rec = fullRecord({ recognitionWin: '$B', updatedAt: 1000 });
    assert.equal(trackNumericTime(rec, 'recognitionWin', 'srs', 'recognitionUpdatedAt'), 1000);
});

test('trackNumericTime prefers the explicit track timestamp', () => {
    const rec = fullRecord({ recognitionWin: '$B', recognitionUpdatedAt: 5000, updatedAt: 1000 });
    assert.equal(trackNumericTime(rec, 'recognitionWin', 'srs', 'recognitionUpdatedAt'), 5000);
});

test('mergeVerbRecord joins per-track data without an explicit track timestamp', () => {
    const a = fullRecord({ recognitionWin: '$A', productionWin: null, updatedAt: 2000 });
    const b = fullRecord({ recognitionWin: null, productionWin: '$B', updatedAt: 1000 });
    const out = mergeVerbRecord(a, b);
    assert.equal(out.recognitionWin, '$A');
    assert.equal(out.productionWin, '$B');
    assert.equal(out.updatedAt, 2000);
});

test('mergeVerbRecord keeps the newer explicit recognition track', () => {
    const a = fullRecord({ recognitionWin: '$A', recognitionUpdatedAt: t(4000), updatedAt: 9000 });
    const b = fullRecord({ recognitionWin: '$B', recognitionUpdatedAt: t(6000), updatedAt: 7000 });
    const out = mergeVerbRecord(a, b);
    assert.equal(out.recognitionWin, '$B');
    assert.equal(out.recognitionUpdatedAt, t(6000));
    assert.equal(out.updatedAt, 6000); // overall updatedAt is the newest TRACK time
});

test('mergeVerbRecord does not invent an SRS track that never existed', () => {
    const a = fullRecord({ recognitionWin: '$A', srs: { level: 2, nextReviewDate: '$SRS' }, updatedAt: 100 });
    const out = mergeVerbRecord(a, fullRecord({ updatedAt: 200 }));
    assert.equal(out.srs.nextReviewDate, '$SRS');
    assert.equal(out.productionWin, undefined);
    assert.equal(out.productionSrs, undefined);
    assert.equal(out.productionUpdatedAt, undefined);
});

test('mergeVerbLearning preserves both sides and sessions', () => {
    const local = {
        schemaVersion: 1,
        verbs: { v_1: fullRecord({ recognitionWin: '$A', updatedAt: 100 }) },
        sessions: { s1: { updatedAt: 500 } }
    };
    const remote = {
        schemaVersion: 1,
        verbs: { v_2: fullRecord({ productionWin: '$B', updatedAt: 300 }) },
        sessions: { s2: { updatedAt: 700 } }
    };
    const out = mergeVerbLearning(local, remote);
    assert.equal(out.schemaVersion, 2);
    assert.equal(out.verbs.v_1.recognitionWin, '$A');
    assert.equal(out.verbs.v_2.productionWin, '$B');
    assert.equal(out.sessions.s1.updatedAt, 500);
    assert.equal(out.sessions.s2.updatedAt, 700);
});

function createStorageSandbox() {
    const s = {};
    vm.createContext(s);
    vm.runInContext(
        src + `
;globalThis.__STORAGE = { mergeVerbRecord, trackNumericTime, pickTrackSide, mergeVerbLearning, mergeProgress, getDefaultProgressObj, normalizeVerbLearning, VERB_LEARNING_SCHEMA_VERSION };
`,
        s
    );
    return s.__STORAGE;
}

test('GC-11: schema version 2 default, upgrade, and merge produce version 2', () => {
    const st = createStorageSandbox();
    let def = st.getDefaultProgressObj();
    let upgraded = st.normalizeVerbLearning({ schemaVersion: 1, verbs: {} });
    let merged = st.mergeVerbLearning({ schemaVersion: 1, verbs: {} }, { schemaVersion: 1, verbs: {} });

    assert.equal(def.verbLearning.schemaVersion, 2, 'getDefaultProgressObj must specify schemaVersion 2');
    assert.equal(upgraded.schemaVersion, 2, 'normalizeVerbLearning must upgrade schemaVersion to 2');
    assert.equal(merged.schemaVersion, 2, 'mergeVerbLearning must return schemaVersion 2');
});

test('GC-15: mergeVerbLearning handles complete track conflict matrix independently', () => {
    // 1. Newer local recognition + newer remote production
    const local1 = {
        schemaVersion: 2,
        verbs: {
            v_1: fullRecord({ recognitionWin: 'LOCAL_REC', recognitionUpdatedAt: t(5000), productionWin: 'LOCAL_PROD', productionUpdatedAt: t(1000) })
        }
    };
    const remote1 = {
        schemaVersion: 2,
        verbs: {
            v_1: fullRecord({ recognitionWin: 'REMOTE_REC', recognitionUpdatedAt: t(2000), productionWin: 'REMOTE_PROD', productionUpdatedAt: t(6000) })
        }
    };
    const out1 = mergeVerbLearning(local1, remote1);
    assert.equal(out1.verbs.v_1.recognitionWin, 'LOCAL_REC');
    assert.equal(out1.verbs.v_1.productionWin, 'REMOTE_PROD');

    // 2. Newer remote recognition + newer local production
    const local2 = {
        schemaVersion: 2,
        verbs: {
            v_1: fullRecord({ recognitionWin: 'LOCAL_REC', recognitionUpdatedAt: t(1000), productionWin: 'LOCAL_PROD', productionUpdatedAt: t(8000) })
        }
    };
    const remote2 = {
        schemaVersion: 2,
        verbs: {
            v_1: fullRecord({ recognitionWin: 'REMOTE_REC', recognitionUpdatedAt: t(7000), productionWin: 'REMOTE_PROD', productionUpdatedAt: t(2000) })
        }
    };
    const out2 = mergeVerbLearning(local2, remote2);
    assert.equal(out2.verbs.v_1.recognitionWin, 'REMOTE_REC');
    assert.equal(out2.verbs.v_1.productionWin, 'LOCAL_PROD');
});

test('mergeVerbRecord: newer recognition SRS/timestamp cannot erase an older recognition win', () => {
    const newer = fullRecord({
        srs: { level: 3, nextReviewDate: '2035-01-01T00:00:00.000Z' },
        recognitionUpdatedAt: t(6000),
        updatedAt: 9000
    });
    const older = fullRecord({
        recognitionWin: t(1000),
        recognitionUpdatedAt: t(1000),
        updatedAt: 1000
    });
    const out = mergeVerbRecord(newer, older);
    assert.equal(out.srs.nextReviewDate, '2035-01-01T00:00:00.000Z', 'newer recognition SRS data must win');
    assert.equal(out.recognitionUpdatedAt, t(6000), 'newer recognition track timestamp must win');
    assert.equal(out.recognitionWin, t(1000), 'older non-null recognition mastery must survive');
    assert.equal(out.updatedAt, 6000, 'overall updatedAt is the newest TRACK time');
});

test('mergeVerbRecord: newer production SRS/timestamp cannot erase an older production win', () => {
    const newer = fullRecord({
        productionSrs: { level: 2, nextReviewDate: '2035-01-01T00:00:00.000Z' },
        productionUpdatedAt: t(7000),
        updatedAt: 7000
    });
    const older = fullRecord({
        productionWin: t(2000),
        productionUpdatedAt: t(2000),
        updatedAt: 2000
    });
    const out = mergeVerbRecord(newer, older);
    assert.equal(out.productionSrs.nextReviewDate, '2035-01-01T00:00:00.000Z', 'newer production SRS data must win');
    assert.equal(out.productionUpdatedAt, t(7000), 'newer production track timestamp must win');
    assert.equal(out.productionWin, t(2000), 'older non-null production mastery must survive');
    assert.equal(out.updatedAt, 7000, 'overall updatedAt is the newest TRACK time');
});

test('normalizeVerbLearning upgrades old, missing, and invalid versions, never downgrades newer ones', () => {
    const st = createStorageSandbox();
    assert.equal(st.normalizeVerbLearning({ schemaVersion: 1, verbs: {} }).schemaVersion, 2, 'version 1 upgrades to 2');
    assert.equal(st.normalizeVerbLearning({ verbs: {} }).schemaVersion, 2, 'missing version upgrades to 2');
    assert.equal(st.normalizeVerbLearning({ schemaVersion: '3', verbs: {} }).schemaVersion, 2, 'non-numeric version upgrades to 2');
    assert.equal(st.normalizeVerbLearning({ schemaVersion: 3, verbs: {} }).schemaVersion, 3, 'version 3 is preserved');
});

test('mergeVerbLearning returns the highest schema version and never downgrades', () => {
    const st = createStorageSandbox();
    const out = st.mergeVerbLearning(
        {
            schemaVersion: 3,
            verbs: { v_1: fullRecord({ recognitionWin: '$A', recognitionUpdatedAt: t(1000), updatedAt: 1000 }) },
            sessions: {}
        },
        { schemaVersion: 2, verbs: {}, sessions: {} }
    );
    assert.equal(out.schemaVersion, 3, 'version 3 merged with version 2 yields version 3');
    assert.equal(out.verbs.v_1.recognitionWin, '$A', 'verb data survives the merge');
});

test('mergeVerbLearning with undefined and null inputs returns a safe version-2 default', () => {
    const st = createStorageSandbox();
    const out = st.mergeVerbLearning(undefined, null);
    assert.equal(out.schemaVersion, 2);
    assert.equal(Object.keys(out.verbs).length, 0, 'verbs default to an empty object');
    assert.equal(Object.keys(out.sessions).length, 0, 'sessions default to an empty object');
});
