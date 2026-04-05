import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let auth, db;

export const initFirebase = (config, appId) => {
    // Initialize default app so Firebase Auth is shared seamlessly across the entire domain.
    // (Passing appId here partitions the Auth databases, breaking cross-level login)
    const app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
    return { auth, db };
};

export const getAuthInstance = () => auth;
export const getFirestoreInstance = () => db;

export const loginWithGoogle = () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return signInWithPopup(auth, provider);
};

export const logout = () => signOut(auth);

export const getProgressDocRef = (appId, uid) =>
    doc(db, `artifacts/${appId}/users/${uid}/progress/main`);

export const loadProgress = async (appId, uid) => {
    try {
        const ref = getProgressDocRef(appId, uid);
        const snap = await getDoc(ref);
        return snap.exists() ? snap.data() : null;
    } catch (e) {
        console.warn('Firebase load failed:', e);
        return null;
    }
};

export const saveProgress = async (appId, uid, data) => {
    try {
        const ref = getProgressDocRef(appId, uid);
        // { merge: true } preserves existing fields and enables offline sync
        await setDoc(ref, { ...data, lastUpdated: new Date().toISOString() }, { merge: true });
    } catch (e) {
        console.warn('Firebase save failed:', e);
    }
};

export const listenAuth = (callback) =>
    onAuthStateChanged(auth, callback);

// Cross-level helper for "Portal Walker" trophy
export const getOtherLevelProgress = async (otherAppId, uid) => {
    try {
        const ref = doc(db, `artifacts/${otherAppId}/users/${uid}/progress/main`);
        const snap = await getDoc(ref);
        return snap.exists() ? snap.data() : null;
    } catch {
        return null;
    }
};

// ── LEADERBOARD SERVICES ──
export const updateLeaderboard = async (appId, uid, displayName, photoURL, knownCount) => {
    try {
        const ref = doc(db, `leaderboard/${uid}`);
        const snap = await getDoc(ref);
        const prev = snap.exists() ? snap.data() : { a1Count: 0, b2Count: 0 };
        
        let a1 = prev.a1Count || 0;
        let b2 = prev.b2Count || 0;
        
        if (appId.includes('a1')) a1 = knownCount;
        if (appId.includes('b2')) b2 = knownCount;
        
        const totalWords = a1 + b2;
        
        await setDoc(ref, {
            displayName: displayName || "Anonymous Linguist",
            photoURL: photoURL || "",
            a1Count: a1,
            b2Count: b2,
            totalWords,
            lastActive: new Date().toISOString()
        }, { merge: true });
    } catch(e) {
        console.warn("Leaderboard update failed", e);
    }
};

export const getLeaderboard = async () => {
    try {
        const q = query(collection(db, "leaderboard"), orderBy("totalWords", "desc"), limit(50));
        const qs = await getDocs(q);
        return qs.docs.map((d, index) => ({ ...d.data(), rank: index + 1 }));
    } catch(e) {
        console.warn("Leaderboard fetch failed", e);
        return [];
    }
};