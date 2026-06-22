/**
 * Locate the 1-based line range of a `Table <name> { … }` block in a DBML
 * document string.
 *
 * Matches the opening line:
 *   ^\s*Table\s+(<schema>.)?("?)<name>\1\s*(\[[^\]]*\])?\s*\{
 *   — optional `<schema>.` prefix (bare or quoted), so a schema-qualified
 *     header like `Table public.users {` still matches the bare name `users`
 *   — optional [settings] before { (e.g. [headercolor: #fff])
 *   — quoted OR bare table name
 *
 * Scans forward from the opening line for the first line whose trimmed content
 * is exactly `}` (the closing brace of the block).
 *
 * Returns null if no matching block is found.
 * Returns { fromLine, toLine } (1-based, inclusive) otherwise.
 */
export function tableLineRange(
  doc: string,
  tableName: string,
): { fromLine: number; toLine: number } | null {
  const lines = doc.split('\n')

  // Escape special regex chars in the table name.
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Opening pattern: optional leading spaces, Table keyword, an optional
  // `<schema>.` prefix (bare or quoted), then either a bare name or a
  // double-quoted name, optional [settings], then {
  const openPattern = new RegExp(
    `^\\s*Table\\s+(?:"?[^"\\s.]+"?\\s*\\.\\s*)?("?)${escaped}\\1\\s*(?:\\[[^\\]]*\\])?\\s*\\{`,
    'i',
  )

  let fromLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (openPattern.test(lines[i])) {
      fromLine = i + 1 // 1-based
      break
    }
  }
  if (fromLine === -1) return null

  // Find the closing `}` (trimmed) at or after the opening line.
  for (let i = fromLine - 1; i < lines.length; i++) {
    if (lines[i].trim() === '}') {
      return { fromLine, toLine: i + 1 } // 1-based
    }
  }

  // Block was opened but never closed — treat the last line as the end.
  return { fromLine, toLine: lines.length }
}
