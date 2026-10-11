import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatePicker, dateFromKey, keyFromDate, readableDate } from './date-picker'

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  return <><DatePicker aria-label="Date" value={value} onChange={setValue} /><p>value {value}</p></>
}

function setPhone(phone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: phone && q.includes('max-width'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia
}

describe('date keys', () => {
  it('round-trips calendar days without touching UTC', () => {
    for (const key of ['2026-01-01', '2026-03-29', '2026-10-25', '2026-12-31']) expect(keyFromDate(dateFromKey(key)!)).toBe(key)
    const now = new Date(2026, 9, 11, 23, 30)
    expect(readableDate('2026-10-11', now)).toBe('Today')
    expect(readableDate('2026-10-10', now)).toBe('Yesterday')
    expect(readableDate('2026-10-04', now)).toBe('Sun, 4 Oct 2026')
  })
})

describe('DatePicker', () => {
  afterEach(() => {
    // @ts-expect-error reset the jsdom default
    delete window.matchMedia
  })

  it('desktop: popover calendar with quick chips; picking a day sets the key', async () => {
    setPhone(false)
    const user = userEvent.setup()
    render(<Harness initial="2026-10-04" />)
    const trigger = screen.getByRole('button', { name: /^Date: / })
    expect(trigger).toHaveTextContent('Sun, 4 Oct 2026')
    await user.click(trigger)
    await user.click(await screen.findByRole('button', { name: /October 15th, 2026/ }))
    expect(screen.getByText('value 2026-10-15')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Date: / }))
    await user.click(await screen.findByRole('button', { name: 'Today' }))
    expect(screen.getByText(`value ${keyFromDate(new Date())}`)).toBeInTheDocument()
  })

  it('phone: opens a bottom sheet with Yesterday', async () => {
    setPhone(true)
    const user = userEvent.setup()
    render(<Harness initial="2026-10-04" />)
    await user.click(screen.getByRole('button', { name: /^Date: / }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yesterday' }))
    const y = new Date(); y.setDate(y.getDate() - 1)
    expect(screen.getByText(`value ${keyFromDate(y)}`)).toBeInTheDocument()
  })
})
