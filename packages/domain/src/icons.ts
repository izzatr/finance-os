import { z } from 'zod'

/** Stable identifiers only: never accept URLs, markup, arbitrary SVG or component names. */
export const ICON_IDS = ['tag', 'home', 'plane', 'heart', 'users', 'coffee', 'utensils', 'shopping-cart', 'shopping-bag', 'car', 'bus', 'train', 'bike', 'receipt', 'zap', 'gift', 'book-open', 'graduation-cap', 'heart-pulse', 'dumbbell', 'shirt', 'laptop', 'smartphone', 'film', 'music', 'gamepad', 'paw-print', 'baby', 'landmark', 'hand-coins', 'trending-up', 'arrow-left-right', 'calendar-clock', 'sparkles'] as const
export type IconId = typeof ICON_IDS[number]
export const iconIdSchema = z.enum(ICON_IDS)
