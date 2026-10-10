/// <reference types="node" />
// Generates the app icon, Android adaptive icon layers and splash image from the bundled
// Noto Sans JP font: a white 字 with its reading じ above it, like furigana.
//
//   npm run build:icons
//
// The glyphs are converted to vector paths (opentype.js) and rendered to PNG (sharp),
// so no font needs to be installed on the computer.

import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';
import sharp from 'sharp';

const ROOT = path.join(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'assets', 'images');
const FONT = path.join(ROOT, 'node_modules/@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf');

/** Must match the accent colour in src/constants/theme.ts and the colours in app.json. */
const BACKGROUND = '#3c6df0';
const SIZE = 1024;

const buffer = fs.readFileSync(FONT);
const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

/** SVG path for `text`, scaled so its height is `height` and centred on (cx, cy). */
function glyph(text: string, height: number, cx: number, cy: number): string {
  const probe = font.getPath(text, 0, 0, 100).getBoundingBox();
  const fontSize = (100 * height) / (probe.y2 - probe.y1);
  const box = font.getPath(text, 0, 0, fontSize).getBoundingBox();
  const x = cx - (box.x1 + box.x2) / 2;
  const y = cy - (box.y1 + box.y2) / 2;
  return font.getPath(text, x, y, fontSize).toPathData(2);
}

/**
 * The mark: 字 with じ above it. `scale` is the height of 字 relative to the canvas;
 * the adaptive icon foreground uses a smaller scale to stay inside Android's safe zone.
 */
function mark(scale: number, readingOpacity: number): string {
  const kanjiHeight = SIZE * scale;
  const readingHeight = kanjiHeight * 0.26;
  const gap = kanjiHeight * 0.1;
  const total = readingHeight + gap + kanjiHeight;
  const top = (SIZE - total) / 2;
  // Only the Regular weight is bundled; a thin outline makes the strokes bolder at launcher size.
  const outline = (width: number) => `stroke="#ffffff" stroke-width="${width}" stroke-linejoin="round"`;
  return `
    <path d="${glyph('じ', readingHeight, SIZE / 2, top + readingHeight / 2)}" fill="#ffffff" fill-opacity="${readingOpacity}" stroke-opacity="${readingOpacity}" ${outline(readingHeight * 0.03)}/>
    <path d="${glyph('字', kanjiHeight, SIZE / 2, top + readingHeight + gap + kanjiHeight / 2)}" fill="#ffffff" ${outline(kanjiHeight * 0.035)}/>`;
}

const svg = (content: string, background?: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    ${background ? `<rect width="${SIZE}" height="${SIZE}" fill="${background}"/>` : ''}
    ${content}
  </svg>`;

const outputs: Record<string, string> = {
  // Legacy/fallback icon: full square, mark at a comfortable size.
  'icon.png': svg(mark(0.5, 0.75), BACKGROUND),
  // Adaptive icon: Android masks it to a circle/squircle and shows only the central ~66%.
  'android-icon-foreground.png': svg(mark(0.36, 0.75)),
  'android-icon-background.png': svg('', BACKGROUND),
  // Themed (Material You) icon: a single-colour silhouette that the system tints.
  'android-icon-monochrome.png': svg(mark(0.36, 1)),
  'splash-icon.png': svg(mark(0.6, 0.75)),
};

for (const [file, content] of Object.entries(outputs)) {
  await sharp(Buffer.from(content)).png().toFile(path.join(OUT, file));
  console.log(`  assets/images/${file}`);
}
