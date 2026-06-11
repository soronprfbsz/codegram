/**
 * PURE surgical DBML text operations for TableGroup manipulation (ADR-0011).
 * Each op locates the affected TableGroup block (or member line) in the RAW
 * text and rewrites only that region — comments, formatting and declaration
 * order elsewhere are untouched. Every op re-parses its result (parse guard):
 * on failure it returns { ok: false } and the caller must keep the original.
 *
 * entities layer: imports only the local parse adapter + types (FSD).
 */
import { parseDbml } from './parse'
import type { DbmlSchema } from '../model/types'

export type GroupOpResult =
  | { ok: true; text: string }
  | { ok: false; error: string }

/** Quote a DBML identifier unless it is a bare word. */
function quoteName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name}"`
}

/** Parse guard: the rewritten text must still be valid DBML. */
function guarded(next: string): GroupOpResult {
  const parsed = parseDbml(next)
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.errors[0]?.message ?? 'Rewritten DBML failed to parse',
    }
  }
  return { ok: true, text: next }
}

interface GroupBlock {
  /** Index of the `T` of the `TableGroup` keyword. */
  headerStart: number
  /** Index of the opening `{`. */
  braceOpen: number
  /** Index of the matching closing `}`. */
  braceClose: number
}

/** Find the matching `}` for the `{` at openIdx, skipping strings/comments. */
function matchBrace(text: string, openIdx: number): number {
  let depth = 0
  let i = openIdx
  while (i < text.length) {
    if (text.startsWith("'''", i)) {
      const end = text.indexOf("'''", i + 3)
      i = end === -1 ? text.length : end + 3
      continue
    }
    const ch = text[i]
    if (ch === "'" || ch === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== ch) {
        if (text[j] === '\\') j++ // skip the escaped char
        j++
      }
      i = j + 1
      continue
    }
    if (ch === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i)
      i = nl === -1 ? text.length : nl
      continue
    }
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
    i++
  }
  return -1
}

/** Locate the TableGroup block (bare or quoted name) in raw text. */
function findGroupBlock(text: string, name: string): GroupBlock | null {
  const headerRe =
    /(?:^|\n)[ \t]*TableGroup\s+("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_.]*)\s*(?:\[[^\]]*\])?\s*\{/g
  let m: RegExpExecArray | null
  while ((m = headerRe.exec(text)) !== null) {
    const raw = m[1]
    const candidate = raw.startsWith('"') ? raw.slice(1, -1) : raw
    if (candidate !== name) continue
    const headerStart = m.index + m[0].indexOf('TableGroup')
    const braceOpen = m.index + m[0].length - 1
    const braceClose = matchBrace(text, braceOpen)
    if (braceClose === -1) return null
    return { headerStart, braceOpen, braceClose }
  }
  return null
}

/** Append a new empty TableGroup at the end of the document. */
export function createGroup(text: string, name: string): GroupOpResult {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Group name is empty' }
  if (findGroupBlock(text, trimmed)) {
    return { ok: false, error: `TableGroup '${trimmed}' already exists` }
  }
  const block = `TableGroup ${quoteName(trimmed)} {\n}\n`
  const base = text.trim().length === 0 ? '' : text.replace(/\n*$/, '\n\n')
  return guarded(base + block)
}

/** Remove the whole TableGroup block (its tables become ungrouped). */
export function deleteGroup(text: string, name: string): GroupOpResult {
  const block = findGroupBlock(text, name)
  if (!block) return { ok: false, error: `TableGroup '${name}' not found` }
  const lineStart = text.lastIndexOf('\n', block.headerStart - 1) + 1
  let end = block.braceClose + 1
  while (end < text.length && text[end] !== '\n') end++
  if (end < text.length) end++ // the closing-brace line's newline
  while (end < text.length && text[end] === '\n') end++ // blank lines after
  let out = text.slice(0, lineStart) + text.slice(end)
  out = out.replace(/\n+$/, '\n')
  return guarded(out)
}

/** Rename the group, preserving its settings and body untouched. */
export function renameGroup(
  text: string,
  oldName: string,
  newName: string,
): GroupOpResult {
  const trimmed = newName.trim()
  if (!trimmed) return { ok: false, error: 'Group name is empty' }
  if (trimmed === oldName) return { ok: true, text }
  const block = findGroupBlock(text, oldName)
  if (!block) return { ok: false, error: `TableGroup '${oldName}' not found` }
  if (findGroupBlock(text, trimmed)) {
    return { ok: false, error: `TableGroup '${trimmed}' already exists` }
  }
  const header = text.slice(block.headerStart, block.braceOpen)
  const newHeader = header.replace(
    /^(TableGroup\s+)("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_.]*)/,
    (_, kw: string) => `${kw}${quoteName(trimmed)}`,
  )
  return guarded(
    text.slice(0, block.headerStart) + newHeader + text.slice(block.braceOpen),
  )
}

/** Set ([color: #hex]) or clear (null) the group's color setting. */
export function setGroupColor(
  text: string,
  name: string,
  color: string | null,
): GroupOpResult {
  const block = findGroupBlock(text, name)
  if (!block) return { ok: false, error: `TableGroup '${name}' not found` }
  const header = text.slice(block.headerStart, block.braceOpen)
  const settings = /\[([^\]]*)\]/.exec(header)
  let newHeader: string
  if (color === null) {
    if (!settings) return { ok: true, text }
    const rest = settings[1]
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !/^color\s*:/i.test(s))
    newHeader =
      rest.length === 0
        ? header.replace(/\s*\[[^\]]*\]/, '')
        : header.replace(/\[[^\]]*\]/, `[${rest.join(', ')}]`)
  } else if (settings) {
    newHeader = /color\s*:/i.test(settings[1])
      ? header.replace(/(color\s*:\s*)[^,\]]+/i, `$1${color}`)
      : header.replace(/\[/, `[color: ${color}, `)
  } else {
    newHeader = header.trimEnd() + ` [color: ${color}] `
  }
  return guarded(
    text.slice(0, block.headerStart) + newHeader + text.slice(block.braceOpen),
  )
}

/** `${schema}.${table}` id → member token written into a group body. */
function memberToken(tableId: string): string {
  const dot = tableId.indexOf('.')
  const schema = tableId.slice(0, dot)
  const table = tableId.slice(dot + 1)
  return schema === 'public'
    ? quoteName(table)
    : `${quoteName(schema)}.${quoteName(table)}`
}

/** Member line token → normalized `${schema}.${table}` id (null if not a member token). */
function tokenToId(token: string): string | null {
  const re =
    /^("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*)(?:\.("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*))?$/
  const m = re.exec(token)
  if (!m) return null
  const unq = (s: string) => (s.startsWith('"') ? s.slice(1, -1) : s)
  return m[2] !== undefined
    ? `${unq(m[1])}.${unq(m[2])}`
    : `public.${unq(m[1])}`
}

function removeMember(text: string, group: string, tableId: string): GroupOpResult {
  const block = findGroupBlock(text, group)
  if (!block) return { ok: false, error: `TableGroup '${group}' not found` }
  const body = text.slice(block.braceOpen + 1, block.braceClose)
  const lines = body.split('\n')
  const idx = lines.findIndex(
    (line) => tokenToId(line.replace(/\/\/.*$/, '').trim()) === tableId,
  )
  if (idx === -1) {
    return { ok: false, error: `'${tableId}' is not a member of '${group}'` }
  }
  lines.splice(idx, 1)
  return {
    ok: true,
    text:
      text.slice(0, block.braceOpen + 1) +
      lines.join('\n') +
      text.slice(block.braceClose),
  }
}

function addMember(text: string, group: string, tableId: string): GroupOpResult {
  const block = findGroupBlock(text, group)
  if (!block) return { ok: false, error: `TableGroup '${group}' not found` }
  const body = text.slice(block.braceOpen + 1, block.braceClose)
  const token = memberToken(tableId)
  let newBody: string
  if (!body.includes('\n')) {
    // Single-line `{ }` / `{ a }` → rewrite the body multi-line.
    const existing = body.trim().length > 0 ? body.trim().split(/\s+/) : []
    const indent = '  '
    newBody =
      '\n' + [...existing, token].map((l) => indent + l).join('\n') + '\n'
  } else {
    const indentMatch = /\n([ \t]+)\S/.exec('\n' + body)
    const indent = indentMatch ? indentMatch[1] : '  '
    const closeLineStart = body.lastIndexOf('\n') + 1
    newBody =
      body.slice(0, closeLineStart) +
      indent +
      token +
      '\n' +
      body.slice(closeLineStart)
  }
  return {
    ok: true,
    text:
      text.slice(0, block.braceOpen + 1) + newBody + text.slice(block.braceClose),
  }
}

/**
 * Move a table between groups. toGroup === null → just remove (Ungrouped).
 * The schema (current parse) tells which group currently holds the table.
 */
export function moveTableToGroup(
  text: string,
  schema: DbmlSchema,
  tableId: string,
  toGroup: string | null,
): GroupOpResult {
  const fromGroup =
    schema.tableGroups.find((g) => g.tables.includes(tableId))?.name ?? null
  if (fromGroup === toGroup) return { ok: true, text }
  let out = text
  if (fromGroup !== null) {
    const removed = removeMember(out, fromGroup, tableId)
    if (!removed.ok) return removed
    out = removed.text
  }
  if (toGroup !== null) {
    const added = addMember(out, toGroup, tableId)
    if (!added.ok) return added
    out = added.text
  }
  return guarded(out)
}
