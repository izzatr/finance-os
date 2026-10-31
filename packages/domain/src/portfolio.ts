import { z } from 'zod'

const decimalFitsDatabase = /^\d{1,20}(?:\.\d{1,8})?$/
const decimalIsNonZero = /[1-9]/
export const positiveDecimalStringSchema = z.string()
  .regex(decimalFitsDatabase, 'Must have at most 20 integral and 8 fractional digits')
  .refine((value) => decimalIsNonZero.test(value), 'Must be greater than zero')

export const marketSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(25).default(10),
})

export const holdingCreateSchema = z.object({
  walletId: z.string().uuid(),
  provider: z.literal('yahoo').default('yahoo'),
  providerSymbol: z.string().trim().min(1).max(100),
  quantity: positiveDecimalStringSchema,
  averageCost: positiveDecimalStringSchema.nullable().optional(),
  costCurrency: z.string().trim().min(3).max(16).transform((value) => value.toUpperCase()).nullable().optional(),
})

export const holdingPatchSchema = z.object({
  quantity: positiveDecimalStringSchema.optional(),
  averageCost: positiveDecimalStringSchema.nullable().optional(),
  costCurrency: z.string().trim().min(3).max(16).transform((value) => value.toUpperCase()).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export type HoldingCreate = z.infer<typeof holdingCreateSchema>
export type HoldingPatch = z.infer<typeof holdingPatchSchema>
