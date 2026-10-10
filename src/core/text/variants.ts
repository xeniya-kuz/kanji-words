// Expands a field that lists several spellings into separate variants.
//
//   "(伯/叔)母さん"          → ["伯母さん", "叔母さん"]
//   "旨く\n上手く\n巧く"     → ["旨く", "上手く", "巧く"]
//   "返事をする / 返信する"  → ["返事をする", "返信する"]
//   "まわり(に)"             → ["まわりに", "まわり"]   (parentheses without a separator are optional)

import { removeJapaneseSpaces } from './japanese';

const LIST_SEPARATORS = new Set(['\n', '/', '／', ';', '；', '|']);
const GROUP_RE = /[(（]([^()（）]*)[)）]/;
const ALTERNATIVE_RE = /[/／・|]/;

/** Input must already be plain text (see `htmlToText`). */
export function expandVariants(text: string): string[] {
  const variants = splitTopLevel(text).flatMap(expandGroups).map(removeJapaneseSpaces);
  return [...new Set(variants.filter(Boolean))];
}

/** Splits on list separators that are not inside parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(' || ch === '（') depth++;
    else if (ch === ')' || ch === '）') depth = Math.max(0, depth - 1);
    if (depth === 0 && LIST_SEPARATORS.has(ch)) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function expandGroups(text: string): string[] {
  const match = GROUP_RE.exec(text);
  if (!match) return [text];
  const head = text.slice(0, match.index);
  const tail = text.slice(match.index + match[0].length);
  const options = match[1].split(ALTERNATIVE_RE).map((o) => o.trim());
  const choices = options.length > 1 ? options : [options[0], ''];
  return choices.flatMap((choice) => expandGroups(head + choice + tail));
}
