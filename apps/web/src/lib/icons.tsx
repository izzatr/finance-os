import { ICON_IDS, type IconId } from '@finance-os/domain/src/icons'
import { Tag, Home, Plane, Heart, Users, Coffee, Utensils, ShoppingCart, ShoppingBag, Car, Bus, Train, Bike, Receipt, Zap, Gift, BookOpen, GraduationCap, HeartPulse, Dumbbell, Shirt, Laptop, Smartphone, Film, Music, Gamepad2, PawPrint, Baby, Landmark, HandCoins, TrendingUp, ArrowLeftRight, CalendarClock, Sparkles, type LucideIcon } from 'lucide-react'

export const ICONS: Record<IconId, LucideIcon> = {
  tag: Tag, home: Home, plane: Plane, heart: Heart, users: Users, coffee: Coffee, utensils: Utensils,
  'shopping-cart': ShoppingCart, 'shopping-bag': ShoppingBag, car: Car, bus: Bus, train: Train, bike: Bike,
  receipt: Receipt, zap: Zap, gift: Gift, 'book-open': BookOpen, 'graduation-cap': GraduationCap,
  'heart-pulse': HeartPulse, dumbbell: Dumbbell, shirt: Shirt, laptop: Laptop, smartphone: Smartphone,
  film: Film, music: Music, gamepad: Gamepad2, 'paw-print': PawPrint, baby: Baby, landmark: Landmark,
  'hand-coins': HandCoins, 'trending-up': TrendingUp, 'arrow-left-right': ArrowLeftRight,
  'calendar-clock': CalendarClock, sparkles: Sparkles,
}
export function storedIcon(id?: string | null): LucideIcon | undefined {
  return id && ICON_IDS.includes(id as IconId) ? ICONS[id as IconId] : undefined
}
export function groupIcon(type: string, id?: string | null): LucideIcon {
  return storedIcon(id) ?? (type === 'home' ? Home : type === 'trip' ? Plane : type === 'couple' ? Heart : Users)
}
export function GroupIcon({ group, className = 'size-5' }: { group: { groupType: string; icon?: string | null }; className?: string }) {
  const Icon = groupIcon(group.groupType, group.icon)
  return <Icon aria-hidden className={className} strokeWidth={1.8} />
}
