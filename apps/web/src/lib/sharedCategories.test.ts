import { describe, expect, it } from 'vitest'
import { mapToUserCategory, SHARED_CATEGORIES } from '../../../api/src/split/categories'
import { autoUserCategory, SHARED_CATEGORY_MATCH } from './sharedCategories'

const cats = [
  { id: 'c1', name: 'Restaurants', slug: 'restaurants', type: 'expense' as const },
  { id: 'c2', name: 'Food', slug: 'food', type: 'expense' as const },
  { id: 'c3', name: 'Salary', slug: 'salary', type: 'income' as const },
  { id: 'c4', name: 'Transport', slug: 'transportation', type: 'expense' as const },
]

describe('autoUserCategory', () => {
  it('keeps the same match lists as the server', () => {
    expect(SHARED_CATEGORY_MATCH).toEqual(Object.fromEntries(SHARED_CATEGORIES.map((c) => [c.slug, c.match])))
  })

  it('picks the first matching expense category, like the server', () => {
    expect(autoUserCategory('dining', cats)?.name).toBe('Restaurants')
    expect(autoUserCategory('groceries', cats)?.name).toBe('Food')
    expect(autoUserCategory('taxi', cats)?.name).toBe('Transport')
    expect(autoUserCategory('rent', cats)).toBeNull()
    for (const c of SHARED_CATEGORIES) {
      expect(autoUserCategory(c.slug, cats)?.id ?? null).toBe(mapToUserCategory(c.slug, cats))
    }
  })
})
