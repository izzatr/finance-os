import { useQuery } from '@tanstack/react-query'
import { getCategories } from '@/lib/api'
import { categoryIcon } from '@/lib/categoryIcon'
import { useSplitMe } from '@/hooks/use-split'

/** One cached list, shared by all personal icon consumers; updates never require ledger rewrites. */
export function usePersonalIcons() {
  const { data } = useQuery({ queryKey: ['category-list'], queryFn: getCategories, staleTime: 60_000 })
  return (name: string | null | undefined, type?: string, id?: string | null) => {
    const c = id ? data?.data.find((c) => c.id === id) : data?.data.find((c) => c.name === name)
    return categoryIcon(name, type, c?.icon)
  }
}
export function useSharedCategoryIcon(slug?: string | null) {
  const { data } = useSplitMe()
  return categoryIcon(slug, 'expense', data?.data.categories.find((c) => c.slug === slug)?.icon)
}
