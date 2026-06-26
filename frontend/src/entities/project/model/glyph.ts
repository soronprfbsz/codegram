/** Project glyph/color palette constants (entities layer: no upward imports). */
import type { CSSProperties } from 'react'
import {
  Database, Server, HardDrive, Cloud, Cpu, Network, Globe, Cable,
  Terminal, Code, GitBranch, Table, LayoutGrid, Layers, Boxes, Workflow,
  Lock, KeyRound, Shield, Bug, FlaskConical, Zap, BarChart3, Activity,
  Bell, Bot, Settings, Wrench, Rocket, Gauge,
  type LucideIcon,
} from 'lucide-react'

export type ProjectColorKey =
  | 'blue'
  | 'purple'
  | 'teal'
  | 'orange'
  | 'red'
  | 'slate'
  | 'transparent'

/**
 * 배경·전경을 **역할별로 분리한** 두 팔레트. 같은 색 집합에서 배경과 글씨를 모두
 * 고르게 두면 blue-on-blue처럼 안 보이는 조합이 나온다. 그래서 Material 3의
 * container / on-container, Radix Colors의 "옅은 틴트 배경 + 진한 텍스트 단계"
 * 패턴을 따른다: 배경은 옅은 틴트, 전경(아이콘/글씨)은 같은 hue의 진한 채도색.
 * 모든 배경이 밝고 모든 전경이 어두우므로 6×6 어떤 조합이든 대비가 보장된다
 * (WCAG 2.x 측정: 최악 조합 blue 4.79:1, 36개 전부 ≥4.5:1 — 일반 텍스트 기준 통과).
 */

/** 전경(아이콘/글씨)색 — 같은 hue의 진한 채도색('on-container'). */
export const PROJECT_FG_COLORS: Record<ProjectColorKey, string> = {
  blue: '#175CD3',
  purple: '#5925DC',
  teal: '#125D56',
  orange: '#93370D',
  red: '#B42318',
  slate: '#344054',
  // 투명: 전경엔 쓰지 않는다(아이콘색은 보여야 함). 맵 형태를 맞추기 위한 자리.
  transparent: 'transparent',
}

/** 배경색 — 같은 hue의 옅은 틴트('container'). */
export const PROJECT_BG_COLORS: Record<ProjectColorKey, string> = {
  blue: '#D1E9FF',
  purple: '#ECE9FE',
  teal: '#CCFBEF',
  orange: '#FDEAD7',
  red: '#FEE4E2',
  slate: '#F2F4F7',
  // 투명: 배경 틴트 없이 전경만. ProjectGlyph가 'transparent'를 감지해 채우지 않는다.
  transparent: 'transparent',
}

export const PROJECT_COLOR_KEYS = Object.keys(
  PROJECT_FG_COLORS,
) as ProjectColorKey[]

/** Background-color choices (all, incl. transparent). */
export const PROJECT_BG_COLOR_KEYS = PROJECT_COLOR_KEYS

/** Icon/text-color choices — excludes 'transparent' (글씨/아이콘은 보여야 함). */
export const PROJECT_ICON_COLOR_KEYS = PROJECT_COLOR_KEYS.filter(
  (k) => k !== 'transparent',
)

/** Checkerboard swatch background — the 'transparent' color option's visual. */
export const CHECKER_SWATCH: CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #b0b0b0 25%, transparent 25%), linear-gradient(-45deg, #b0b0b0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #b0b0b0 75%), linear-gradient(-45deg, transparent 75%, #b0b0b0 75%)',
  backgroundSize: '8px 8px',
  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
}

export const DEFAULT_PROJECT_COLOR: ProjectColorKey = 'slate'

/** Resolve a stored icon/text color (key or null) to its CSS hex, slate fallback. */
export function resolveProjectColor(
  color: string | null | undefined,
): string {
  if (color && color in PROJECT_FG_COLORS) {
    return PROJECT_FG_COLORS[color as ProjectColorKey]
  }
  return PROJECT_FG_COLORS[DEFAULT_PROJECT_COLOR]
}

/** Resolve a stored background color (key or null) to its tint hex, slate fallback. */
export function resolveProjectBgColor(
  bgColor: string | null | undefined,
): string {
  if (bgColor && bgColor in PROJECT_BG_COLORS) {
    return PROJECT_BG_COLORS[bgColor as ProjectColorKey]
  }
  return PROJECT_BG_COLORS[DEFAULT_PROJECT_COLOR]
}

/**
 * IT/데이터 전문가(개발자·운영자·DBA)용 벡터 아이콘 레지스트리. 이모지와 달리
 * 선택한 색으로 **다시 그려지는** lucide 아이콘을 쓴다(폰트/OS 의존 없음).
 * 저장 글리프는 `@<key>` 토큰으로 백엔드 8자 제한 안에 들어간다. 키는 ≤7자.
 */
export const PROJECT_ICONS: Record<string, LucideIcon> = {
  // DB / 엔진 / 스토리지
  db: Database, server: Server, disk: HardDrive, cloud: Cloud, table: Table,
  // 인프라 / 네트워크
  cpu: Cpu, net: Network, globe: Globe, cable: Cable, boxes: Boxes,
  // 개발 / 배포 / 흐름
  term: Terminal, code: Code, git: GitBranch, flow: Workflow, layers: Layers,
  grid: LayoutGrid, rocket: Rocket,
  // 운영 / 관측
  chart: BarChart3, pulse: Activity, gauge: Gauge, bell: Bell, bot: Bot,
  // 보안
  lock: Lock, key: KeyRound, shield: Shield,
  // 품질 / 설정
  bug: Bug, flask: FlaskConical, zap: Zap, gear: Settings, wrench: Wrench,
}

/** Quick-pick palette — stored glyph tokens (`@key`) in display order. */
export const PROJECT_GLYPH_PALETTE: string[] = Object.keys(PROJECT_ICONS).map(
  (k) => `@${k}`,
)

/**
 * Resolve a stored glyph to its lucide icon component, or null when it is not
 * an icon token (e.g. a legacy emoji or free-text glyph).
 */
export function resolveGlyphIcon(
  glyph: string | null | undefined,
): LucideIcon | null {
  if (!glyph || glyph[0] !== '@') return null
  return PROJECT_ICONS[glyph.slice(1)] ?? null
}

/** Max stored glyph length (length, not grapheme count). Matches backend. */
export const GLYPH_MAX_LENGTH = 8
