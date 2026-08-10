// WP-026: AuthService — extracted from app.js
// Handles all authentication-related operations: login, logout, email auth, auth state

import { loginWithGoogle, logout, loadProgress, saveProgress, loginWithEmailAndPassword, signUpWithEmailAndPassword } from './firebase.js?v=3';
import { getLocalProgress, getLocalProgressForUser, saveLocalProgress, mergeProgress, clearLocalProgress, getDefaultProgressObj } from './storage.js?v=4';

export class AuthService {
    constructor({ auth, state, appId, engines, levelConfig, onSave, showToast }) {
        this.auth = auth;
        this.state = state;
        this.appId = appId;
        this.engines = engines;
        this.levelConfig = levelConfig;
        this._onSave = onSave;
        this._showToast = showToast;
        this._hasBootedAuth = false;
        this._emailAuthMode = 'signin';
    }

    async loginWithGoogle() {
        if (!this.auth) {
            alert('Firebase not configured. Please add your Firebase config to app.js');
            return;
        }
        try {
            await loginWithGoogle();
            window.location.reload();
        } catch (e) {
            console.error('Login failed:', e);
            alert('Login failed: ' + e.message);
        }
    }

    openEmailAuthModal() {
        let modal = document.getElementById('email-auth-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'email-auth-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="modal-title">Sign In with Email</h3>
                        <button class="modal-close" onclick="window.app.closeEmailAuthModal()">✕</button>
                    </div>
                    <form id="email-auth-form" onsubmit="window.app.handleEmailAuth(event)">
                        <div class="form-group hidden" id="name-group">
                            <label for="auth-name">Name</label>
                            <input type="text" id="auth-name" class="form-input" placeholder="Your name">
                        </div>
                        <div class="form-group">
                            <label for="auth-email">Email</label>
                            <input type="email" id="auth-email" class="form-input" placeholder="you@example.com" required autocomplete="username">
                        </div>
                        <div class="form-group">
                            <label for="auth-password">Password</label>
                            <input type="password" id="auth-password" class="form-input" placeholder="••••••••" required autocomplete="current-password">
                        </div>
                        <div id="auth-error-msg" class="modal-error"></div>
                        <div class="modal-footer">
                            <button type="submit" class="btn primary" id="auth-submit-btn" style="width: 100%;">Sign In</button>
                            <div class="modal-toggle-text" onclick="window.app.toggleEmailAuthMode()">
                                Don't have an account? <span id="auth-toggle-link">Sign Up</span>
                            </div>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
        }

        // Reset state
        this._emailAuthMode = 'signin';
        document.getElementById('name-group').classList.add('hidden');
        document.getElementById('auth-name').removeAttribute('required');
        document.getElementById('modal-title').textContent = 'Sign In with Email';
        document.getElementById('auth-submit-btn').textContent = 'Sign In';
        document.getElementById('auth-toggle-link').textContent = 'Sign Up';
        document.getElementById('auth-error-msg').textContent = '';
        document.getElementById('email-auth-form').reset();

        // Show modal with animation
        setTimeout(() => modal.classList.add('open'), 10);
    }

    closeEmailAuthModal() {
        const modal = document.getElementById('email-auth-modal');
        if (modal) {
            modal.classList.remove('open');
        }
    }

    toggleEmailAuthMode() {
        const nameGroup = document.getElementById('name-group');
        const authName = document.getElementById('auth-name');
        const modalTitle = document.getElementById('modal-title');
        const submitBtn = document.getElementById('auth-submit-btn');
        const toggleLink = document.getElementById('auth-toggle-link');
        const errorMsg = document.getElementById('auth-error-msg');

        errorMsg.textContent = '';

        if (this._emailAuthMode === 'signin') {
            this._emailAuthMode = 'signup';
            nameGroup.classList.remove('hidden');
            authName.setAttribute('required', 'true');
            modalTitle.textContent = 'Create Account';
            submitBtn.textContent = 'Sign Up';
            toggleLink.textContent = 'Sign In';
        } else {
            this._emailAuthMode = 'signin';
            nameGroup.classList.add('hidden');
            authName.removeAttribute('required');
            modalTitle.textContent = 'Sign In with Email';
            submitBtn.textContent = 'Sign In';
            toggleLink.textContent = 'Sign Up';
        }
    }

    async handleEmailAuth(event) {
        event.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const name = document.getElementById('auth-name').value;
        const errorMsg = document.getElementById('auth-error-msg');
        const submitBtn = document.getElementById('auth-submit-btn');

        errorMsg.textContent = '';
        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing... ⏳';

        try {
            if (this._emailAuthMode === 'signup') {
                await signUpWithEmailAndPassword(email, password, name);
            } else {
                await loginWithEmailAndPassword(email, password);
            }
            this.closeEmailAuthModal();
            window.location.reload();
        } catch (e) {
            console.error('Email authentication failed:', e);
            let userFriendlyMsg = e.message;
            if (e.code === 'auth/invalid-credential' || e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password') {
                userFriendlyMsg = 'Incorrect email or password.';
            } else if (e.code === 'auth/email-already-in-use') {
                userFriendlyMsg = 'This email is already registered. Try logging in.';
            } else if (e.code === 'auth/weak-password') {
                userFriendlyMsg = 'Password should be at least 6 characters.';
            } else if (e.code === 'auth/invalid-email') {
                userFriendlyMsg = 'Please enter a valid email address.';
            }
            errorMsg.textContent = userFriendlyMsg;
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    }

    async logout() {
        if (this.auth) {
            try { await logout(); } catch (e) {}
        }
        // Fix: We must clear local progress on explicit sign out to prevent data leaking to the next account
        clearLocalProgress(this.appId);
        // Set flag to prevent beforeunload from re-saving RAM data to localStorage during logout reload
        window._isLoggingOut = true;
        window.location.reload();
    }

    async resetData() {
        if (confirm("⚠️ Are you sure you want to completely RESET ALL your progress data? This cannot be undone!")) {
            clearLocalProgress(this.appId);
            if (this.auth && this.state.uid) {
                try {
                    await saveProgress(this.appId, this.state.uid, getDefaultProgressObj());
                } catch (e) {
                    console.warn("Failed to reset firebase.", e);
                }
            }
            window.location.reload();
        }
    }

    async _onAuth(user, callbacks) {
        const prevUid = this.state.uid;
        this.state.uid = user?.uid || null;

        if (prevUid !== null && this.state.uid !== null && prevUid !== this.state.uid) {
            clearLocalProgress(this.appId);
            window.location.reload();
            return;
        }

        if (this._hasBootedAuth && prevUid === null && this.state.uid !== null) {
            window.location.reload();
            return;
        }

        this._hasBootedAuth = true;

        if (user) {
            console.log('✅ User signed in:', user.email);
            document.getElementById('sync-status').textContent = '☁️ Cloud Sync Active';

            try {
                // Only merge local data if it actually belongs to this user
                const safeLocal = getLocalProgressForUser(this.appId, user.uid);
                const remote = await loadProgress(this.appId, user.uid);
                this.state.data = mergeProgress(safeLocal, remote);
                // Tag localStorage with the current user's UID
                saveLocalProgress(this.appId, this.state.data, user.uid);
            } catch (e) {
                console.warn('⚠️ Failed to load cloud progress:', e);
                // WP-035: Show toast when cloud data cannot be loaded
                this._showToast('⚠️ Could not load cloud data. Using local progress.');
            }
        } else {
            console.log('📱 Using offline mode');
            document.getElementById('sync-status').textContent = '💾 Local Mode';
            this.state.data = getLocalProgress(this.appId);
        }

        // Execute callbacks (applyTheme, renderAuthUI, initEngines, etc.)
        if (callbacks) {
            for (const cb of callbacks) {
                if (typeof cb === 'function') cb();
            }
        }
    }

    renderAuthUI() {
        const sync = document.getElementById('sync-status');
        const login = document.getElementById('login-btn');
        const loginEmail = document.getElementById('login-email-btn');
        const info = document.getElementById('user-info');

        if (!login || !info) return;

        if (this.state.uid && this.auth?.currentUser) {
            if (sync) sync.textContent = '☁️ Cloud Sync Active';
            login.classList.add('hidden');
            if (loginEmail) loginEmail.classList.add('hidden');
            info.classList.remove('hidden');

            const avatar = document.getElementById('user-avatar');
            const name = document.getElementById('user-name');
            if (avatar) {
                avatar.src = this.auth.currentUser.photoURL || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%2364748b\'><path d=\'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z\'/></svg>';
            }
            if (name) name.textContent = this.auth.currentUser.displayName || this.auth.currentUser.email || 'Email User';
        } else {
            if (sync) sync.textContent = '💾 Local Mode';
            login.classList.remove('hidden');
            if (loginEmail) loginEmail.classList.remove('hidden');
            info.classList.add('hidden');
        }
    }
}
