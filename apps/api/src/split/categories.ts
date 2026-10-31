/**
 * Shared-expense categories (one list for everyone in a group, like Splitwise). Each member's own
 * books map them onto their personal categories by slug, best match first; members can override.
 */
export type SharedCategory = { slug: string; label: string; group: string; match: string[] }

export const SHARED_CATEGORIES: SharedCategory[] = [
  { slug: 'general', label: 'General', group: 'Uncategorized', match: ['other-expense', 'general', 'uncategorized'] },
  { slug: 'dining', label: 'Dining out', group: 'Food and drink', match: ['restaurants', 'dining-out', 'dining', 'food-and-beverage', 'food-and-drink', 'food'] },
  { slug: 'groceries', label: 'Groceries', group: 'Food and drink', match: ['groceries', 'food-and-beverage', 'food'] },
  { slug: 'liquor', label: 'Drinks', group: 'Food and drink', match: ['drinks', 'liquor', 'cafe', 'food-and-beverage'] },
  { slug: 'food', label: 'Food and drink', group: 'Food and drink', match: ['food-and-beverage', 'food-and-drink', 'food', 'restaurants'] },
  { slug: 'rent', label: 'Rent', group: 'Home', match: ['rent', 'rentals', 'housing'] },
  { slug: 'mortgage', label: 'Mortgage', group: 'Home', match: ['mortgage', 'housing'] },
  { slug: 'household', label: 'Household supplies', group: 'Home', match: ['household', 'household-supplies', 'shopping'] },
  { slug: 'furniture', label: 'Furniture', group: 'Home', match: ['furniture', 'home-improvement'] },
  { slug: 'electronics', label: 'Electronics', group: 'Home', match: ['electronics'] },
  { slug: 'maintenance', label: 'Maintenance', group: 'Home', match: ['maintenance', 'home-improvement'] },
  { slug: 'pets', label: 'Pets', group: 'Home', match: ['pets'] },
  { slug: 'services', label: 'Services', group: 'Home', match: ['services', 'laundry'] },
  { slug: 'electricity', label: 'Electricity', group: 'Utilities', match: ['electricity-bill', 'electricity', 'bills-and-utilities', 'utilities'] },
  { slug: 'heat-gas', label: 'Heat and gas', group: 'Utilities', match: ['gas-bill', 'heat-gas', 'bills-and-utilities', 'utilities'] },
  { slug: 'water', label: 'Water', group: 'Utilities', match: ['water-bill', 'water', 'bills-and-utilities', 'utilities'] },
  { slug: 'internet', label: 'TV, phone and internet', group: 'Utilities', match: ['internet-bill', 'phone-bill', 'television-bill', 'bills-and-utilities', 'utilities'] },
  { slug: 'cleaning', label: 'Cleaning', group: 'Utilities', match: ['cleaning', 'laundry', 'bills-and-utilities'] },
  { slug: 'utilities', label: 'Utilities', group: 'Utilities', match: ['bills-and-utilities', 'utilities'] },
  { slug: 'transport', label: 'Transport', group: 'Transportation', match: ['transportation', 'transport'] },
  { slug: 'taxi', label: 'Taxi', group: 'Transportation', match: ['taxi', 'transportation'] },
  { slug: 'bus-train', label: 'Bus and train', group: 'Transportation', match: ['public-transport', 'transportation'] },
  { slug: 'plane', label: 'Flights', group: 'Transportation', match: ['flights', 'travel', 'transportation'] },
  { slug: 'car', label: 'Car', group: 'Transportation', match: ['car', 'transportation'] },
  { slug: 'fuel', label: 'Fuel', group: 'Transportation', match: ['petrol', 'fuel', 'transportation'] },
  { slug: 'parking', label: 'Parking', group: 'Transportation', match: ['parking-fees', 'parking', 'transportation'] },
  { slug: 'hotel', label: 'Hotel', group: 'Transportation', match: ['accommodation', 'hotel', 'travel'] },
  { slug: 'travel', label: 'Travel', group: 'Transportation', match: ['travel', 'accommodation'] },
  { slug: 'entertainment', label: 'Entertainment', group: 'Entertainment', match: ['entertainment'] },
  { slug: 'games', label: 'Games', group: 'Entertainment', match: ['games', 'entertainment'] },
  { slug: 'movies', label: 'Movies', group: 'Entertainment', match: ['movies', 'entertainment'] },
  { slug: 'music', label: 'Music', group: 'Entertainment', match: ['music', 'entertainment'] },
  { slug: 'sports', label: 'Sports', group: 'Entertainment', match: ['sports', 'health-and-fitness', 'entertainment'] },
  { slug: 'clothing', label: 'Clothing', group: 'Life', match: ['clothing', 'shopping'] },
  { slug: 'gifts', label: 'Gifts', group: 'Life', match: ['gifts-and-donations', 'gifts'] },
  { slug: 'medical', label: 'Medical', group: 'Life', match: ['doctor', 'pharmacy', 'health-and-fitness', 'medical'] },
  { slug: 'education', label: 'Education', group: 'Life', match: ['education', 'books'] },
  { slug: 'insurance', label: 'Insurance', group: 'Life', match: ['insurances', 'insurance'] },
  { slug: 'childcare', label: 'Childcare', group: 'Life', match: ['childcare', 'family'] },
  { slug: 'taxes', label: 'Taxes', group: 'Life', match: ['taxes', 'fees-and-charges'] },
  { slug: 'shopping', label: 'Shopping', group: 'Life', match: ['shopping'] },
]

const BY_SLUG = new Map(SHARED_CATEGORIES.map((c) => [c.slug, c]))

export function isSharedCategory(slug: string): boolean {
  return BY_SLUG.has(slug)
}

/** Picks the user's category for a shared category slug, or null when nothing fits. */
export function mapToUserCategory(slug: string, userCategories: Array<{ id: string; slug: string; type: string }>): string | null {
  const shared = BY_SLUG.get(slug) ?? BY_SLUG.get('general')!
  const expenseCats = userCategories.filter((c) => c.type === 'expense')
  for (const candidate of shared.match) {
    const hit = expenseCats.find((c) => c.slug === candidate)
    if (hit) return hit.id
  }
  return null
}

/** Splitwise category names -> our slugs (used by the importer). */
export const SPLITWISE_CATEGORY_MAP: Record<string, string> = {
  'General': 'general', 'Uncategorized': 'general', 'Other': 'general',
  'Dining out': 'dining', 'Groceries': 'groceries', 'Liquor': 'liquor', 'Food and drink': 'food', 'Food and drink - Other': 'food',
  'Rent': 'rent', 'Mortgage': 'mortgage', 'Household supplies': 'household', 'Furniture': 'furniture', 'Electronics': 'electronics',
  'Maintenance': 'maintenance', 'Pets': 'pets', 'Services': 'services', 'Home - Other': 'household', 'Home': 'household',
  'Electricity': 'electricity', 'Heat/gas': 'heat-gas', 'Water': 'water', 'TV/Phone/Internet': 'internet', 'Cleaning': 'cleaning',
  'Trash': 'utilities', 'Utilities - Other': 'utilities', 'Utilities': 'utilities',
  'Transportation': 'transport', 'Transportation - Other': 'transport', 'Taxi': 'taxi', 'Bus/train': 'bus-train', 'Plane': 'plane',
  'Car': 'car', 'Gas/fuel': 'fuel', 'Parking': 'parking', 'Hotel': 'hotel', 'Bicycle': 'transport',
  'Entertainment': 'entertainment', 'Entertainment - Other': 'entertainment', 'Games': 'games', 'Movies': 'movies', 'Music': 'music', 'Sports': 'sports',
  'Life': 'general', 'Life - Other': 'general', 'Clothing': 'clothing', 'Gifts': 'gifts', 'Medical expenses': 'medical', 'Education': 'education',
  'Insurance': 'insurance', 'Childcare': 'childcare', 'Taxes': 'taxes',
}
