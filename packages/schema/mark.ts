import { z } from 'zod'
import { StackStrategy } from '@test-battle/const'

export const StackStrategySchema = z.nativeEnum(StackStrategy)

export const MarkSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    config: z
      .object({
        duration: z.number().optional(),
        persistent: z.boolean().optional().default(true),
        maxStacks: z.number().int().optional(),
        stackable: z.boolean().optional().default(false),
        stackStrategy: StackStrategySchema.optional().default(StackStrategy.extend),
        destoyable: z.boolean().optional().default(true),
      })
      .optional(),
    tags: z.array(z.string()).optional(),
    effect: z.array(z.string()).optional(),
  })
  .passthrough()

export type MarkSchemaType = z.infer<typeof MarkSchema>

export function validateMark(data: unknown): MarkSchemaType {
  return MarkSchema.parse(data)
}

export const MarkDataSetSchema = z.array(MarkSchema)

export type MarkDataSet = z.infer<typeof MarkDataSetSchema>
