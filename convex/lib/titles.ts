/**
 * The form titles are compared in: lowercased, with punctuation turned
 * into spaces and runs of spaces collapsed. "Solo Leveling: Ragnarok!"
 * becomes "solo leveling ragnarok". Letters from any language are kept.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
