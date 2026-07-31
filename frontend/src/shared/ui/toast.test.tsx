import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider, useToast } from './toast'

function Trigger() {
  const toast = useToast()
  return (
    <>
      <button onClick={() => toast.success('저장되었습니다')}>ok</button>
      <button onClick={() => toast.error('저장하지 못했습니다')}>bad</button>
      <button onClick={() => toast.info('편집 모드에서만 저장할 수 있습니다')}>info</button>
    </>
  )
}

describe('toast', () => {
  it('shows a success message', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    await act(async () => {
      screen.getByText('ok').click()
    })
    const toast = await screen.findByTestId('toast')
    expect(toast).toHaveTextContent('저장되었습니다')
    expect(toast).toHaveAttribute('data-kind', 'success')
  })

  it('shows an error message', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    await act(async () => {
      screen.getByText('bad').click()
    })
    const toast = await screen.findByTestId('toast')
    expect(toast).toHaveAttribute('data-kind', 'error')
  })

  it('shows an info message', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    await act(async () => {
      screen.getByText('info').click()
    })
    const toast = await screen.findByTestId('toast')
    expect(toast).toHaveTextContent('편집 모드에서만 저장할 수 있습니다')
    expect(toast).toHaveAttribute('data-kind', 'info')
  })

  it('throws when useToast is used outside the provider', () => {
    function Bare() {
      useToast()
      return null
    }
    expect(() => render(<Bare />)).toThrow(/ToastProvider/)
  })
})
