// Character classification helpers for Japanese text.

// CJK ideographs (incl. Ext A, compatibility block, Ext B+) and the repeat marks 々 〆.
const KANJI_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3005\u3006\u{20000}-\u{3134F}]/u;
const HIRAGANA_RE = /[\u3041-\u309F]/;
const KATAKANA_RE = /[\u30A0-\u30FF\u31F0-\u31FF\uFF66-\uFF9F]/;

/** Punctuation that may appear inside readings or words without changing what they are. */
const NEUTRAL_RE = /[\s〜~ー・、。,.\-()（）「」!?！？]/;

export const isKanji = (ch: string) => KANJI_RE.test(ch);
export const isHiragana = (ch: string) => HIRAGANA_RE.test(ch);
export const isKatakana = (ch: string) => KATAKANA_RE.test(ch);
export const isKana = (ch: string) => isHiragana(ch) || isKatakana(ch);
export const isJapanese = (ch: string) => isKanji(ch) || isKana(ch);

export const hasKanji = (s: string) => KANJI_RE.test(s);
export const hasJapanese = (s: string) => [...s].some(isJapanese);

/** True when every character is kana (or neutral punctuation) and at least one kana is present. */
export function isKanaOnly(s: string): boolean {
  return onlyChars(s, isKana);
}

export function isHiraganaOnly(s: string): boolean {
  return onlyChars(s, isHiragana);
}

export function isKatakanaOnly(s: string): boolean {
  return onlyChars(s, isKatakana);
}

function onlyChars(s: string, test: (ch: string) => boolean): boolean {
  let seen = false;
  for (const ch of s) {
    if (test(ch)) seen = true;
    else if (!NEUTRAL_RE.test(ch)) return false;
  }
  return seen;
}

/** Converts katakana to hiragana so readings can be compared regardless of script. */
export function toHiragana(s: string): string {
  return s.replace(/[\u30A1-\u30F6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/**
 * Removes spaces next to Japanese (non-Latin, non-Cyrillic) characters:
 * "お疲れ様 でした" → "お疲れ様でした", "A は B" → "AはB", while "Kseniia Ivanova" is kept.
 */
export function removeJapaneseSpaces(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/ (?=[^\x00-\x7F\u0400-\u04FF])/g, '')
    .replace(/([^\x00-\x7F\u0400-\u04FF]) /g, '$1')
    .trim();
}
