Here is a comprehensive, up-to-date `memory.md` that captures the entire project state, architecture, resolved issues, and future directives. You can save this file to maintain perfect context for any future AI sessions.

---

# 📘 German Mastery App - Project Memory & Context

## 🎯 Project Overview
A multi-level German language learning ecosystem hosted on **GitHub Pages**. Built with **vanilla HTML/CSS/JavaScript** (no frameworks) to maintain a lightweight, zero-build footprint. Uses a **Single Page Application (SPA)** feel per level, connected via a central portal. Progress syncs across devices using **Firebase Firestore + Google Authentication**.

**Current Status:**
- ✅ **A1** (Menschen A1): Fully functional (24 Units)
- ✅ **B2** (Aspekte B2): Fully functional (68 Modules, auto-grouped by Kapitel)
- 🚧 **A2/B1**: Planned (will reuse 95% of existing architecture)

---

## 🏗️ Architecture & File Structure
```
/ (GitHub Pages Root)
├── index.html                 # Level selection portal
├── A1.html                    # A1 Shell (Blue Theme)
├── B2.html                    # B2 Shell (Purple Theme)
├── css/
│   └── core.css               # Shared UI, exact original variables, [data-theme="dark"]
├── js/
│   ├── core/
│   │   ├── app.js             # Thin orchestrator (~130 lines), exposes `window.app`
│   │   ├── glossary.js        # Table rendering, hide/reveal, filters, TTS binding
│   │   ├── flashcards.js      # Queue, 3D flip, shuffle, face-swap, learning queue
│   │   ├── quiz.js            # Dynamic noun extraction, der/die/das scoring
│   │   ├── trophies.js        # 34-trophy engine, multi-earn, cross-level, toasts
│   │   ├── tts.js             # de-DE voice enforcement, regex cleanup, Web Audio chimes
│   │   ├── firebase.js        # Auth + Firestore (parameterized by appId)
│   │   ├── storage.js         # localStorage fallback + merge logic
│   │   └── utils.js           # Parsers, debounce, formatters
│   └── levels/
│       ├── a1.config.js       # Parses pipe-delimited A1 strings
│       ├── b2.config.js       # Parses pipe-delimited B2 strings, auto-grouping rule
│       └── template.config.js # Blueprint for A2/B1
└── assets/                    # (Optional) Custom sounds/icons
```

---

## 🗄️ Data & Storage Strategy
### Firebase Firestore Schema
- **Path:** `/artifacts/{appId}/users/{userId}/progress/main`
- **Isolation:** Each level uses a unique `appId` (`german-a1-app`, `german-b2-app`) to prevent cross-contamination.
- **Sync Logic:** `{ merge: true }` ensures cloud/local states merge safely without overwrites.
- **Security Rules:** Wildcard `{appId}` supports infinite future levels without rule updates.
```javascript
match /artifacts/{appId}/users/{userId}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

### Document Structure
```json
{
  "known": ["word-id-1", "word-id-2"],
  "trophyCounts": { "first_steps": 1, "bro_studied": 2 },
  "sessionsCompleted": 15,
  "darkMode": true,
  "ttsCount": 42,
  "columnHideCount": 8,
  "darkModeToggleCount": 3,
  "studyDates": ["2024-05-01", "2024-05-02"],
  "flashcardErrors": { "word-id-1": 3 },
  "lastUpdated": "2024-05-02T19:00:00.000Z"
}
```

---

## ⚙️ Core Features & Implementation Status
| Feature | Status | Notes |
|---------|--------|-------|
| **Glossary View** | ✅ | Column hiding (articles/EN/DE/mixed), type filtering, TTS per row/unit, active recall |
| **Flashcards** | ✅ | 3D flip, shuffle, face-swap (DE/EN), "Still Learning" queue (pushes failures to end), session tracking |
| **Article Quiz** | ✅ | Dynamic `der/die/das` extraction, scoring, unit-switch preservation |
| **Dashboard** | ✅ | Stats cards, unit/module breakdown with progress bars |
| **Trophy System** | ✅ | 34 trophies, 4 tiers, multi-earn support, cross-level "Portal Walker", audio chimes, secret trophies |
| **Auth & Sync** | ✅ | Google Sign-In, Firestore `{merge:true}`, localStorage fallback, offline-first |
| **Dark Mode** | ✅ | `data-theme` attribute toggle, state persisted across devices |
| **TTS Engine** | ✅ | Strict `de-DE` enforcement, regex cleanup, Web Audio chimes |
| **View Preservation** | ✅ | Switching units maintains current view (Glossary/Flashcard/Quiz) |
| **Responsive Layout** | ✅ | Mobile sidebar toggle, exact original UI preserved |

---

## 🔧 Configuration & Data Parsing
### Data Format
Vocabulary is stored as **pipe-delimited strings inside backtick templates** to prevent syntax crashes from quotes or missing fields.
```javascript
const RAW_DATA = `
1|e|Hallo!|Hello!|Hallo, ich bin Anna.|Hello, I am Anna.
3||die Vorstellung, -en|presentation|Meine Vorstellung von Heimat ist...|My idea of home is...
`;
```

### Parsing Logic
- `parseRawData()` / `parseRawB2Data()` converts strings to structured objects at runtime.
- Handles empty type fields (defaults to `"Vocab"`), embedded context, and bilingual examples.
- Generates unique IDs: `a1-1-hallo-xyz12` or `b2-3-vorstellung-abc99`.

### Auto-Grouping (B2)
- Replaced hardcoded `chapterGroups` with dynamic calculation.
- Config uses `modulesPerChapter: 8` → auto-generates "Kapitel 1", "Kapitel 2", etc.
- Scales automatically to any module count. Zero maintenance.

---

## 🎨 UI/UX & Styling Rules
- **Exact Pixel Match:** All original IDs, classes, and layout structures preserved.
- **Theming:** CSS variables via `:root` and `[data-theme="dark"]`. A1 uses blue (`#2563eb`), B2 uses purple (`#8b5cf6`).
- **Navigation:** `window.app.switchView()` toggles `.hidden` class. Sidebar grouping matches original chapter/module hierarchy.
- **Interactive Elements:** Hide/reveal uses `.hidden-word` class. Flashcards use `.flipped` transform. Trophies use `.earned` and `.secret-locked` states.
- **Toasts:** `#toast` slides up with `.show` class, auto-hides after 4s.

---

## 🛡️ Security & Deployment
- **Local Development:** Requires HTTP server (`Live Server`, `python -m http.server`, or `npx serve`). **ES6 modules and Firebase Auth fail on `file://`**.
- **GitHub Pages:** Deploy from `main` branch → `/` root. Auto-deploys on push.
- **Firebase Config:** Must paste actual config object into `app.js`. Placeholder currently present.
- **Authorized Domains:** `localhost`, `mohamedazzam4.github.io` (and any custom domain) must be added to Firebase Console → Auth → Settings.

---

## ✅ Resolved Issues & Technical Debt
| Issue | Resolution |
|-------|------------|
| `file://` CORS/Module errors | Enforced local server requirement; added clear console warnings |
| B2 loading A1 config | Fixed `data-level="b2"` attribute in script tag; added config validation |
| Hardcoded chapter groups | Replaced with `modulesPerChapter` auto-calculation |
| Data parsing crashes | Switched to backtick templates + robust `.split('|')` parser |
| Dark mode crashes | Null-safe state initialization (`state.data = getLocalProgress(appId)`) |
| Trophy multi-earn loops | Fixed threshold comparison against `trophyCounts` dictionary |
| View reset on unit switch | Implemented context preservation in `switchUnit()` |
| Firebase config missing | Added clear placeholder + step-by-step retrieval instructions |

---

## 🚀 Future Roadmap & AI Instructions
1. **A2.html & B1.html Development:**
   - Replicate B2 shell structure.
   - Set unique `appId` (e.g., `german-a2-app`).
   - Adjust `modulesPerChapter` or keep flat list depending on textbook structure.
   - Include full trophy system (shared IDs, level-specific thresholds).

2. **Data Ingestion:**
   - Always expect pipe-delimited strings in backticks.
   - Parse safely; default missing types to `"Vocab"`.
   - Generate 1-2 test items per unit; allow user to inject full datasets offline.

3. **Voice Forcing:**
   - Strictly enforce `de-DE` in TTS: `voices.find(v => v.lang === 'de-DE') || voices.find(v => v.lang.startsWith('de'))`.
   - Always run `cleanTextForAudio()` before `speechSynthesis.speak()`.

4. **Token Economy:**
   - Do not generate massive vocabulary arrays in responses.
   - Provide structural configs; let user paste raw data.

5. **Cross-Level Features:**
   - "Portal Walker" trophy must read from other level's Firestore doc using `getOtherLevelProgress()`.
   - Maintain `{ merge: true }` for seamless offline/online sync.

---

## 🔑 Key Constants & Conventions
- **App ID Format:** `german-{level}-app` (lowercase, hyphenated)
- **Word Type Codes:** `v` (verb), `n` (noun), `a` (adjective), `e` (expression), `d` (adverb), `p` (pronoun/prep), `Vocab` (default)
- **State Keys:** `known`, `trophyCounts`, `sessionsCompleted`, `darkMode`, `ttsCount`, `columnHideCount`, `darkModeToggleCount`, `studyDates`, `flashcardErrors`
- **CSS Theme Toggle:** `document.documentElement.setAttribute('data-theme', 'dark' | 'light')`
- **Module Entry Point:** `<script type="module" src="js/core/app.js" data-level="a1"></script>` (attribute is critical)

---
*Last Updated: [Current Date]*  
*Status: A1/B2 Production-Ready | A2/B1 Pending*  
*Next Action: User to paste full vocabulary datasets & deploy to GitHub Pages*