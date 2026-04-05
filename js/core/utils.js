export const parseVocabularyRow = (row, format = 'standard') => {
    // row: [de, en, type, context] or B2 format with embedded context
    let [de, en, type, context] = row;

    // B2 format: context embedded in de field like "die Maßnahme(-n) (Mist bauen)"
    if (format === 'context' && de?.includes('(') && !context) {
        const match = de.match(/^(.+?)\s*\(([^)]+)\)$/);
        if (match) {
            de = match[1].trim();
            context = match[2];
        }
    }

    // Fallback empty type
    if (!type || type.trim() === '') type = 'Vocab';

    return {
        id: `${de?.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).substr(2, 5)}`,
        de: de?.trim() || '',
        en: en?.trim() || '',
        type: type?.trim() || 'Vocab',
        context: context?.trim() || ''
    };
};

export const debounce = (func, wait = 300) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};

export const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toISOString().split('T')[0];
};

export const isToday = (dateString) => {
    const today = new Date();
    const d = new Date(dateString);
    return d.toDateString() === today.toDateString();
};