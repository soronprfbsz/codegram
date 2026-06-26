import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EdgePaths, LayoutPositions, StoredLayout } from '@/entities/layout'

interface UseLayoutPersistenceOptions {
  /**
   * The LOADED project's id (project?.id), NOT the URL param. The seed effect
   * keys on this so the undefined -> id transition (project finishes loading)
   * fires the seed. Keying on the always-stable URL param would mean the seed
   * never re-runs once the project loads, and saved positions would never be
   * restored on a real page load. This mirrors the existing dbml-baseline seed.
   */
  projectId: string | undefined
  /** project.layout JSONB (project?.layout; may be {} / legacy / non-v1 / undefined while loading). */
  projectLayout: Record<string, unknown> | undefined
}

interface UseLayoutPersistenceResult {
  /** Live, editable positions (seeded from project, updated on drag). */
  positions: LayoutPositions
  /** Replace positions (called from ErdCanvas onLayoutChange). */
  setPositions: (next: LayoutPositions) => void
  /** Referentially-stable StoredLayout for autosave (only changes with positions). */
  layout: StoredLayout
  /** Server-seeded layout for autosave's dual baseline. */
  layoutBaseline: StoredLayout
  /** Live, editable manual edge paths (seeded from project, updated on edge edits). */
  edgePaths: EdgePaths
  /** Replace edge paths (called from ErdCanvas commit/reset). */
  setEdgePaths: (next: EdgePaths) => void
  /**
   * Re-seed BOTH live and baseline from a layout JSONB. Used by snapshot
   * restore: the seed effect is keyed on project.id only, so a same-id restore
   * won't re-fire it; this resets the baseline too so the restored layout
   * doesn't look "changed" and trigger a redundant autosave PATCH.
   */
  reseed: (projectLayout: Record<string, unknown> | undefined) => void
}

/** Read `positions` out of an arbitrary project.layout JSONB, treating a
 *  missing or non-v1 shape as empty (everything falls to dagre downstream). */
function readSeededPositions(
  projectLayout: Record<string, unknown> | undefined,
): LayoutPositions {
  const positions = (projectLayout as Partial<StoredLayout> | undefined)
    ?.positions
  return positions ?? {}
}

/** Read `edges` out of an arbitrary project.layout JSONB (missing -> {}). */
function readSeededEdges(
  projectLayout: Record<string, unknown> | undefined,
): EdgePaths {
  const edges = (projectLayout as Partial<StoredLayout> | undefined)?.edges
  return edges ?? {}
}

/**
 * Holds the live node positions for a project, seeded from project.layout and
 * re-seeded on a project switch. Produces the referentially-stable StoredLayout
 * passed to useProjectAutosave (stable so an inline object cannot loop the save).
 * features layer: depends on entities/layout types only (FSD downward imports).
 */
export function useLayoutPersistence({
  projectId,
  projectLayout,
}: UseLayoutPersistenceOptions): UseLayoutPersistenceResult {
  const [positions, setPositions] = useState<LayoutPositions>(() =>
    readSeededPositions(projectLayout),
  )
  const [baselinePositions, setBaselinePositions] = useState<LayoutPositions>(
    () => readSeededPositions(projectLayout),
  )
  const [edgePaths, setEdgePaths] = useState<EdgePaths>(() =>
    readSeededEdges(projectLayout),
  )
  const [baselineEdges, setBaselineEdges] = useState<EdgePaths>(() =>
    readSeededEdges(projectLayout),
  )

  // Seed on load + re-seed on a project switch. Keyed on the LOADED project's
  // id (projectId === project?.id), so the undefined -> id transition (project
  // finishes loading) fires the seed and saved positions are actually restored
  // on a real page load. Keyed on id ONLY (not projectLayout identity) so an
  // autosave-driven cache update (same id, new object identity) does NOT
  // re-fire the seed and clobber live drags.
  useEffect(() => {
    if (projectId === undefined) return // not loaded yet; seed when it arrives
    const seeded = readSeededPositions(projectLayout)
    setPositions(seeded)
    setBaselinePositions(seeded)
    const seededEdges = readSeededEdges(projectLayout)
    setEdgePaths(seededEdges)
    setBaselineEdges(seededEdges)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const reseed = useCallback(
    (projectLayout: Record<string, unknown> | undefined) => {
      const seeded = readSeededPositions(projectLayout)
      setPositions(seeded)
      setBaselinePositions(seeded)
      const seededEdges = readSeededEdges(projectLayout)
      setEdgePaths(seededEdges)
      setBaselineEdges(seededEdges)
    },
    [],
  )

  const layout = useMemo<StoredLayout>(
    () => ({ version: 1, positions, edges: edgePaths }),
    [positions, edgePaths],
  )
  const layoutBaseline = useMemo<StoredLayout>(
    () => ({ version: 1, positions: baselinePositions, edges: baselineEdges }),
    [baselinePositions, baselineEdges],
  )

  return { positions, setPositions, layout, layoutBaseline, edgePaths, setEdgePaths, reseed }
}
