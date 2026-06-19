import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectGlyph } from './ProjectGlyph'
import { PROJECT_COLORS } from '../model/glyph'

describe('ProjectGlyph', () => {
  it('renders the glyph string on a colored chip', () => {
    render(<ProjectGlyph glyph="🗄️" color="blue" />)
    const chip = screen.getByText('🗄️')
    expect(chip).toBeInTheDocument()
    expect(chip).toHaveStyle({ backgroundColor: PROJECT_COLORS.blue })
  })

  it('falls back to a Database icon when glyph is empty', () => {
    const { container } = render(<ProjectGlyph glyph={null} color={null} />)
    // lucide renders an <svg>; the fallback chip has no glyph text
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
