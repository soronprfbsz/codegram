import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { TableNodeData } from '@/entities/erd'

export type TableNodeProps = NodeProps & { data: TableNodeData }

/** Strip parenthesised qualifiers from a type string: "VARCHAR(255)" → "VARCHAR". */
function baseType(t: string): string {
  return t.replace(/\(.*\)/, '')
}

/**
 * Custom React Flow node for a DBML table — Backstage spec restyle (Phase 4).
 * Fixed width 240px. Header: 40px, name mono + field count. Rows: 28px,
 * PK/FK badge, name, base type, NN badge / UQ flag. Group identity lives on
 * the group box + panel only — the table card carries no group color/glyph.
 * Hover: border → --erd-border-2, shadow. Selected: border --erd-sel + ring.
 * Highlighted rows (highlightedColumnIds): accent-soft bg.
 * Each column row carries target Handle (left) + source Handle (right) keyed
 * by col.id so RelationEdge can anchor at the exact column.
 * All data-testids are preserved.
 * features layer: depends on shared + entities/erd + @xyflow/react.
 */
function TableNodeImpl({ data }: TableNodeProps) {
  const {
    tableName,
    columns,
    isSelected,
    highlightedColumnIds,
  } = data

  const highlightSet = new Set(highlightedColumnIds ?? [])

  return (
    <div
      style={{
        width: 240,
        borderRadius: 12,
        border: isSelected
          ? '1px solid var(--primary)'
          : '1px solid var(--erd-border)',
        background: 'var(--erd-node)',
        boxShadow: isSelected
          ? '0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent), var(--erd-shadow)'
          : 'var(--erd-shadow-sm)',
        cursor: 'pointer',
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
        transition: 'border-color 80ms ease, box-shadow 80ms ease',
      }}
      className="erd-table-node"
    >
      {/* Header strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 40,
          padding: '0 12px',
          background: 'var(--erd-node-head)',
          borderBottom: '1px solid var(--erd-border)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--erd-text)',
          }}
        >
          {tableName}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            color: 'var(--erd-text-3)',
            flexShrink: 0,
          }}
        >
          {columns.length}f
        </span>
      </div>

      {/* Column rows */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {columns.map((col, idx) => {
          const isHighlighted = highlightSet.has(col.id)
          const isLast = idx === columns.length - 1

          return (
            <div
              key={col.id}
              data-testid={`column-${col.id}`}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                height: 28,
                padding: '0 12px',
                fontSize: 12,
                borderBottom: isLast
                  ? 'none'
                  : '1px solid color-mix(in srgb, var(--erd-border) 55%, transparent)',
                background: isHighlighted ? 'var(--erd-accent-soft)' : 'transparent',
              }}
            >
              {/* Target handle on the left (default side) */}
              <Handle
                type="target"
                position={Position.Left}
                id={col.id}
                isConnectable={false}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 6,
                  height: 6,
                  opacity: 0,
                  pointerEvents: 'none',
                }}
              />
              {/* Alternate-side handles: edge anchor swap (`@left`/`@right`
                  suffix) — ErdCanvas rewrites the edge handle id when a stored
                  sourceSide/targetSide override flips an endpoint. */}
              <Handle
                type="target"
                position={Position.Right}
                id={`${col.id}@right`}
                isConnectable={false}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 6,
                  height: 6,
                  opacity: 0,
                  pointerEvents: 'none',
                }}
              />
              <Handle
                type="source"
                position={Position.Left}
                id={`${col.id}@left`}
                isConnectable={false}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 6,
                  height: 6,
                  opacity: 0,
                  pointerEvents: 'none',
                }}
              />

              {/* Key badge slot (20px) */}
              <span style={{ width: 20, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                {col.pk && (
                  <span
                    data-testid={`marker-pk-${col.id}`}
                    title="Primary key"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 8.5,
                      fontWeight: 700,
                      padding: '1px 3px',
                      borderRadius: 3,
                      letterSpacing: '0.02em',
                      color: '#DC6803',
                      background: 'rgba(220,104,3,0.16)',
                    }}
                    className="erd-badge-pk"
                  >
                    PK
                  </span>
                )}
                {!col.pk && col.fk && (
                  <span
                    data-testid={`marker-fk-${col.id}`}
                    title="Foreign key"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 8.5,
                      fontWeight: 700,
                      padding: '1px 3px',
                      borderRadius: 3,
                      letterSpacing: '0.02em',
                      color: 'var(--erd-accent-text)',
                      background: 'var(--erd-accent-soft)',
                    }}
                  >
                    FK
                  </span>
                )}
              </span>

              {/* Field name */}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--erd-text)',
                  // 비PK 컬럼명도 500으로(기존 400) — 저배율에서 얇은 글자 가독성 보강.
                  fontWeight: col.pk ? 600 : 500,
                }}
              >
                {col.name}
              </span>

              {/* NOT NULL marker */}
              {col.nn && (
                <span
                  data-testid={`marker-nn-${col.id}`}
                  title="Not null"
                  style={{ display: 'none' }}
                />
              )}

              {/* UNIQUE marker */}
              {col.unique && (
                <span
                  data-testid={`marker-uq-${col.id}`}
                  title="Unique"
                  style={{ display: 'none' }}
                />
              )}

              {/* Type */}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  color: 'var(--erd-text-3)',
                  flexShrink: 0,
                }}
              >
                {baseType(col.type)}
              </span>

              {/* Flags: NN badge = NOT NULL, U = UNIQUE */}
              {(col.nn || col.unique) && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    flexShrink: 0,
                  }}
                >
                  {col.nn && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 8.5,
                        fontWeight: 700,
                        padding: '1px 3px',
                        borderRadius: 3,
                        letterSpacing: '0.02em',
                        color: 'var(--erd-text-3)',
                        background:
                          'color-mix(in srgb, var(--erd-text-3) 14%, transparent)',
                      }}
                    >
                      NN
                    </span>
                  )}
                  {col.unique && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: 'var(--erd-text-3)',
                      }}
                    >
                      U
                    </span>
                  )}
                </span>
              )}

              {/* Source handle on the right */}
              <Handle
                type="source"
                position={Position.Right}
                id={col.id}
                isConnectable={false}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 6,
                  height: 6,
                  opacity: 0,
                  pointerEvents: 'none',
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const TableNode = memo(TableNodeImpl)
