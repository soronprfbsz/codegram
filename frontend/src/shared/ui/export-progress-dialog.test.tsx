import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportProgressDialog } from './export-progress-dialog'

describe('ExportProgressDialog', () => {
  it('shows the label while open', () => {
    render(<ExportProgressDialog open label="Excel 내보내기 생성 중…" />)
    expect(screen.getByText('Excel 내보내기 생성 중…')).toBeInTheDocument()
  })

  it('shows the percent when provided', () => {
    render(<ExportProgressDialog open label="생성 중…" percent={42} />)
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('omits the percent when not provided (indeterminate)', () => {
    render(<ExportProgressDialog open label="생성 중…" />)
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    render(<ExportProgressDialog open={false} label="생성 중…" />)
    expect(screen.queryByText('생성 중…')).not.toBeInTheDocument()
  })
})
