import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Dropdown, type DropdownOption } from './dropdown'

const OPTIONS: DropdownOption[] = [
  { value: 'dining', label: 'Dining out', group: 'Food and drink' },
  { value: 'groceries', label: 'Groceries', group: 'Food and drink' },
  { value: 'rent', label: 'Rent', group: 'Home', keywords: ['flat'] },
]

function Harness({ searchable }: { searchable?: boolean }) {
  const [value, setValue] = useState('dining')
  return <><Dropdown aria-label="Category" searchable={searchable} value={value} onChange={setValue} options={OPTIONS} /><p>picked {value}</p></>
}

describe('Dropdown', () => {
  it('picks an option with the pointer and shows group headings', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('combobox', { name: 'Category' })
    expect(trigger).toHaveTextContent('Dining out')
    await user.click(trigger)
    expect(await screen.findByText('Home')).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Rent' }))
    expect(screen.getByText('picked rent')).toBeInTheDocument()
    expect(trigger).toHaveTextContent('Rent')
  })

  it('searchable: filters by label or keyword and supports arrow keys + Enter', async () => {
    const user = userEvent.setup()
    render(<Harness searchable />)
    await user.click(screen.getByRole('combobox', { name: 'Category' }))
    const search = await screen.findByRole('textbox', { name: 'Search options' })
    await user.type(search, 'flat')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.keyboard('{Enter}')
    expect(screen.getByText('picked rent')).toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Category' }))
    await user.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByText('picked dining')).toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Category' }))
    await user.type(await screen.findByRole('textbox', { name: 'Search options' }), 'zzz')
    expect(screen.getByText('Nothing matches')).toBeInTheDocument()
  })
})
