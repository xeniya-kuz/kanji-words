// Turns Anki field HTML into plain text.

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Converts field HTML to plain text:
 * - `<br>` and block elements become line breaks
 * - ruby annotations (`<rt>`, `<rp>`) are dropped, keeping only the base text
 * - Anki media (`[sound:…]`, `<img>`) is removed
 * - entities are decoded and whitespace is tidied per line
 */
export function htmlToText(html: string): string {
  if (!html) return '';
  const text = decodeEntities(
    html
      .replace(/\r\n?/g, '\n')
      .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<(rt|rp)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/\[sound:[^\]]*\]/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(div|p|li|ul|ol|tr|table|h[1-6])[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  );
  return text
    .split('\n')
    .map((line) => line.replace(/[\s\xA0]+/g, ' ').trim())
    .filter((line, i, lines) => line !== '' || (i > 0 && lines[i - 1] !== ''))
    .join('\n')
    .trim();
}

/** True when the field uses ruby markup or Anki bracket furigana (`漢字[かんじ]`). */
export function hasFuriganaMarkup(s: string): boolean {
  return /<ruby[\s>]/i.test(s) || BRACKET_FURIGANA_RE.test(s);
}

// Anki's own furigana syntax: an optional leading space, the base, then the reading in brackets.
export const BRACKET_FURIGANA_RE = / ?([^ >[\]]+?)\[([\u3041-\u309F\u30A0-\u30FF]+)\]/;

/** `日本[にほん]語[ご]` → `日本語`. Only brackets that contain kana are treated as furigana. */
export function stripBracketFurigana(s: string): string {
  return s.replace(new RegExp(BRACKET_FURIGANA_RE.source, 'g'), '$1');
}
