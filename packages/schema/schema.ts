import { EffectSchema, EffectSetSchema } from './effect'
import { MarkDataSetSchema, MarkSchema } from './mark'
import { SkillDataSetSchema, SkillSchema } from './skill'
import { SpeciesDataSetSchema, SpeciesSchema } from './species'

export type SchemaType = keyof typeof DATA_SCHEMA_MAP

export const DATA_SCHEMA_MAP = {
  effect: EffectSetSchema,
  mark: MarkDataSetSchema,
  skill: SkillDataSetSchema,
  species: SpeciesDataSetSchema,
} as const

export const SCHEMA_MAP = {
  effect: EffectSchema,
  mark: MarkSchema,
  skill: SkillSchema,
  species: SpeciesSchema,
} as const
