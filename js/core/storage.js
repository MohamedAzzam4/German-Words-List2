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

    return merged;
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
    totalStudyTimeMs: 0,
    flashcardErrors: {},
    phraseErrors: {},
    srsData: {},
    lastUpdated: new Date().toISOString(),
    lastStudyDate: null,
    quizCorrect: 0,
    modesUsed: [],
    uid: null
});

export const getDefaultProgressObj = getDefaultProgress;