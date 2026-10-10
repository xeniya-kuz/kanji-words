// Parses furigana markup into base/reading segments.
//
// Supported formats:
//   <ruby>父<rp>(</rp><rt>ちち</rt><rp>)</rp></ruby>   (HTML ruby, with or without <rp>/<rb>)
//   漢字[かんじ]                                       (Anki bracket syntax)

import { BRACKET_FURIGANA_RE, decodeEntities } from './html';
import { isKana, isKanji, removeJapaneseSpaces, toHiragana } from './japanese';

export interface FuriganaSegment {
  /** Base text as written, e.g. "祖" or "さん". */
  text: string;
  /** Reading shown above the base; absent for kana and other plain text. */
  reading?: string;
}

export function parseFurigana(markup: string): FuriganaSegment[] {
  if (!markup) return [];
  const segments = /<ruby[\s>]/i.test(markup) ? parseRuby(markup) : parseBrackets(markup);
  return normalize(segments.flatMap(peelKana));
}

/**
 * Parses a field that may list several spellings, one per line or separated by " / ":
 * "<ruby>旨<rt>うま</rt></ruby>く<br><ruby>上手<rt>うま</rt></ruby>く" → two segment lists.
 */
export function parseFuriganaVariants(markup: string): FuriganaSegment[][] {
  // Line breaks inside a reading (<rt>つき<br></rt>) are formatting, not a list separator.
  const source = markup.replace(/<rt[^>]*>[\s\S]*?<\/rt>/gi, (rt) => rt.replace(/<br\s*\/?>/gi, ''));
  return source
    .split(/<br\s*\/?>|<\/(?:div|p)>|\n|\s\/\s/i)
    .map(parseFurigana)
    .filter((segments) => segments.length > 0);
}

/** The text without readings, e.g. "お祖父さん". */
export function furiganaBase(segments: FuriganaSegment[]): string {
  return segments.map((s) => s.text).join('');
}

/** The full reading, using kana base text where no reading is given, e.g. "おじいさん". */
export function furiganaReading(segments: FuriganaSegment[]): string {
  return segments.map((s) => s.reading ?? s.text).join('');
}

/** True when every kanji in the segments is covered by a reading. */
export function isFullyAnnotated(segments: FuriganaSegment[]): boolean {
  return segments.every((s) => s.reading || ![...s.text].some(isKanji));
}

function parseRuby(html: string): FuriganaSegment[] {
  const segments: FuriganaSegment[] = [];
  const source = html.replace(/<rp[^>]*>[\s\S]*?<\/rp>/gi, '');
  const rubyRe = /<ruby[^>]*>([\s\S]*?)<\/ruby>/gi;
  let last = 0;
  for (const match of source.matchAll(rubyRe)) {
    segments.push({ text: plain(source.slice(last, match.index)) });
    segments.push(...parseRubyInner(match[1]));
    last = match.index + match[0].length;
  }
  segments.push({ text: plain(source.slice(last)) });
  return segments;
}

// One <ruby> may hold several base/<rt> pairs: <ruby>漢<rt>かん</rt>字<rt>じ</rt></ruby>
function parseRubyInner(inner: string): FuriganaSegment[] {
  const segments: FuriganaSegment[] = [];
  const rtRe = /([\s\S]*?)<rt[^>]*>([\s\S]*?)<\/rt>/gi;
  let last = 0;
  for (const match of inner.matchAll(rtRe)) {
    const reading = plain(match[2]);
    segments.push({ text: plain(match[1]), reading: reading || undefined });
    last = match.index + match[0].length;
  }
  segments.push({ text: plain(inner.slice(last)) });
  return segments;
}

function parseBrackets(text: string): FuriganaSegment[] {
  const segments: FuriganaSegment[] = [];
  const source = plain(text, false);
  let last = 0;
  for (const match of source.matchAll(new RegExp(BRACKET_FURIGANA_RE.source, 'g'))) {
    segments.push({ text: source.slice(last, match.index) });
    segments.push({ text: match[1], reading: match[2] });
    last = match.index + match[0].length;
  }
  segments.push({ text: source.slice(last) });
  return segments.map((s) => ({ ...s, text: removeJapaneseSpaces(s.text) }));
}

/** Strips tags and entities; Japanese text never needs the remaining spaces. */
function plain(html: string, removeSpaces = true): string {
  const text = decodeEntities(html.replace(/<br\s*\/?>/gi, '').replace(/<[^>]*>/g, ''));
  return removeSpaces ? removeJapaneseSpaces(text) : text;
}

/**
 * Moves kana at the edges of an annotated base out of it, so that
 * <ruby>食べる<rt>たべる</rt></ruby> becomes 食[た] + べる, and お茶[おちゃ] becomes お + 茶[ちゃ].
 */
function peelKana(segment: FuriganaSegment): FuriganaSegment[] {
  if (!segment.reading) return [segment];
  let base = [...segment.text];
  let reading = [...segment.reading];
  const before: string[] = [];
  const after: string[] = [];

  while (base.length > 1 && isKana(base[0])) {
    if (toHiragana(base[0]) === toHiragana(reading[0] ?? '')) reading = reading.slice(1);
    before.push(base[0]);
    base = base.slice(1);
  }
  while (base.length > 1 && isKana(base[base.length - 1])) {
    const ch = base[base.length - 1];
    if (toHiragana(ch) === toHiragana(reading[reading.length - 1] ?? '')) reading = reading.slice(0, -1);
    after.unshift(ch);
    base = base.slice(0, -1);
  }

  return [
    { text: before.join('') },
    { text: base.join(''), reading: reading.join('') || undefined },
    { text: after.join('') },
  ];
}

/** Drops empty segments, removes readings from kana-only bases and merges adjacent plain text. */
function normalize(segments: FuriganaSegment[]): FuriganaSegment[] {
  const out: FuriganaSegment[] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    const annotated = segment.reading && [...segment.text].some(isKanji);
    const next: FuriganaSegment = annotated ? { text: segment.text, reading: segment.reading } : { text: segment.text };
    const prev = out[out.length - 1];
    if (prev && !prev.reading && !next.reading) prev.text += next.text;
    else out.push(next);
  }
  return out;
}
