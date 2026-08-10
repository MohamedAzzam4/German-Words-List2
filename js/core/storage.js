export const STORAGE_KEY = (appId) => `german_app_progress_${appId}`;

export const getLocalProgress = (appId) => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY(appId));
        if (!raw) return getDefaultProgress();
        const parsed = JSON.parse(raw);
        // Ensure backward compatibility
        return { ...getDefaultProgress(), ...parsed };
    } catch {
        return getDefaultProgress();
    }
};

export const saveLocalProgress = (appId, data, uid) => {
    try {
        const payload = { ...data };
        if (uid) payload._ownerUid = uid;
        localStorage.setItem(STORAGE_KEY(appId), JSON.stringify(payload));
    } catch (e) {
        console.warn('localStorage save failed:', e);
    }
};

/**
 * Returns local progress ONLY if it belongs to the given UID.
 * If it belongs to a different user (or the old website with no UID tag),
 * the stale data is discarded and a clean default is returned.
 */
export const getLocalProgressForUser = (appId, uid) => {
    const local = getLocalProgress(appId);
    if (local._ownerUid && local._ownerUid !== uid) {
        console.warn(`⚠️ LocalStorage belongs to ${local._ownerUid}, not ${uid}. Discarding stale data.`);
        clearLocalProgress(appId);
        return getDefaultProgress();
    }
    if (!local._ownerUid && (local.known?.length > 0 || local.knownVerbIds?.length > 0)) {
        console.warn('⚠️ LocalStorage has no owner UID (likely from old website). Discarding stale data.');
        clearLocalProgress(appId);
        return getDefaultProgress();
    }
    return local;
};

export const clearLocalProgress = (appId) => {
    try {
        localStorage.removeItem(STORAGE_KEY(appId));
    } catch (e) {
        console.warn('localStorage clear failed:', e);
    }
};

export const mergeProgress = (local, remote) => {
    if (!remote) return local;

    const merged = { ...local, ...remote };

    // Deep merge arrays (known words)
    merged.known = Array.from(new Set([
        ...(local.known || []),
        ...(remote.known || [])
    ]));

    // Deep merge arrays (favorites)
    merged.favorites = Array.from(new Set([
        ...(local.favorites || []),
        ...(remote.favorites || [])
    ]));

    // Deep merge arrays (known phrases)
    merged.knownPhrases = Array.from(new Set([
        ...(local.knownPhrases || []),
        ...(remote.knownPhrases || [])
    ]));

    // Deep merge arrays (favorite phrases)
    merged.favoritePhrases = Array.from(new Set([
        ...(local.favoritePhrases || []),
        ...(remote.favoritePhrases || [])
    ]));

    // Deep merge arrays (verbs module: finished decks, known verb IDs, favorite verb IDs)
    merged.finishedVerbDecks = Array.from(new Set([
        ...(local.finishedVerbDecks || []),
        ...(remote.finishedVerbDecks || [])
    ]));

    merged.knownVerbIds = Array.from(new Set([
        ...(local.knownVerbIds || []),
        ...(remote.knownVerbIds || [])
    ]));

    merged.verbFavorites = Array.from(new Set([
        ...(local.verbFavorites || []),
        ...(remote.verbFavorites || [])
    ]));

    // Merge trophy counts (keep higher)
    merged.trophyCounts = { ...(local.trophyCounts || {}), ...(remote.trophyCounts || {}) };
    for (const k in local.trophyCounts) {
        if ((merged.trophyCounts[k] || 0) < local.trophyCounts[k]) {
            merged.trophyCounts[k] = local.trophyCounts[k];
        }
    }

    // Merge flashcard errors (keep higher counts)
    merged.flashcardErrors = { ...(local.flashcardErrors || {}), ...(remote.flashcardErrors || {}) };
    for (const k in local.flashcardErrors) {
        if ((merged.flashcardErrors[k] || 0) < local.flashcardErrors[k]) {
            merged.flashcardErrors[k] = local.flashcardErrors[k];
        }
    }

    // Merge phrase errors (keep higher counts)
    merged.phraseErrors = { ...(local.phraseErrors || {}), ...(remote.phraseErrors || {}) };
    for (const k in local.phraseErrors) {
        if ((merged.phraseErrors[k] || 0) < local.phraseErrors[k]) {
            merged.phraseErrors[k] = local.phraseErrors[k];
        }
    }

    // Merge study dates (unique)
    merged.studyDates = Array.from(new Set([
        ...(local.studyDates || []),
        ...(remote.studyDates || [])
    ])).sort();

    // WP-040: Merge daily activity counts (keep higher count per day)
    merged.activity = { ...(local.activity || {}), ...(remote.activity || {}) };
    for (const d in local.activity) {
        merged.activity[d] = Math.max(local.activity[d] || 0, merged.activity[d] || 0);
    }
    for (const d in remote.activity) {
        merged.activity[d] = Math.max(remote.activity[d] || 0, merged.activity[d] || 0);
    }

    // WP-040: Merge daily TTS listen counts (keep higher count per day)
    merged.ttsDaily = { ...(local.ttsDaily || {}), ...(remote.ttsDaily || {}) };
    for (const d in local.ttsDaily) {
        merged.ttsDaily[d] = Math.max(local.ttsDaily[d] || 0, merged.ttsDaily[d] || 0);
    }
    for (const d in remote.ttsDaily) {
        merged.ttsDaily[d] = Math.max(remote.ttsDaily[d] || 0, merged.ttsDaily[d] || 0);
    }

    // Keep most recent timestamps
    merged.lastUpdated = remote.lastUpdated || local.lastUpdated;
    merged.lastStudyDate = remote.lastStudyDate || local.lastStudyDate;

    // Prefer remote for boolean flags unless local is newer
    merged.darkMode = remote.darkMode !== undefined ? remote.darkMode : local.darkMode;

    // Merge srsData based on lastReviewed timestamp
    merged.srsData = {};
    const localSrs = local.srsData || {};
    const remoteSrs = remote.srsData || {};
    const allSrsKeys = new Set([...Object.keys(localSrs), ...Object.keys(remoteSrs)]);
    for (const key of allSrsKeys) {
        const localItem = localSrs[key];
        const remoteItem = remoteSrs[key];
        if (localItem && remoteItem) {
            const localTime = localItem.lastReviewed || 0;
            const remoteTime = remoteItem.lastReviewed || 0;
            if (localTime > remoteTime) {
                merged.srsData[key] = localItem;
            } else {
                merged.srsData[key] = remoteItem;
            }
        } else if (localItem) {
            merged.srsData[key] = localItem;
        } else if (remoteItem) {
            merged.srsData[key] = remoteItem;
        }
    }

    // Merge guided challenge learning records:
    //  - per-verb record with the newest updatedAt wins, unrelated fields kept
    //  - per-deck session with the newest updatedAt wins
    merged.verbLearning = mergeVerbLearning(
        local.verbLearning || {},
        remote.verbLearning || {}
    );

    return merged;
};

// Per-track merge for guided verb mastery records.
//
// Recognition and Production mastery evolve independently. A newer
// recognition-only record must never erase production mastery (and vice
// versa), so each track is merged using its own timestamp:
//
// {
//   recognitionWin,
//   srs,
//   recognitionUpdatedAt,
//   productionWin,
//   productionSrs,
//   productionUpdatedAt,
//   updatedAt,
//   infinitive
// }
//
// Legacy records without track timestamps fall back to their record-level
// `updatedAt` (only when the track genuinely exists) so old saves merge safely.

const VERB_LEARNING_SCHEMA_VERSION = 2;

export function normalizeVerbLearning(vl) {
    if (!vl || typeof vl !== 'object') {
        return { schemaVersion: VERB_LEARNING_SCHEMA_VERSION, verbs: {}, sessions: {} };
    }
    return {
        ...vl,
        // Monotonic schema version: missing, invalid, or older versions are
        // upgraded to the current one; a valid newer version is preserved.
        schemaVersion: Math.max(
            VERB_LEARNING_SCHEMA_VERSION,
            (typeof vl.schemaVersion === 'number' && Number.isFinite(vl.schemaVersion))
                ? vl.schemaVersion
                : VERB_LEARNING_SCHEMA_VERSION
        ),
        verbs: vl.verbs || {},
        sessions: vl.sessions || {}
    };
}

// Resolve the numeric time of one record track. Returns null when the track
// does not exist. A track exists if it has an explicit track timestamp, a win,
// or a scheduled SRS entry; an empty default SRS object is not a track.
function trackNumericTime(rec, winField, srsField, updatedField) {
    if (!rec) return null;
    let num;
    const explicit = rec[updatedField];
    if (typeof explicit === 'number') {
        num = explicit;
    } else if (typeof explicit === 'string' && explicit) {
        num = Date.parse(explicit);
    }
    if (num !== undefined && num !== null && !Number.isNaN(num)) {
        return Number(num);
    }
    const srsObj = rec[srsField];
    const exists = !!rec[winField] || (srsObj && !!srsObj.nextReviewDate);
    if (!exists) return null;
    const u = rec.updatedAt;
    if (typeof u === 'number') return u;
    if (typeof u === 'string' && u) return Date.parse(u);
    return 0;
}

// Pick the source record for one track (recognition or production).
function pickTrackSide(a, b, winField, srsField, updatedField) {
    const ta = trackNumericTime(a, winField, srsField, updatedField);
    const tb = trackNumericTime(b, winField, srsField, updatedField);
    if (ta === null && tb === null) return null;
    if (ta === null) return b;
    if (tb === null) return a;
    return ta >= tb ? a : b;
}

export function mergeVerbRecord(a, b) {
    const out = {};

    const recSrc = pickTrackSide(a, b, 'recognitionWin', 'srs', 'recognitionUpdatedAt');
    if (recSrc) {
        // Mastery wins are monotonic: the newer track's SRS data and timestamp
        // win, but a non-null win from either side must never be erased by a
        // newer SRS-only record that omitted the win.
        if (recSrc.recognitionWin) {
            out.recognitionWin = recSrc.recognitionWin;
        } else if (a.recognitionWin || b.recognitionWin) {
            out.recognitionWin = a.recognitionWin || b.recognitionWin;
        }
        if (recSrc.srs) out.srs = { ...recSrc.srs };
        const recNum = trackNumericTime(recSrc, 'recognitionWin', 'srs', 'recognitionUpdatedAt');
        if (recNum !== null && (recSrc.recognitionUpdatedAt === undefined ||
            recSrc.recognitionUpdatedAt === null)) {
            out.recognitionUpdatedAt = recNum;
        } else if (recSrc.recognitionUpdatedAt !== undefined && recSrc.recognitionUpdatedAt !== null) {
            out.recognitionUpdatedAt = recSrc.recognitionUpdatedAt;
        }
    }

    const prodSrc = pickTrackSide(a, b, 'productionWin', 'productionSrs', 'productionUpdatedAt');
    if (prodSrc) {
        if (prodSrc.productionWin) {
            out.productionWin = prodSrc.productionWin;
        } else if (a.productionWin || b.productionWin) {
            out.productionWin = a.productionWin || b.productionWin;
        }
        if (prodSrc.productionSrs) out.productionSrs = { ...prodSrc.productionSrs };
        const prodNum = trackNumericTime(prodSrc, 'productionWin', 'productionSrs', 'productionUpdatedAt');
        if (prodNum !== null && (prodSrc.productionUpdatedAt === undefined ||
            prodSrc.productionUpdatedAt === null)) {
            out.productionUpdatedAt = prodNum;
        } else if (prodSrc.productionUpdatedAt !== undefined && prodSrc.productionUpdatedAt !== null) {
            out.productionUpdatedAt = prodSrc.productionUpdatedAt;
        }
    }

    const times = [
        trackNumericTime(a, 'recognitionWin', 'srs', 'recognitionUpdatedAt'),
        trackNumericTime(b, 'recognitionWin', 'srs', 'recognitionUpdatedAt'),
        trackNumericTime(a, 'productionWin', 'productionSrs', 'productionUpdatedAt'),
        trackNumericTime(b, 'productionWin', 'productionSrs', 'productionUpdatedAt')
    ].filter(t => t !== null);
    if (times.length > 0) {
        out.updatedAt = Math.max(...times);
    } else {
        const au = typeof a.updatedAt === 'number' ? a.updatedAt : (typeof a.updatedAt === 'string' ? Date.parse(a.updatedAt) : 0);
        const bu = typeof b.updatedAt === 'number' ? b.updatedAt : (typeof b.updatedAt === 'string' ? Date.parse(b.updatedAt) : 0);
        out.updatedAt = Math.max(au || 0, bu || 0);
    }

    out.infinitive = a.infinitive || b.infinitive || undefined;

    return out;
}

export const mergeVerbLearning = (local, remote) => {
    // Both inputs are normalized through the real production path so a legacy,
    // partial, or non-object side can never break the merge or lose fields.
    const l = normalizeVerbLearning(local);
    const r = normalizeVerbLearning(remote);
    const mergedWords = {};
    const wordKeys = new Set([
        ...Object.keys(l.verbs),
        ...Object.keys(r.verbs)
    ]);
    for (const key of wordKeys) {
        const a = l.verbs[key];
        const b = r.verbs[key];
        if (a && b) {
            mergedWords[key] = mergeVerbRecord(a, b);
        } else {
            mergedWords[key] = a || b;
        }
    }

    const mergedSessions = {};
    const sessionKeys = new Set([
        ...Object.keys(l.sessions),
        ...Object.keys(r.sessions)
    ]);
    for (const key of sessionKeys) {
        const a = l.sessions[key];
        const b = r.sessions[key];
        if (a && b) {
            mergedSessions[key] = (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b;
        } else {
            mergedSessions[key] = a || b;
        }
    }

    return {
        schemaVersion: Math.max(
            VERB_LEARNING_SCHEMA_VERSION,
            l.schemaVersion || 1,
            r.schemaVersion || 1
        ),
        verbs: mergedWords,
        sessions: mergedSessions
    };
};

const getDefaultProgress = () => ({
    known: [],
    favorites: [],
    knownPhrases: [],
    favoritePhrases: [],
    finishedVerbDecks: [],
    knownVerbIds: [],
    verbFavorites: [],
    trophies: [],
    trophyCounts: {},
    sessionCount: 0,
    sessionsCompleted: 0,
    sessionKnown: 0,
    sessionFlashcardErrors: 0,
    sessionWordsReviewed: 0,
    lastSessionDate: '',
    darkMode: false,
    ttsCount: 0,
    columnHideCount: 0,
    darkModeToggleCount: 0,
    studyDates: [],
    activity: {},
    ttsDaily: {},
    totalStudyTimeMs: 0,
    flashcardErrors: {},
    phraseErrors: {},
    srsData: {},
    verbLearning: {
        schemaVersion: 2,
        verbs: {},
        sessions: {}
    },
    lastUpdated: new Date().toISOString(),
    lastStudyDate: null,
    quizCorrect: 0,
    modesUsed: [],
    uid: null
});

export const getDefaultProgressObj = getDefaultProgress;