// N-gram prediction service
// Learns from tile presses and predicts next tiles instantly (zero network latency)

const STORAGE_KEY = 'aac_ngram_v1';
const SAVE_DELAY_MS = 2000;

let _bigrams: Record<string, Record<string, number>> = {};
let _trigrams: Record<string, Record<string, number>> = {};
let _unigrams: Record<string, number> = {};
let _tileLabels: Set<string> = new Set();
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

export function setTileLabels(labels: string[]) {
    _tileLabels = new Set(labels.map(l => l.toUpperCase()));
}

export function learnWord(word: string, prevWord?: string, prev2Word?: string) {
    const w = word.toUpperCase().trim();
    if (!w) return;

    _unigrams[w] = (_unigrams[w] || 0) + 1;

    if (prevWord) {
        const pw = prevWord.toUpperCase().trim();
        if (pw) {
            if (!_bigrams[pw]) _bigrams[pw] = {};
            _bigrams[pw][w] = (_bigrams[pw][w] || 0) + 1;
        }

        if (prev2Word) {
            const p2w = prev2Word.toUpperCase().trim();
            if (p2w) {
                const key = `${p2w}|${pw}`;
                if (!_trigrams[key]) _trigrams[key] = {};
                _trigrams[key][w] = (_trigrams[key][w] || 0) + 1;
            }
        }
    }

    _scheduleSave();
}

export function getSuggestions(pressedTileTexts: string[], count: number = 5): string[] {
    const words = pressedTileTexts.map(t => t.toUpperCase().trim()).filter(Boolean);
    const candidates: Record<string, number> = {};

    // Trigram (last 2 pressed tiles -> next)
    if (words.length >= 2) {
        const key = `${words[words.length - 2]}|${words[words.length - 1]}`;
        const tri = _trigrams[key];
        if (tri) {
            for (const w in tri) candidates[w] = (candidates[w] || 0) + tri[w] * 3;
        }
    }

    // Bigram (last pressed tile -> next)
    if (words.length >= 1) {
        const bi = _bigrams[words[words.length - 1]];
        if (bi) {
            for (const w in bi) candidates[w] = (candidates[w] || 0) + bi[w] * 2;
        }
    }

    // Fallback: top unigrams
    if (Object.keys(candidates).length === 0) {
        const uniSorted = Object.entries(_unigrams).sort((a, b) => b[1] - a[1]);
        for (const [w] of uniSorted) {
            if (_tileLabels.has(w)) candidates[w] = _unigrams[w];
            if (Object.keys(candidates).length >= count * 2) break;
        }
    }

    const inputSet = new Set(words);
    return Object.entries(candidates)
        .sort((a, b) => b[1] - a[1])
        .map(([w]) => w)
        .filter(w => _tileLabels.has(w) && !inputSet.has(w))
        .slice(0, count);
}

function _scheduleSave() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_save, SAVE_DELAY_MS);
}

function _save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ b: _bigrams, t: _trigrams, u: _unigrams }));
    } catch (e) {
        console.warn('ngramService: failed to save', e);
    }
}

export function loadModel() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        _bigrams = data.b || {};
        _trigrams = data.t || {};
        _unigrams = data.u || {};
    } catch (e) {
        console.warn('ngramService: failed to load', e);
    }
}
