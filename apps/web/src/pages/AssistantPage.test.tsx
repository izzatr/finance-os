import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Markdownish } from './AssistantPage'
import { asRecent, findDuplicate } from '@/components/ProposalCard'
import type { Proposal, RecentTransaction } from '@/lib/api'

describe('Markdownish', () => {
  it('renders bold, bullets and numbered lists as elements, never raw HTML', () => {
    const { container } = render(<Markdownish text={'You spent **$3,340**.\n- Rent $2,150\n- Food $347\n1. one\n2. two\n<img src=x onerror=alert(1)>'} />)
    expect(screen.getByText('$3,340').tagName).toBe('B')
    expect(container.querySelectorAll('ul li')).toHaveLength(2)
    expect(container.querySelectorAll('ol li')).toHaveLength(2)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})

describe('findDuplicate', () => {
  const proposal = (description: string, amount: string, date: string): Proposal => ({
    id: 'p', source: 'ai_chat', actorLabel: 'Assistant', status: 'pending', createdAt: '', resolvedAt: null,
    payload: { transaction: { description, type: 'expense', transactionDate: `${date}T12:00:00.000Z`, entries: [{ amount }] } },
  })
  const recent = [{ id: 't', entryId: 'e', transactionDate: '2026-10-10T12:00:00.000Z', type: 'expense', description: 'Blue Bottle Coffee', notes: null, categoryName: 'Coffee', amount: -6.5, currency: 'USD', walletName: 'Chase' }] as RecentTransaction[]

  it('flags the same amount and description within three days', () => {
    expect(findDuplicate(proposal('blue bottle', '-6.50', '2026-10-11'), recent)?.id).toBe('t')
  })
  it('flags a draft identical to an earlier draft', () => {
    const earlier = asRecent(proposal('Blue Bottle Coffee', '-6.50', '2026-10-11'))!
    expect(findDuplicate(proposal('Blue Bottle Coffee', '-6.50', '2026-10-11'), [earlier])).not.toBeNull()
  })

  it('ignores different amounts, descriptions or dates', () => {
    expect(findDuplicate(proposal('Blue Bottle Coffee', '-7.00', '2026-10-11'), recent)).toBeNull()
    expect(findDuplicate(proposal('Lyft', '-6.50', '2026-10-11'), recent)).toBeNull()
    expect(findDuplicate(proposal('Blue Bottle Coffee', '-6.50', '2026-10-20'), recent)).toBeNull()
  })
})
