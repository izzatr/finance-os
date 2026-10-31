import { storedIcon } from './icons'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  Baby,
  BookOpen,
  Bus,
  Car,
  Coffee,
  Dumbbell,
  Film,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  Landmark,
  Laptop,
  Plane,
  Receipt,
  CalendarClock,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Tag,
  TrendingUp,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/**
 * Categories are free text, so icons are matched by keyword. Order matters: the first rule
 * whose pattern matches wins, so put specific words before broad ones.
 */
const RULES: Array<[RegExp, LucideIcon]> = [
  [/grocer|supermarket|market|aldi|lidl|rewe|edeka/i, ShoppingCart],
  [/coffee|cafe|kopi/i, Coffee],
  [/eat|food|restaurant|dining|lunch|dinner|meal|snack|delivery/i, Utensils],
  [/flight|travel|holiday|hotel|trip|vacation/i, Plane],
  [/car|fuel|gas|petrol|parking|taxi|uber|grab|gojek/i, Car],
  [/transport|transit|bus|train|ticket|commute|bvg|db\b/i, Bus],
  [/rent|housing|home|mortgage/i, Home],
  [/utilit|electric|power|energy|water|gas bill/i, Zap],
  [/bill|internet|insurance|tax/i, Receipt],
  [/phone|mobile|telco/i, Smartphone],
  [/subscri|streaming|netflix|spotify|software|saas|\bai\b/i, CalendarClock],
  [/health|medic|pharma|doctor|dental|clinic/i, HeartPulse],
  [/gym|sport|fitness/i, Dumbbell],
  [/cloth|fashion|apparel|shoe/i, Shirt],
  [/shop|amazon|purchase/i, ShoppingBag],
  [/gift|donation|charity|zakat|sadaqah/i, Gift],
  [/beauty|personal care|salon|barber|skincare/i, Sparkles],
  [/entertain|movie|cinema|game|fun|hobby/i, Film],
  [/educat|course|school|tuition/i, GraduationCap],
  [/book/i, BookOpen],
  [/kid|child|baby/i, Baby],
  [/tech|electronic|gadget|laptop/i, Laptop],
  [/salary|payroll|wage|income|paycheck|bonus/i, ArrowDownLeft],
  [/invest|dividend|stock|crypto|interest/i, TrendingUp],
  [/refund|reimburs|cashback/i, HandCoins],
  [/bank/i, Landmark],
  [/fee|charge|admin|service/i, Receipt],
]

export function categoryIcon(name: string | null | undefined, type?: string, icon?: string | null): LucideIcon {
  const custom = storedIcon(icon)
  if (custom) return custom
  if (type === 'transfer') return ArrowLeftRight
  if (name) {
    for (const [pattern, icon] of RULES) if (pattern.test(name)) return icon
  }
  if (type === 'income') return ArrowDownLeft
  return Tag
}
