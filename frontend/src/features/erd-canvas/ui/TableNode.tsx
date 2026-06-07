import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { TableNodeData } from '@/entities/erd'

export type TableNodeProps = NodeProps & { data: TableNodeData }

/**
 * Custom React Flow node for a DBML table. Renders a colored header (table
 * name) and one row per column showing name, type, and PK/FK/NN/UQ markers.
 * Each column row carries a target Handle on the left and a source Handle on
 * the right, both keyed by the column id (`${schema}.${table}.${column}`) so
 * RelationEdge can attach at the exact column. Handles are non-connectable
 * (3b is a read-only auto-layout view); they exist only as edge anchors.
 * features layer: depends on shared + entities/erd + @xyflow/react.
 */
function TableNodeImpl({ data }: TableNodeProps) {
  return (
    <div className="min-w-[200px] rounded border border-gray-300 bg-white text-xs shadow-sm">
      <div
        className="rounded-t px-3 py-1.5 text-sm font-semibold text-white"
        style={{ backgroundColor: data.headerColor ?? '#475569' }}
      >
        {data.tableName}
      </div>
      <div className="divide-y divide-gray-100">
        {data.columns.map((col) => (
          <div
            key={col.id}
            data-testid={`column-${col.id}`}
            className="relative flex items-center justify-between gap-2 px-3 py-1"
          >
            <Handle
              type="target"
              position={Position.Left}
              id={col.id}
              isConnectable={false}
              className="!h-2 !w-2 !border !border-gray-400 !bg-white"
            />
            <span className="flex items-center gap-1 font-medium text-gray-800">
              {col.name}
              {col.pk && (
                <span
                  data-testid={`marker-pk-${col.id}`}
                  title="Primary key"
                  className="text-amber-600"
                >
                  PK
                </span>
              )}
              {col.fk && (
                <span
                  data-testid={`marker-fk-${col.id}`}
                  title="Foreign key"
                  className="text-sky-600"
                >
                  FK
                </span>
              )}
              {col.nn && (
                <span
                  data-testid={`marker-nn-${col.id}`}
                  title="Not null"
                  className="text-rose-600"
                >
                  NN
                </span>
              )}
              {col.unique && (
                <span
                  data-testid={`marker-uq-${col.id}`}
                  title="Unique"
                  className="text-violet-600"
                >
                  UQ
                </span>
              )}
            </span>
            <span className="text-gray-500">{col.type}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={col.id}
              isConnectable={false}
              className="!h-2 !w-2 !border !border-gray-400 !bg-white"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export const TableNode = memo(TableNodeImpl)
