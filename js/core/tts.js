const audioCtx = typeof window !== 'undefined' && window.AudioContext
    ? new (window.AudioContext || window.webkitAudioContext)()
    : null;

export const cleanTextForAudio = (text) => {
    if (!text) return '';
    return text
        // Remove explicit grammar labels like Präsens, Präteritum, Partizip II, Futur I
        .replace(/Präsens|Präteritum|Partizip\s*(II|2)?|Futur\s*(I|1)?/gi, '')
        // Remove all parenthetical content e.g. (Präsens), (Partizip II), (with 'sein' for movement)
        .replace(/\([^)]*\)/g, '')
        // Remove all square bracket content
        .replace(/\[[^\]]*\]/g, '')
        // Remove leftover dash artifacts
        .replace(/[\s,]*[-–—]\s*[a-zäöüß¨]*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
};

let germanVoice = null;
let englishVoice = null;

export const setVoices = () => {
    if (!window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;

    // Helper to score voice quality (higher score = more natural / human-like)
    const scoreVoice = (v, preferredLangPrefix) => {
        const langLower = (v.lang || '').toLowerCase();
        if (!langLower.startsWith(preferredLangPrefix)) return -1;
        let score = 10;
        const name = (v.name || '').toLowerCase();

        if (name.includes('natural') || name.includes('online')) score += 50;
        if (name.includes('google')) score += 40;
        if (name.includes('premium') || name.includes('enhanced')) score += 30;
        if (name.includes('samantha') || name.includes('alex') || name.includes('daniel') || name.includes('karen')) score += 20;
        if (name.includes('zira') || name.includes('jenni') || name.includes('guy') || name.includes('aria')) score += 15;
        if (name.includes('desktop')) score -= 20; // Penalize legacy SAPI5 Windows Desktop voices (David, Mark)
        if (v.localService === false) score += 10; // Web-synthesized neural voices are smoother

        return score;
    };

    const englishVoices = voices
        .map(v => ({ voice: v, score: scoreVoice(v, 'en') }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score);

    const germanVoices = voices
        .map(v => ({ voice: v, score: scoreVoice(v, 'de') }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score);

    if (englishVoices.length > 0) {
        englishVoice = englishVoices[0].voice;
        console.log('🎙️ Selected English Voice:', englishVoice.name);
    }
    if (germanVoices.length > 0) {
        germanVoice = germanVoices[0].voice;
        console.log('🎙️ Selected German Voice:', germanVoice.name);
    }
};

if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = setVoices;
    setVoices();
}

export const speak = (text, lang = 'de') => {
    if (window.verbsEngine && window.verbsEngine.stopAudioQueue) {
        window.verbsEngine.stopAudioQueue();
    }
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const clean = cleanTextForAudio(text);
    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = lang === 'de' ? 'de-DE' : 'en-US';
    
    if (lang === 'de' && germanVoice) {
        utterance.voice = germanVoice;
    } else if (lang === 'en' && englishVoice) {
        utterance.voice = englishVoice;
    }
    utterance.rate = lang === 'en' ? 0.95 : 0.85;

    window.speechSynthesis.speak(utterance);
};

export const playChime = (frequency = 600, duration = 150) => {
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration / 1000);
        osc.start();
        osc.stop(audioCtx.currentTime + duration / 1000);
    } catch (e) {
        // Silent fail for browsers without Web Audio
    }
};

class SpeechQueueClass {
    constructor() {
        this.queue = [];
        this.currentIndex = 0;
        this.isPlaying = false;
        this.onHighlightCallback = null;
        this.onFinishedCallback = null;
        this.currentUtterance = null;
        this._watchdogTimer = null;
        this._speakDelayTimer = null;
    }

    playAll(items, onHighlight, onFinished) {
        this.stop();

        if (!items || items.length === 0) return;

        this.queue = items;
        this.currentIndex = 0;
        this.isPlaying = true;
        this.onHighlightCallback = onHighlight;
        this.onFinishedCallback = onFinished;

        this._speakCurrent();
    }

    _speakCurrent() {
        if (!this.isPlaying || this.currentIndex >= this.queue.length) {
            const cb = this.onFinishedCallback;
            this.stop();
            if (cb) cb();
            return;
        }

        const item = this.queue[this.currentIndex];
        
        // Notify highlight callback
        if (this.onHighlightCallback) {
            this.onHighlightCallback(this.currentIndex, item);
        }

        if (!window.speechSynthesis) {
            setTimeout(() => {
                this.currentIndex++;
                this._speakCurrent();
            }, 1500);
            return;
        }

        if (this._watchdogTimer) {
            clearTimeout(this._watchdogTimer);
            this._watchdogTimer = null;
        }

        window.speechSynthesis.cancel();

        this._speakDelayTimer = setTimeout(() => {
            if (!this.isPlaying) return;

            const itemLang = item.lang || 'de';
            const rawText = item.text || item.de || item;
            const clean = cleanTextForAudio(rawText);

            if (!clean) {
                this.currentIndex++;
                this._speakCurrent();
                return;
            }

            const utterance = new SpeechSynthesisUtterance(clean);
            utterance.lang = itemLang === 'en' ? 'en-US' : 'de-DE';

            if (itemLang === 'en' && englishVoice) {
                utterance.voice = englishVoice;
            } else if (itemLang !== 'en' && germanVoice) {
                utterance.voice = germanVoice;
            }
            utterance.rate = itemLang === 'en' ? 0.92 : 0.85;

            utterance.onend = () => {
                if (this.currentUtterance === utterance) {
                    if (this._watchdogTimer) { clearTimeout(this._watchdogTimer); this._watchdogTimer = null; }
                    this.currentUtterance = null;
                    this.currentIndex++;
                    this._speakCurrent();
                }
            };

            utterance.onerror = (e) => {
                if (e.error === 'interrupted' || e.error === 'canceled') return;
                console.warn('SpeechQueue: Speech error occurred', e.error);
                if (this.currentUtterance === utterance) {
                    if (this._watchdogTimer) { clearTimeout(this._watchdogTimer); this._watchdogTimer = null; }
                    this.currentUtterance = null;
                    this.currentIndex++;
                    this._speakCurrent();
                }
            };

            this.currentUtterance = utterance;
            window.speechSynthesis.speak(utterance);

            this._watchdogTimer = setTimeout(() => {
                if (this.isPlaying && this.currentUtterance === utterance) {
                    console.warn('SpeechQueue: Watchdog fired — advancing.');
                    window.speechSynthesis.cancel();
                    this.currentUtterance = null;
                    this.currentIndex++;
                    this._speakCurrent();
                }
            }, 12000);
        }, 250);
    }

    speakSingle(text, lang = 'de') {
        this.stop();
        speak(text, lang);
    }

    stop() {
        this.isPlaying = false;
        this.queue = [];
        this.currentIndex = 0;
        this.currentUtterance = null;

        if (this._speakDelayTimer) {
            clearTimeout(this._speakDelayTimer);
            this._speakDelayTimer = null;
        }

        if (this._watchdogTimer) {
            clearTimeout(this._watchdogTimer);
            this._watchdogTimer = null;
        }

        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    }

    pause() {
        this.isPlaying = false;
        this.currentUtterance = null;
        if (this._speakDelayTimer) {
            clearTimeout(this._speakDelayTimer);
            this._speakDelayTimer = null;
        }
        if (this._watchdogTimer) {
            clearTimeout(this._watchdogTimer);
            this._watchdogTimer = null;
        }
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    }

    resume() {
        if (!this.isPlaying && this.queue.length > 0 && this.currentIndex < this.queue.length) {
            this.isPlaying = true;
            this._speakCurrent();
        }
    }
}

export const SpeechQueue = new SpeechQueueClass();