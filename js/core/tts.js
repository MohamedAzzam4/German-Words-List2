const audioCtx = typeof window !== 'undefined' && window.AudioContext
    ? new (window.AudioContext || window.webkitAudioContext)()
    : null;

export const cleanTextForAudio = (text) => {
    if (!text) return '';
    return text
        // استخدام وظيفة التنظيف (التي تزيل الأقواس وعلامات الجمع) قبل النطق
        .replace(/\([^)]*\)/g, '')
        .replace(/[\s,]*[-–—]\s*(n|en|¨|s|e|r|m)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
};

let germanVoice = null;

const setGermanVoice = () => {
    if (!window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    germanVoice = voices.find(v => v.lang === 'de-DE' || v.lang === 'de_DE')
               || voices.find(v => v.lang.startsWith('de'))
               || null;
};

if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = setGermanVoice;
    setGermanVoice();
}

export const speak = (text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    if (window.app && window.app.userData) {
        window.app.userData.ttsCount = (window.app.userData.ttsCount || 0) + 1;
        if (window.app._save) window.app._save();
    }

    const clean = cleanTextForAudio(text);
    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'de-DE';
    if (germanVoice) utterance.voice = germanVoice;
    utterance.rate = 0.85;

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