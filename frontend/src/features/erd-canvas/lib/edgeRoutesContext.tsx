import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Point } from './routeOrthogonal'
import { spreadEdgeRoutes } from './spreadEdgeRoutes'

interface EdgeRoutesValue {
  register: (id: string, points: Point[] | null) => void
  adjusted: Map<string, Point[]>
}
const Ctx = createContext<EdgeRoutesValue | null>(null)

const samePolyline = (a: Point[] | undefined, b: Point[] | null): boolean => {
  if (!a || !b || a.length !== b.length) return false
  return a.every((p, i) => p.x === b[i].x && p.y === b[i].y)
}

export function EdgeRoutesProvider({ children }: { children: ReactNode }) {
  const rawRef = useRef<Map<string, Point[]>>(new Map())
  const [version, setVersion] = useState(0)
  const frameRef = useRef<number | null>(null)
  const bump = useCallback(() => {
    if (frameRef.current != null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      setVersion((v) => v + 1)
    })
  }, [])
  const register = useCallback(
    (id: string, points: Point[] | null) => {
      if (points == null) {
        if (rawRef.current.delete(id)) bump()
        return
      }
      if (samePolyline(rawRef.current.get(id), points)) return
      rawRef.current.set(id, points)
      bump()
    },
    [bump],
  )
  const adjusted = useMemo(() => {
    void version
    return spreadEdgeRoutes([...rawRef.current].map(([id, points]) => ({ id, points })))
  }, [version])
  const value = useMemo<EdgeRoutesValue>(() => ({ register, adjusted }), [register, adjusted])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEdgeRoutes(): EdgeRoutesValue | null {
  return useContext(Ctx)
}
