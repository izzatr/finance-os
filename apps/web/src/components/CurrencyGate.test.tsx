import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { CurrencyGate } from './CurrencyGate'
import { CurrencyTestProvider } from '@/test/CurrencyTestProvider'

function renderGate(ctx: Partial<ComponentProps<typeof CurrencyTestProvider>> = {}, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CurrencyTestProvider {...ctx}><CurrencyGate><p>page body</p></CurrencyGate></CurrencyTestProvider>
    </MemoryRouter>,
  )
}

describe('CurrencyGate', () => {
  it('holds the page until the account settings arrive', () => {
    renderGate({ status: 'loading' })
    expect(screen.getByRole('status')).toHaveTextContent('Loading your settings')
    expect(screen.queryByText('page body')).not.toBeInTheDocument()
  })

  it('says so when settings cannot load, and still renders the page with a retry', async () => {
    const retryLoad = vi.fn()
    renderGate({ status: 'error', retryLoad })
    expect(screen.getByText('page body')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your currency settings')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retryLoad).toHaveBeenCalled()
  })

  it('asks before adopting an old browser currency, and can keep the account value', async () => {
    const accept = vi.fn()
    const dismiss = vi.fn()
    renderGate({ defaultIsExplicit: false, legacyCurrency: 'USD', acceptLegacyCurrency: accept, dismissLegacyCurrency: dismiss })
    const notice = screen.getByRole('region', { name: 'Browser currency' })
    expect(notice).toHaveTextContent('Use USD for your account?')
    await userEvent.click(screen.getByRole('button', { name: 'Keep EUR' }))
    expect(dismiss).toHaveBeenCalled()
    expect(accept).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Use USD' }))
    expect(accept).toHaveBeenCalled()
  })

  it('shows a failed background save with retry, except on the Currencies page which shows its own', async () => {
    const retrySave = vi.fn()
    const { unmount } = renderGate({ saveError: new Error('offline'), retrySave }, '/')
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save: offline')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retrySave).toHaveBeenCalled()
    unmount()
    renderGate({ saveError: new Error('offline') }, '/currencies')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
