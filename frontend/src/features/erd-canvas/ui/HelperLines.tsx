import { useViewport } from '@xyflow/react'

/**
 * Renders the drag alignment guide lines. `vertical`/`horizontal` are FLOW-space
 * coordinates; we transform them to screen space with the live viewport so the
 * lines track pan/zoom. Rendered as direct children of <ReactFlow> (the flow
 * container is position:relative). pointer-events:none.
 */
export function HelperLines({
  vertical,
  horizontal,
}: {
  vertical?: number
  horizontal?: number
}) {
  const { x, y, zoom } = useViewport()
  const sx = vertical !== undefined ? vertical * zoom + x : undefined
  const sy = horizontal !== undefined ? horizontal * zoom + y : undefined
  return (
    <>
      {sx !== undefined && (
        <div
          data-testid="helper-line-vertical"
          style={{ position: 'absolute', top: 0, bottom: 0, left: sx, width: 1, background: 'var(--erd-accent)', pointerEvents: 'none', zIndex: 5 }}
        />
      )}
      {sy !== undefined && (
        <div
          data-testid="helper-line-horizontal"
          style={{ position: 'absolute', left: 0, right: 0, top: sy, height: 1, background: 'var(--erd-accent)', pointerEvents: 'none', zIndex: 5 }}
        />
      )}
    </>
  )
}
