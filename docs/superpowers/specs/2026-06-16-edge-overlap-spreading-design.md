# Edge Overlap Spreading — Design

**Status:** Approved (brainstorming) — ready for implementation planning.
**Date:** 2026-06-16
**Author:** bg session (Claude)

## Problem

In the ERD canvas, distinct relationship edges can render on top of each other,
collapsing into what looks like one thick line. Reproduced from the reporter's
schema (account / service / service_component / publishing / publishing_file)
with the `created_by`/`updated_by`/`service_id`/`publishing_id` FKs. Two distinct
failure modes coexist:

1. **Shared source trunk (dominant).** Every edge leaving the *same* source
   handle steps out to the same port and, when its targets are stacked
   vertically, runs down the **same vertical corridor** (e.g. `x≈255` for the six
   edges leaving `account.account_id`). They overlap into one trunk.
   - The existing `sourceLaneOffset` fans the source port in **Y**, but that jog
     is **absorbed by `simplify()`** the moment the edge turns vertical (the
     offset point becomes collinear with the long vertical run). So the Y-fan
     does nothing for a *vertical* trunk.

2. **Coincidental shared corridor.** Two edges with **different source AND
   target** happen to route through the same gutter mid-path (e.g.
   `publishing → publishing_file` shares `x≈255` with the `account` edges over
   `y 278→362`). Neither lane offset addresses this — the offsets only separate
   edges near a *shared* endpoint.

**Root cause.** `routeOrthogonal` runs **per edge, independently** (each
`RelationEdge` computes its own route in a `useMemo`). No code sees all routed
polylines together, so edges cannot be spread off one another mid-route.

### Reproduction (evidence)

Seeding the six tables (FKs restored from the column notes) and auto-arranging
produces edge polylines that share `x≈255` as a vertical trunk:

```
account.account_id → service.created_by:        … L 254.99 54.5 L 254.99 82.5 …
account.account_id → service.updated_by:        … L 254.99 54.5 L 254.99 96.5 …
account.account_id → service_component.created_by: … L 254.99 54.5 L 254.99 208 …
account.account_id → publishing.created_by:     … L 254.99 54.5 L 254.99 362.5 …
publishing.publishing_id → publishing_file.publishing_id: … L 254.99 278.5 L 254.99 556.5 …
```

The first four (co-source) overlap on `x=254.99`; the last (independent) overlaps
the same corridor over `y 278→362`.

## Scope

Two staged deliverables. **Stage B** ships first (low-risk, high-impact on the
dominant trunk case); **Stage A** follows for completeness.

- **In scope:** orthogonal auto-routed FK edges.
- **Out of scope:** manual-waypoint edges (user intent preserved — excluded from
  spreading) and enum-link edges (dashed, no routing). No change to crow-foot
  markers, anchor-side selection, or layout.

## Stage B — Fan the source trunk into parallel lanes

**Goal:** edges leaving the same source handle that share a vertical (or
horizontal) trunk fan onto **parallel** corridors instead of collapsing.

**Change.** `routeOrthogonal` currently fans the source port only in Y
(`sourceLaneOffset`). Add a **perpendicular (across-the-card, i.e. X for a
left/right handle) component** to the source step-out, sized by the same lane
index:

```
sMargin = margin + sourceLaneIndex * TRUNK_GAP        // perpendicular push
sPort.x = source.x ± sMargin                          // (sign by source side)
sPort.y = source.y + sourceLaneOffset                 // existing along-card push (kept)
```

- A **vertical** trunk now fans into parallel verticals at distinct X
  (`x = 255, 255+gap, …`) — the case the Y-fan could not fix.
- The existing **Y-fan is kept** for the dual case (targets spread roughly on the
  source's row, so edges share a *horizontal* corridor). For any given geometry
  one axis is the effective separator and the other is harmlessly absorbed.
- This is symmetric with the target side, which already pushes its port in X via
  `tMargin = margin + targetLaneOffset`.

**Wiring.** `RelationEdge` already computes `sourceLaneIndex` and passes
`sourceLaneIndex * LANE_GAP` as `sourceLaneOffset`. Stage B threads the index (or
a precomputed perpendicular offset) into the new `routeOrthogonal` parameter.
The exact gap (reuse `LANE_GAP=14` vs a dedicated smaller `TRUNK_GAP`) and
whether both offsets are passed separately or combined is validated with
screenshots during implementation; the contract is "co-source vertical trunks
end on distinct X corridors."

**Result.** The `account.account_id` six-edge trunk separates. Coincidental
independent overlaps (`publishing_file`) remain → Stage A.

**Decision deferred to the plan (low-risk):** whether Stage B passes the
perpendicular offset as a new 9th `routeOrthogonal` parameter or folds it into
the existing source-lane handling. Either keeps the pure-router contract.

## Stage A — Central edge-spreading pass

**Goal:** any group of distinct edges sharing a collinear corridor (co-source,
co-target, or coincidental) is spread onto parallel tracks.

### Architecture change — lift routing out of the per-edge component

Routing currently lives in `RelationEdge.orthoPoints` (per edge, no global view).
Stage A centralizes it:

- New hook **`useEdgeRoutes()`** (features/erd-canvas): reads `nodeLookup` +
  `displayEdges`, computes **every** auto-routed edge's polyline once (moving the
  current `orthoPoints` + lane selectors out of `RelationEdge`), runs the
  spreading pass, and exposes an `edgeId → polyline` map via a context.
- **`RelationEdge`** reads its polyline from that context instead of computing it.
  Manual-waypoint edges keep their existing local path; segment-drag, reset, and
  selection rendering are unchanged (they consume the final polyline / report it
  back exactly as today via `renderedPoints`).

### `spreadEdgeRoutes(routes)` — pure function

Input: `Array<{ edgeId, points: Point[] }>`. Output: the same with overlapping
collinear segments shifted onto parallel tracks.

1. **Collect segments**: for each edge, each consecutive pair → a segment tagged
   `{ edgeId, segIndex, orientation: 'h'|'v', fixed: number, lo: number, hi: number }`
   (`fixed` = the shared coordinate; `[lo,hi]` = the varying-axis range).
2. **Group**: segments with the same `orientation`, the same `fixed` (within ε),
   and **overlapping `[lo,hi]`** ranges form an overlap group. (Exclude the short
   endpoint step-out/stub segments and manual edges.)
3. **Assign tracks**: a group of `k` members gets symmetric offsets
   `(i - (k-1)/2) * SPREAD_GAP`; shift each member segment's `fixed` by its offset.
   Order members deterministically (e.g. by edgeId) for stable output.
4. **Re-bridge** (the hard part): shifting a segment moves its two endpoints; the
   adjacent segments on each side must extend/retract to stay connected and
   orthogonal. Must not introduce a new overlap or a non-orthogonal kink. Cap the
   number of spread tracks so the fan stays bounded; `log`/note when capped.

### Integration & preservation

- Stage B's lane offsets are applied **before** spreading (they are the routing
  input); spreading is the final adjustment.
- Manual-waypoint and enum edges are excluded from the spread set.
- Performance: O(segments²) grouping is fine at ERD scale (tens–low-hundreds of
  edges); note any cap applied.

### Risks

- Re-bridging correctness (new crossings / non-orthogonal segments) — the main
  risk; covered by pure-function unit tests over crafted polylines.
- The routing-centralization refactor touches the `RelationEdge` render path;
  segment-drag (`renderedPoints`), reset-to-auto, and selection must keep working.

## Testing

**Stage B**
- `routeOrthogonal` unit: a co-source vertical trunk fans onto distinct X
  corridors; the existing source-lane (Y) behavior and tests still pass.
- E2E: the six edges leaving `account.account_id` render on distinct trunk X
  values (no two co-source edges share the same vertical corridor); the existing
  `edge-path` fan-out E2E still green.

**Stage A**
- `spreadEdgeRoutes` pure unit: overlapping collinear segments separated; output
  stays orthogonal; manual/enum/non-overlapping inputs unchanged; deterministic.
- E2E: the `publishing → publishing_file` coincidental overlap no longer shares a
  corridor with the `account` edges.
- Full unit + E2E regression; trunk before/after visual confirmation.

## Rollout

Stage B and Stage A land as separate commits/plans on `main` (no remote; direct
-to-main is this repo's convention). Each stage is independently verifiable and
shippable; Stage A depends on Stage B being in place (B's offsets feed A).
