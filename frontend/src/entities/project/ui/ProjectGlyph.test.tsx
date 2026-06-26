import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectGlyph } from './ProjectGlyph'
import { PROJECT_FG_COLORS, PROJECT_BG_COLORS } from '../model/glyph'

describe('ProjectGlyph', () => {
  it('draws an icon token (@key) in the chosen color', () => {
    const { container } = render(<ProjectGlyph glyph="@db" color="blue" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    // lucide sets the SVG stroke to the passed color → "redrawn" in the color.
    expect(svg?.getAttribute('stroke')).toBe(PROJECT_FG_COLORS.blue)
  })

  it('renders a color emoji on a soft color tint (emoji keeps its own color)', () => {
    render(<ProjectGlyph glyph="🗄️" color="blue" />)
    const chip = screen.getByText('🗄️')
    expect(chip).toBeInTheDocument()
    // 이모지는 흰 글자로 덮지 않는다(네이티브 컬러 유지).
    expect(chip).not.toHaveClass('text-white')
    // 선택색은 은은한 틴트 배경으로 반영(color-mix).
    expect((chip as HTMLElement).style.backgroundColor).toContain('color-mix')
  })

  it('renders typed text in the icon/text color on the chosen background', () => {
    render(<ProjectGlyph glyph="DB" color="blue" bgColor="red" />)
    const chip = screen.getByText('DB')
    expect(chip).toBeInTheDocument()
    expect(chip).not.toHaveClass('text-white')
    expect(chip).toHaveStyle({
      color: PROJECT_FG_COLORS.blue,
      backgroundColor: PROJECT_BG_COLORS.red,
    })
  })

  it('falls back to a Database icon when glyph is empty', () => {
    const { container } = render(<ProjectGlyph glyph={null} color={null} />)
    // lucide renders an <svg>; the fallback chip has no glyph text
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
