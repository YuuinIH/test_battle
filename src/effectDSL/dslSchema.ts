// Generated by ts-to-zod
import { z } from 'zod'
import { BaseSelector, Extractor } from '@/effectBuilder/selector'
import { EffectTrigger } from '@/core/effect'
import {
  DynamicValue,
  Value,
  SelectorChain,
  SelectorDSL,
  ConditionDSL,
  ActionDSL,
  RawNumberValue,
  RawStringValue,
  RawBooleanValue,
  RawMarkIdValue,
} from './dsl'

const selectorKeys = Object.keys(BaseSelector)
export const baseSelectorSchema = z.enum(selectorKeys as [keyof typeof BaseSelector])

const effectTriggerSchema = z.nativeEnum(EffectTrigger)

const COMPARE_OPERATORS = ['>', '<', '>=', '<=', '=='] as const
const compareOperatorSchema = z.enum(COMPARE_OPERATORS)

const extractorKeys = Object.keys(Extractor)
const extractorSchema = z.enum(extractorKeys as [keyof typeof Extractor])

export const rawNumberValueSchema: z.ZodSchema<RawNumberValue> = z.object({
  type: z.literal('raw:number'),
  value: z.number(),
})

export const rawStringValueSchema: z.ZodSchema<RawStringValue> = z.object({
  type: z.literal('raw:string'),
  value: z.string(),
})

export const rawBooleanValueSchema: z.ZodSchema<RawBooleanValue> = z.object({
  type: z.literal('raw:boolean'),
  value: z.boolean(),
})

export const rawMarkIdValueSchema: z.ZodSchema<RawMarkIdValue> = z.object({
  type: z.literal('raw:markId'),
  value: z.string().refine(v => v.startsWith('mark_')),
})

export const dynamicValueSchema: z.ZodSchema<DynamicValue> = z.lazy(() =>
  z.object({
    type: z.literal('dynamic'),
    selector: selectorDSLSchema,
  }),
)

export const valueSchema: z.ZodSchema<Value> = z.union([
  rawNumberValueSchema,
  rawStringValueSchema,
  rawBooleanValueSchema,
  rawMarkIdValueSchema,
  dynamicValueSchema,
])

export const selectorChainSchema: z.ZodSchema<SelectorChain> = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal('select'),
      arg: z.union([extractorSchema, z.string()]),
    }),
    z.object({
      type: z.literal('where'),
      arg: conditionDSLSchema,
    }),
    z.object({
      type: z.literal('whereAttr'),
      extractor: z.union([extractorSchema, z.string()]),
      condition: conditionDSLSchema,
    }),
    z.object({
      type: z.literal('and'),
      arg: z.lazy(() => selectorDSLSchema),
    }),
    z.object({
      type: z.literal('or'),
      arg: z.lazy(() => selectorDSLSchema),
      duplicate: z.boolean().optional(),
    }),
    z.object({
      type: z.literal('randomPick'),
      arg: z.number().int().positive(),
    }),
    z.object({
      type: z.literal('randomSample'),
      arg: z.number().min(0).max(1),
    }),
    z.object({
      type: z.literal('sum'),
    }),
    z.object({
      type: z.literal('add'),
      arg: z.union([z.number(), z.lazy(() => selectorDSLSchema)]),
    }),
    z.object({
      type: z.literal('multiply'),
      arg: z.union([z.number(), z.lazy(() => selectorDSLSchema)]),
    }),
    z.object({
      type: z.literal('divide'),
      arg: z.union([z.number().refine(v => v !== 0, { message: '除数不能为0' }), z.lazy(() => selectorDSLSchema)]),
    }),
    z.object({
      type: z.literal('shuffled'),
    }),
    z.object({
      type: z.literal('clampMax'),
      arg: z.number(),
    }),
    z.object({
      type: z.literal('clampMin'),
      arg: z.number(),
    }),
  ]),
)

export const selectorDSLSchema: z.ZodSchema<SelectorDSL> = z.lazy(() =>
  z.union([
    baseSelectorSchema,
    z.object({
      base: baseSelectorSchema,
      chain: z.array(selectorChainSchema),
    }),
  ]),
)

export const conditionDSLSchema: z.ZodSchema<ConditionDSL> = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal('compare'),
      target: z.string(),
      operator: compareOperatorSchema,
      value: valueSchema,
    }),
    z.object({
      type: z.literal('same'),
      value: valueSchema,
    }),
    z.object({
      type: z.literal('any'),
      conditions: z.array(conditionDSLSchema),
    }),
    z.object({
      type: z.literal('all'),
      conditions: z.array(conditionDSLSchema),
    }),
    z.object({
      type: z.literal('probability'),
      percent: valueSchema,
    }),
  ]),
)

export const actionDSLSchema: z.ZodSchema<ActionDSL> = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal('dealDamage'),
      target: selectorDSLSchema,
      value: valueSchema,
    }),
    z.object({
      type: z.literal('heal'),
      target: selectorDSLSchema,
      value: valueSchema,
    }),
    z.object({
      type: z.literal('addMark'),
      target: selectorDSLSchema,
      mark: z.string(),
      duration: z.number(),
    }),
    z.object({
      type: z.literal('addStacks'),
      target: selectorDSLSchema,
      mark: z.string(),
      value: z.number(),
    }),
    z.object({
      type: z.literal('consumeStacks'),
      target: selectorDSLSchema,
      mark: z.string(),
      value: z.number(),
    }),
    z.object({
      type: z.literal('modifyStat'),
      target: selectorDSLSchema,
      statType: valueSchema,
      value: valueSchema,
      percent: valueSchema,
    }),
    z.object({
      type: z.literal('statStageBuff'),
      target: selectorDSLSchema,
      statType: valueSchema,
      value: valueSchema,
    }),
    z.object({
      type: z.literal('addRage'),
      target: selectorDSLSchema,
      value: valueSchema,
    }),
    z.object({
      type: z.literal('amplifyPower'),
      target: selectorDSLSchema,
      value: valueSchema,
    }),
    z.object({
      type: z.literal('addPower'),
      target: selectorDSLSchema,
      value: valueSchema,
    }),
  ]),
)

export const effectDSLSchema = z.lazy(() =>
  z.object({
    id: z.string(),
    trigger: effectTriggerSchema,
    priority: z.number(),
    apply: actionDSLSchema,
    condition: conditionDSLSchema.optional(),
    consumesStacks: z.number().optional(),
  }),
)
