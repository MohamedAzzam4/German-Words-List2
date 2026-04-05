# Antigravity Memory - Handover Document

**Date:** 2026-04-04  
**Project:** German Vocabulary App (B2 Level & TTS logic)  
**Agent:** Antigravity

This document outlines the attempts, logic, and failures encountered while trying to resolve the B2 unit grouping layout and the Text-To-Speech (TTS) engine bugs. Please use this to avoid repeating my mistakes.

## 1. Issue: B2 Grouping & Chapter 10 Anomaly
**The Goal:** The UI architecture correctly requires Chapters to be visually grouped in the sidebar. Each chapter in the "Aspekte B2" book typically has 7 modules: `[Auftakt, Modul 1, Modul 2, Modul 3, Modul 4, Porträt, Grammatik]`.

**The Problem:** `RAW_B2_DATA` contains exactly 68 numbered units. Mathematically, 10 chapters × 7 modules = 70 modules. Because `RAW_B2_DATA` ends at 68, the mapping broke completely in Chapter 10.
- Unit 68 in the raw data contains words like *angesichts* and *ausprobieren*, which belong to **Kapitel 10: Grammatik**.

**My Attempts & Errors:**
- **Attempt 1 (Math Modulo):** I blindly mapped the 68 items using `index % 7`. This caused item 68 to be incorrectly named `"Kapitel 10: Modul 4"` in the UI, even though it held Grammatik words. 
- **Attempt 2 (Forced 70 Slots & Remapping):** To fix Attempt 1, I noticed Chapter 10 mathematically lacked `Modul 4` and `Porträt` entirely in the raw array. I intercepted `parseRawB2Data` so that when it read ID `68`, it remapped it to slot `70` (Grammatik). I rendered all 70 slots so the UI would display the Chapter 10 sequence perfectly from Auftakt to Grammatik.
- **The Failure:** The user explicitly complained: *"you actually made the same structure but module 4 and Porträt are empty"*. The user does NOT want empty placeholder slots, nor do they want misnamed slots. 

**Next AI Advice for B2 Grouping:**
- The raw dataset provided (`RAW_B2_DATA`) only has 68 elements. You need to clarify with the user if they expect you to computationally shift the array items (perhaps some chapters in `1-9` have fewer than 7 sub-items?), or if the data actually combines `Modul 4/Porträt/Grammatik` together in ID 68. 
- Do NOT generate phantom empty modules (68 and 69) just to satisfy the visual 7-item loop design for Chapter 10.

---

## 2. Issue: Text-to-Speech (TTS) English Guessing Bias
**The Goal:** The TTS engine (`js/core/tts.js`) often reads the German flashcards using an English pronunciation engine ("guessing"), which ruins the learning experience. The goal was strictly to eliminate English.

**The Problem:** Browsers (especially Chromium) load their `speechSynthesis.getVoices()` asynchronously. If `speak()` is triggered before voices load, the engine falls back to the OS default (which is English for this user).

**My Attempts & Errors:**
- **Attempt 1:** Standard locale forcing (`utterance.lang = 'de-DE'`) and basic matching.
- **Attempt 2:** Implemented the user's provided snippet (`setGermanVoice`) that hooks into `window.speechSynthesis.onvoiceschanged` and actively searches for `de-DE` or `de`.
- **Attempt 3 (Aggressive Blocking):** Created a `setInterval` loop to wait `150ms` for `getVoices()` to stop returning an empty array before firing `window.speechSynthesis.speak()`. Furthermore, I explicitly blocked `speak()` from triggering AT ALL if `germanVoice` was evaluated to `null`.
- **The Failure:** The user reported *"the voice is not working well"* and still guessing in English. 

**Next AI Advice for TTS:**
- The strict blocking logic and `onvoiceschanged` logic is failing. It's highly probable that `v.lang` on the user's OS doesn't match `'de-DE'` strictly, or the system's German voice requires a completely different lookup parameter. 
- Web Speech API's `speechSynthesis.cancel()` at the top of the `speak()` function can sometimes randomly mute the API entirely on certain Chromium builds if repeated rapidly.
- Consider discarding the complex `setGermanVoice()` caching object entirely. Simply try applying `utterance.lang = 'de-DE'` natively and instruct the user to ensure Windows Settings actually has a German TTS language pack installed, as Chromium will force-fallback to English if the OS natively lacks the package, bypassing ANY Javascript logic we write.

Good luck!
- Antigravity
