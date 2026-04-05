// template.config.js - Copy this for A2/B1 development
export const levelConfig = {
    // ⚠️ CHANGE THIS for each new level to isolate Firebase data
    appId: 'german-[LEVEL]-app', // e.g., 'german-a2-app'

    // UI Labels
    levelTitle: '📚 [LEVEL] German',
    levelSubtitle: '[Textbook/Series Name]',
    progressLabel: 'Overall [LEVEL] Progress',
    sectionLabel: '[Unit/Module]',

    // Optional: Chapter grouping (like B2) or flat list (like A1)
    // chapterGroups: [ { start: 0, title: 'Chapter 1' }, ... ],
    sectionLabels: [ /* Array of unit/module topic names */],

    // Type filters (customize per level needs)
    typeFilters: [
        { value: 'all', label: '🔍 All Word Types' },
        { value: 'v', label: '🏃‍♂️ Verbs' },
        { value: 'n', label: '📦 Nouns' },
        { value: 'a', label: '✨ Adjectives' },
        // Add/remove as needed
    ],

    // Vocabulary: Array of units/modules
    vocabulary: [
        // Each unit/module is an array of word objects:
        // { id: 'unique', de: 'German', en: 'English', type: 'v|n|a|e|etc', context: 'Example' }
        // ⚠️ For testing: 1-2 items per unit. Inject full data offline.
        [
            { id: 'test-word', de: 'das Beispiel', en: 'example', type: 'n', context: 'Das ist ein Beispiel.' }
        ],
        // ... more units
    ],

    // Parsing rules (choose 'standard' or 'context')
    parseRules: {
        format: 'standard', // or 'context' for embedded examples
        extractContext: null // or regex like /\s*\(([^)]+)\)\s*$/
    },

    // UI overrides (optional)
    uiOverrides: {
        // Example customizations
    }
};