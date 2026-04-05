import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let auth, db;

export const initFirebase = (config, appId) => {
    // Initialize with unique appId to isolate data per level
    const app = initializeApp(config, appId);
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