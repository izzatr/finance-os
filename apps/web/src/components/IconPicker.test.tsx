import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Coffee, ShoppingCart, Users, Plane } from 'lucide-react'
import { IconPicker } from './IconPicker'
import { categoryIcon } from '@/lib/categoryIcon'
import { groupIcon, ICONS, storedIcon } from '@/lib/icons'
import { ICON_IDS } from '@finance-os/domain/src/icons'

vi.mock('@/lib/api', async (original) => ({
  ...await original<typeof import('@/lib/api')>(),
  getCategories: vi.fn().mockResolvedValue({ data: [{ id: 'picnic', name: 'Picnic', slug: 'picnic', type: 'expense', parentId: null, needsReview: false, icon: 'coffee' }] }),
  patchCategory: vi.fn().mockResolvedValue({ data: {} }),
  createCategory: vi.fn().mockResolvedValue({ data: {} }),
  createSplitGroup: vi.fn().mockResolvedValue({ data: { id: 'group' } }),
  getSplitFriends: vi.fn().mockResolvedValue({ data: [] }),
  patchSharedCategoryIcon: vi.fn().mockResolvedValue({ data: {} }),
}))
import { CategoriesPage } from '@/pages/CategoriesPage'
import { CreateGroupSheet } from './shared/SharedDialogs'
import { SharedCategoryIcons } from './shared/SharedCategoryIcons'
import { createCategory, createSplitGroup, patchCategory, patchSharedCategoryIcon } from '@/lib/api'
import { ActivityRow } from './ActivityList'

const wrap = (element: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>)

describe('curated icons', () => {
  it('has a renderer for every allowed id and safely falls back for unknown values', () => {
    expect(Object.keys(ICONS)).toEqual([...ICON_IDS])
    expect(categoryIcon('Groceries', 'expense', 'coffee')).toBe(Coffee)
    expect(categoryIcon('Groceries', 'expense', '<svg/>')).toBe(ShoppingCart)
    expect(storedIcon('__proto__')).toBeUndefined()
    expect(groupIcon('other')).toBe(Users)
    expect(groupIcon('trip')).toBe(Plane)
  })
  it('supports search, selected state, reset and no-match without submitting a form', async () => {
    const user = userEvent.setup(), change = vi.fn(), submit = vi.fn()
    render(<form onSubmit={submit}><IconPicker label="Group icon" value="coffee" onChange={change} /></form>)
    await user.click(screen.getByRole('button', { name: 'Group icon' }))
    expect(screen.getByRole('button', { name: 'Use coffee icon' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByRole('searchbox', { name: 'Search icons' }), 'plane')
    expect(screen.queryByRole('button', { name: 'Use coffee icon' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use plane icon' }))
    expect(change).toHaveBeenLastCalledWith('plane')
    await user.click(screen.getByRole('button', { name: 'Group icon' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search icons' }), 'not-found')
    expect(screen.getByText('No matching icons.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Automatic (reset)' }))
    expect(change).toHaveBeenLastCalledWith(null)
    expect(submit).not.toHaveBeenCalled()
  })
  it('sends the chosen icon when creating a group', async () => {
    const user = userEvent.setup()
    wrap(<CreateGroupSheet open onClose={() => {}} onCreated={() => {}} />)
    await user.type(screen.getByLabelText('Group name'), 'Weekend')
    await user.click(screen.getByRole('button', { name: 'Group icon' }))
    await user.click(screen.getByRole('button', { name: 'Use plane icon' }))
    await user.click(screen.getByRole('button', { name: 'Create group' }))
    await waitFor(() => expect(createSplitGroup).toHaveBeenCalledWith(expect.objectContaining({ icon: 'plane', name: 'Weekend' })))
  })
  it('edits an existing category icon and renders it in the category and activity lists', async () => {
    const user = userEvent.setup()
    wrap(<CategoriesPage />)
    const edit = await screen.findByRole('button', { name: 'Edit Picnic' })
    expect(edit.querySelector('svg')).toHaveClass('lucide-coffee')
    await user.click(edit)
    await user.click(screen.getByRole('button', { name: 'Category icon' }))
    await user.click(screen.getByRole('button', { name: 'Use gift icon' }))
    await user.click(screen.getByRole('button', { name: 'Save category' }))
    await waitFor(() => expect(patchCategory).toHaveBeenCalledWith('picnic', expect.objectContaining({ icon: 'gift' })))
  })
  it('creates categories with a chosen icon', async () => {
    const user = userEvent.setup()
    wrap(<CategoriesPage />)
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Camping')
    await user.click(screen.getByRole('button', { name: 'Category icon' }))
    await user.click(screen.getByRole('button', { name: 'Use home icon' }))
    await user.click(screen.getByRole('button', { name: 'Create category' }))
    await waitFor(() => expect(createCategory).toHaveBeenCalledWith(expect.objectContaining({ icon: 'home' })))
  })
  it('searches and saves only the chosen private shared category override', async () => {
    const user = userEvent.setup()
    wrap(<SharedCategoryIcons categories={[{ slug: 'groceries', label: 'Groceries', group: 'Food', icon: 'gift' }, { slug: 'rent', label: 'Rent', group: 'Home' }]} />)
    expect(screen.queryByRole('button', { name: 'Groceries' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Customize shared category icons' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search shared categories' }), 'groceries')
    expect(screen.queryByRole('button', { name: 'Rent' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Groceries' }))
    await user.click(screen.getByRole('button', { name: 'Automatic (reset)' }))
    await waitFor(() => expect(patchSharedCategoryIcon).toHaveBeenCalledWith('groceries', null))
    expect(await screen.findByRole('status')).toHaveTextContent('Groceries icon saved')
  })
  it('uses persisted personal preference for ledger rows', async () => {
    const { container } = wrap(<ul><ActivityRow tx={{ id: 'expense', transactionDate: '2026-01-01', type: 'expense', description: 'Lunch', categoryName: 'Picnic', amount: -12, currency: 'USD' }} /></ul>)
    await waitFor(() => expect(container.querySelector('.lucide-coffee')).not.toBeNull())
  })
})
