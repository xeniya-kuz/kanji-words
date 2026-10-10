/** "Японский::Слова::Семья" → "Слова › Семья" (the top-level deck name is usually the same for all). */
export function formatDeck(deck: string): string {
  const parts = deck.split('::');
  return (parts.length > 1 ? parts.slice(1) : parts).join(' › ') || 'Default';
}
