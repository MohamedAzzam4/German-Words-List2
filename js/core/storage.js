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

export const saveLocalProgress = (appId, data) => {
    try {
        localStorage.setItem(STORAGE_KEY(appId), JSON.stringify(data));
    } catch (e) {
        console.warn('localStorage save failed:', e);
    }
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

    return merged;
};

const getDefaultProgress = () => ({
    known: [],
    trophies: [],
    trophyCounts: {},
    sessionCount: 0,
    sessionsCompleted: 0,
    darkMode: false,
    ttsCount: 0,
    columnHideCount: 0,
    darkModeToggleCount: 0,
    studyDates: [],
    totalStudyTimeMs: 0,
    flashcardErrors: {},
    lastUpdated: new Date().toISOString(),
    lastStudyDate: null,
    quizCorrect: 0,
    modesUsed: [],
    uid: null
});

export const getDefaultProgressObj = getDefaultProgress;