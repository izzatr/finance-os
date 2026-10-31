import type { Category } from './api'

/**
 * Which personal category a shared category lands in, best match first. Mirrors
 * SHARED_CATEGORIES[].match in apps/api/src/split/categories.ts (a parity test keeps them equal).
 */
export const SHARED_CATEGORY_MATCH: Record<string, string[]> = {
  general: ['other-expense', 'general', 'uncategorized'],
  dining: ['restaurants', 'dining-out', 'dining', 'food-and-beverage', 'food-and-drink', 'food'],
  groceries: ['groceries', 'food-and-beverage', 'food'],
  liquor: ['drinks', 'liquor', 'cafe', 'food-and-beverage'],
  food: ['food-and-beverage', 'food-and-drink', 'food', 'restaurants'],
  rent: ['rent', 'rentals', 'housing'],
  mortgage: ['mortgage', 'housing'],
  household: ['household', 'household-supplies', 'shopping'],
  furniture: ['furniture', 'home-improvement'],
  electronics: ['electronics'],
  maintenance: ['maintenance', 'home-improvement'],
  pets: ['pets'],
  services: ['services', 'laundry'],
  electricity: ['electricity-bill', 'electricity', 'bills-and-utilities', 'utilities'],
  'heat-gas': ['gas-bill', 'heat-gas', 'bills-and-utilities', 'utilities'],
  water: ['water-bill', 'water', 'bills-and-utilities', 'utilities'],
  internet: ['internet-bill', 'phone-bill', 'television-bill', 'bills-and-utilities', 'utilities'],
  cleaning: ['cleaning', 'laundry', 'bills-and-utilities'],
  utilities: ['bills-and-utilities', 'utilities'],
  transport: ['transportation', 'transport'],
  taxi: ['taxi', 'transportation'],
  'bus-train': ['public-transport', 'transportation'],
  plane: ['flights', 'travel', 'transportation'],
  car: ['car', 'transportation'],
  fuel: ['petrol', 'fuel', 'transportation'],
  parking: ['parking-fees', 'parking', 'transportation'],
  hotel: ['accommodation', 'hotel', 'travel'],
  travel: ['travel', 'accommodation'],
  entertainment: ['entertainment'],
  games: ['games', 'entertainment'],
  movies: ['movies', 'entertainment'],
  music: ['music', 'entertainment'],
  sports: ['sports', 'health-and-fitness', 'entertainment'],
  clothing: ['clothing', 'shopping'],
  gifts: ['gifts-and-donations', 'gifts'],
  medical: ['doctor', 'pharmacy', 'health-and-fitness', 'medical'],
  education: ['education', 'books'],
  insurance: ['insurances', 'insurance'],
  childcare: ['childcare', 'family'],
  taxes: ['taxes', 'fees-and-charges'],
  shopping: ['shopping'],
}

/** The user's category the server picks for a shared category, or null (shows as Uncategorized). */
export function autoUserCategory(sharedSlug: string, userCategories: Array<Pick<Category, 'id' | 'name' | 'slug' | 'type'>>) {
  const match = SHARED_CATEGORY_MATCH[sharedSlug] ?? SHARED_CATEGORY_MATCH.general
  const expense = userCategories.filter((c) => c.type === 'expense')
  for (const candidate of match) {
    const hit = expense.find((c) => c.slug === candidate)
    if (hit) return hit
  }
  return null
}
