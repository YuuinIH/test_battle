import { z } from 'zod'
import { ElementSchema } from './element'

const SkillSchema = z.object({
  skill_id: z.string(),
  level: z.number(),
  hidden: z.boolean(),
})

export const SpeciesSchema = z.object({
  id: z.string().min(1),
  num: z.number(),
  name: z.string(),
  element: ElementSchema,
  star: z.number(),
  baseStats: z.object({
    hp: z.number(),
    atk: z.number(),
    spa: z.number(),
    def: z.number(),
    spd: z.number(),
    spe: z.number(),
  }),
  previous_form: z.number(),
  next_form: z.number(),
  learnable_skills: z.array(SkillSchema),
  description: z.string(),
  ability: z.array(z.string()),
  emblem: z.array(z.string()),
})

export type Species = z.infer<typeof SpeciesSchema>

export const SpeciesDataSetSchema = z.array(SpeciesSchema)

export type SpeciesDataSet = z.infer<typeof SpeciesDataSetSchema>
