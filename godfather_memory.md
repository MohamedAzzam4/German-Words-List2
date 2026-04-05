⚠️ ATTENTION AI ASSISTANT ⚠️

CRITICAL CONTEXT DOCUMENT: READ COMPLETELY BEFORE MODIFYING CODE

You are assisting with a multi-level German Language Mastery Application. The user is migrating from a monolithic Single-Page Application (SPA) into a config-driven modular architecture (HTML, CSS, and JS split into separate folders like core/, levels/, css/).

Previous AI agents have repeatedly failed this project by truncating the UI/UX CSS, breaking the German Text-to-Speech (TTS), and failing to parse B2-level data correctly. You MUST adhere to the exact implementations detailed below. Do not reinvent or skip these solutions.

1. PRESERVING THE UI/UX DESIGN

Problem: Previous agents truncated the CSS or replaced the custom UI with generic frameworks due to context length limits, ruining the user interface.
Mandate: You MUST preserve the exact CSS variable structure and class methodology. Do not summarize the CSS.

The Required Theme Variables (Do not alter)

The app uses a specific light/dark theme system. All elements must reference these variables:

:root {
    --bg: #f8fafc; --surface: #ffffff; --surface-hover: #f1f5f9;
    --text-main: #0f172a; --text-muted: #64748b;
    --primary: #8b5cf6; --primary-hover: #7c3aed; /* B2 Purple. A1 uses Blue #2563eb */
    --success: #22c55e; --warning: #f59e0b;
    --border: #e2e8f0; --hide-bg: #cbd5e1;
    --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    --header-bg: #1e293b; --header-text: #ffffff;
}

[data-theme="dark"] {
    --bg: #0f172a; --surface: #1e293b; --surface-hover: #334155;
    --text-main: #f8fafc; --text-muted: #94a3b8;
    --primary: #a78bfa; --primary-hover: #c4b5fd;
    --success: #22c55e; --warning: #fbbf24;
    --border: #334155; --hide-bg: #475569;
    --header-bg: #020617;
}


Flashcard 3D CSS (Must remain intact)

The 3D flip animation is a core feature. Do not remove preserve-3d or backface-visibility.

.flashcard-inner { position: relative; width: 100%; height: 100%; text-align: center; transition: transform 0.6s; transform-style: preserve-3d; border-radius: 12px; box-shadow: var(--shadow); }
.flashcard.flipped .flashcard-inner { transform: rotateY(180deg); }
.flashcard-front, .flashcard-back { position: absolute; width: 100%; height: 100%; backface-visibility: hidden; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 24px; background-color: var(--surface); border-radius: 12px; border: 1px solid var(--border); }
.flashcard-back { transform: rotateY(180deg); background-color: var(--surface-hover); overflow-y: auto; }


2. PARSING B2 VOCABULARY DATA

Problem: B2 data differs from A1. The Type column is missing (empty between pipes ||), and contextual usage examples are embedded directly into the German word string inside parentheses (e.g., der Mist (Sg.) (Mist bauen)).
Mandate: You MUST use the exact parsing function below to prevent UI breakage and TTS errors.

Required Parsing Logic (utils.js or b2.config.js)

export function parseB2Data(rawArray) {
    return rawArray.map((str, index) => {
        const parts = str.split('|');
        
        // 1. Handle Missing Type: Fallback to 'Vocab' if the type field (parts[1]) is empty
        const tType = parts[1].trim() !== '' ? parts[1].trim() : 'Vocab';
        
        let rawDe = parts[2]; 
        let deMain = rawDe; 
        let deContext = "";

        // 2. Smart Context Extraction
        // Matches trailing parentheses containing a space (multi-word context like "(Mist bauen)")
        // Ignores simple grammatical markers like "(Sg.)" or "(Pl.)"
        const contextRegex = /\s*\(([^)]+\s+[^)]+)\)$/;
        const match = rawDe.match(contextRegex);
        
        if (match && !match[1].includes("Sg.") && !match[1].includes("Pl.")) {
            deContext = "(" + match[1] + ")"; 
            // Remove context from the main word so the TTS doesn't read the whole sentence
            deMain = rawDe.replace(contextRegex, '').trim();
        }

        return { 
            id: index, 
            unit: parseInt(parts[0], 10), 
            type: tType, 
            de: deMain,             // Clean word (e.g., "der Mist (Sg.)")
            deContext: deContext,   // Extracted context (e.g., "(Mist bauen)")
            en: parts[3], 
            exDe: parts[4], 
            exEn: parts[5] 
        };
    });
}


UI Note: When rendering the deContext, it must be placed underneath deMain in a <div style="font-size: 0.85rem; color: var(--text-muted);"> wrapper.

3. STRICT GERMAN TTS ENFORCEMENT

Problem: Browsers default to an English accent when reading German text if the voice is not strictly enforced. Previous agents used generic speechSynthesis.speak() which fails.
Mandate: You MUST implement the strict voice targeting and text-cleaning logic below.

Required TTS Logic (tts.js or core app logic)

let germanVoice = null;
const speechSynth = window.speechSynthesis;

// 1. Force the browser to find the specific German locale
export function setGermanVoice() {
    const voices = speechSynth.getVoices();
    // Priority 1: Strict de-DE. Priority 2: Any 'de' prefix (Austrian, Swiss).
    germanVoice = voices.find(v => v.lang === 'de-DE' || v.lang === 'de_DE') 
               || voices.find(v => v.lang.startsWith('de')) 
               || null;
}

// 2. Clean grammatical markers so the TTS doesn't read them aloud
export function cleanTextForAudio(text) {
    let cleaned = text.replace(/,\s*-[^a-zA-Z0-9]*[a-zA-Z]*/g, ''); // Removes ", -n" or ", -¨e"
    return cleaned.replace(/\s*\(\d+\)/g, ''); // Removes numeric IDs
}

// 3. The exact speak function
export function speak(text) {
    if (!speechSynth) return;
    speechSynth.cancel(); 
    
    const utterance = new SpeechSynthesisUtterance(cleanTextForAudio(text));
    
    // Explicitly force the language code
    utterance.lang = 'de-DE';
    
    // Attach the locked voice profile
    if (germanVoice) {
        utterance.voice = germanVoice;
    }
    
    utterance.rate = 0.85; // Slower rate for clear language learning
    speechSynth.speak(utterance);
}

// Ensure voices load correctly across different browsers
speechSynth.onvoiceschanged = setGermanVoice;


4. ARCHITECTURE & FIREBASE STATE

When migrating this logic into modular files, maintain the exact Firebase structure:

Firestore Path: artifacts/{appId}/users/{userId}/progress/main

Ensure each level config exports its unique appId (e.g., german-a1-app, german-b2-app) so user progress does not overwrite itself across levels.

The userData object contains: known (array), trophies (array), sessionCount, ttsCount, hideCount, exampleCount, demotedCount, streak, and lastStudyDate. Do not drop these gamification trackers during the modular migration.