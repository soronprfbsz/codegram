import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

// Token sets — checked in order inside the tokenizer.
const BLOCK_KEYWORDS = new Set([
  'table', 'ref', 'enum', 'tablegroup', 'project', 'note', 'indexes',
])
const CONSTRAINTS = new Set([
  'pk', 'primary', 'key', 'not', 'null', 'unique', 'increment', 'default',
  'note', 'ref', 'headercolor',
])
const TYPES = new Set([
  'int', 'integer', 'tinyint', 'smallint', 'mediumint', 'bigint',
  'decimal', 'numeric', 'float', 'double', 'real', 'bit', 'boolean', 'bool',
  'serial', 'bigserial', 'char', 'varchar', 'text', 'tinytext', 'mediumtext',
  'longtext', 'blob', 'bytea', 'date', 'datetime', 'timestamp', 'timestamptz',
  'time', 'year', 'uuid', 'json', 'jsonb', 'money', 'inet', 'cidr',
])

interface DbmlState {
  inComment: boolean
}

// StreamLanguage instance — defined at module scope for identity stability.
const dbmlStreamLanguage = StreamLanguage.define<DbmlState>({
  name: 'dbml',

  startState(): DbmlState {
    return { inComment: false }
  },

  token(stream, state): string | null {
    // Inside a block comment started on a previous line.
    if (state.inComment) {
      const closed = stream.skipTo('*/')
      if (closed) {
        stream.match('*/')
        state.inComment = false
      } else {
        stream.skipToEnd()
      }
      return 'comment'
    }

    // Whitespace.
    if (stream.eatSpace()) return null

    // Line comment //.
    if (stream.match('//')) {
      stream.skipToEnd()
      return 'comment'
    }

    // Block comment /* ... */ (possibly multiline).
    if (stream.match('/*')) {
      const closed = stream.skipTo('*/')
      if (closed) {
        stream.match('*/')
      } else {
        stream.skipToEnd()
        state.inComment = true
      }
      return 'comment'
    }

    // Strings: single-quote, double-quote, backtick.
    const quote = stream.peek()
    if (quote === "'" || quote === '"' || quote === '`') {
      stream.next()
      while (!stream.eol()) {
        const ch = stream.next()
        if (ch === quote) break
      }
      return 'string'
    }

    // Numbers.
    if (stream.match(/\d+/)) return 'number'

    // Words (identifiers / keywords).
    if (stream.match(/[A-Za-z_]\w*/)) {
      const word = stream.current().toLowerCase()
      if (BLOCK_KEYWORDS.has(word)) return 'keyword'
      if (CONSTRAINTS.has(word)) return 'constraint'
      if (TYPES.has(word)) return 'type'
      return null
    }

    // Brackets, braces, parens, ref operators, punctuation — consume one char.
    stream.next()
    return 'bracket'
  },

  // Map token names → lezer tags so HighlightStyle can target them.
  tokenTable: {
    keyword:    t.keyword,
    constraint: t.modifier,
    type:       t.typeName,
    string:     t.string,
    comment:    t.comment,
    number:     t.number,
    bracket:    t.bracket,
  },
})

// dbdiagram-ish light palette — defined at module scope for identity stability.
const dbmlHighlightStyle = HighlightStyle.define([
  { tag: t.keyword,  color: '#7c3aed', fontWeight: '600' },
  { tag: t.typeName, color: '#0891b2' },
  { tag: t.modifier, color: '#c2410c' },
  { tag: t.string,   color: '#16a34a' },
  { tag: t.comment,  color: '#6b7280', fontStyle: 'italic' },
  { tag: t.number,   color: '#b45309' },
  { tag: t.bracket,  color: '#64748b' },
])

/**
 * Hoisted CodeMirror extension for DBML syntax highlighting. Uses a
 * StreamLanguage tokenizer (with multiline block-comment tracking) and a
 * dbdiagram-like HighlightStyle. Both the language and the style are defined at
 * module scope so their array identity is stable across renders — keeping
 * @uiw/react-codemirror from re-running its reconfigure effect on every
 * keystroke.
 */
export const dbmlLanguage: Extension = [
  dbmlStreamLanguage,
  syntaxHighlighting(dbmlHighlightStyle),
]
