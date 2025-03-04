import {
  BaseMark,
  BaseSkill,
  DamageContext,
  Effect,
  EffectContext,
  MarkInstance,
  Pet,
  Player,
  SkillInstance,
  UseSkillContext,
} from '@test-battle/battle'
import {
  type baseMarkId,
  type baseSkillId,
  type effectId,
  EffectTrigger,
  type StatTypeOnBattle,
  StatTypeWithoutHp,
} from '@test-battle/const'
import { DataRepository } from '@test-battle/data-repository'
import {
  BaseSelector,
  type PathExtractor,
  ChainableSelector,
  type Condition,
  Evaluators,
  type Evaluator,
  Extractor,
  Operators,
  type SelectorOpinion,
  type ValueSource,
  createPathExtractor,
  Conditions,
} from '@test-battle/effect-builder'
import { RuntimeTypeChecker } from '@test-battle/effect-builder/runtime-type-checker'
import type {
  OperatorDSL,
  ConditionDSL,
  EffectDSL,
  EvaluatorDSL,
  ExtractorDSL,
  SelectorChain,
  SelectorDSL,
  Value,
} from '@test-battle/effect-dsl'

export function parseEffect(dsl: EffectDSL): Effect<EffectTrigger> {
  const actions = createAction(dsl.apply)
  const condition = dsl.condition ? parseCondition(dsl.condition) : undefined
  return new Effect(dsl.id as effectId, dsl.trigger, actions, dsl.priority, condition)
}

export function parseSelector<T extends SelectorOpinion>(dsl: SelectorDSL): ChainableSelector<T> {
  // 解析基础选择器
  const baseSelector = typeof dsl === 'string' ? getBaseSelector(dsl) : getBaseSelector(dsl.base)

  // 处理链式操作
  if (typeof dsl !== 'string' && dsl.chain) {
    return dsl.chain.reduce(
      (selector, step) => applySelectorStep(selector, step),
      baseSelector as ChainableSelector<SelectorOpinion>,
    ) as ChainableSelector<T>
  }

  return baseSelector as ChainableSelector<T>
}

function getBaseSelector(selectorKey: string): ChainableSelector<SelectorOpinion> {
  if (!(selectorKey in BaseSelector)) {
    throw new Error(`未知的基础选择器: ${selectorKey}`)
  }
  return BaseSelector[selectorKey as keyof typeof BaseSelector]
}

function applySelectorStep(
  selector: ChainableSelector<SelectorOpinion>,
  step: SelectorChain,
): ChainableSelector<SelectorOpinion> {
  try {
    switch (step.type) {
      case 'select': {
        // 解析提取器，可能为ChainableExtractor或ValueExtractor
        const extractor = parseExtractor(selector, step.arg)
        return selector.select(extractor)
      }
      case 'selectPath': {
        validatePath(selector, step.arg)
        return selector.selectPath(step.arg)
      }

      case 'selectProp': {
        if (process.env.NODE_ENV !== 'production') {
          validatePath(selector, step.arg)
        }

        return selector.selectProp(step.arg as keyof NonNullable<SelectorOpinion>) as ChainableSelector<SelectorOpinion>
      }

      case 'where':
        return selector.where(parseEvaluator(step.arg))

      case 'whereAttr': {
        const extractor = parseExtractor(selector, step.extractor)
        const condition = parseEvaluator(step.evaluator)
        return selector.whereAttr(extractor, condition)
      }

      case 'and':
        return selector.and(parseSelector(step.arg).build())

      case 'or':
        return selector.or(parseSelector(step.arg).build(), step.duplicate ?? false)

      case 'randomPick':
        return selector.randomPick(parseValue(step.arg) as ValueSource<number>)

      case 'randomSample':
        return selector.randomSample(parseValue(step.arg) as ValueSource<number>)

      case 'sum': {
        assertNumberSelector(selector)
        return selector.sum()
      }

      case 'add': {
        assertNumberSelector(selector)
        return selector.add(parseValue(step.arg) as ValueSource<number>)
      }

      case 'multiply': {
        assertNumberSelector(selector)
        return selector.multiply(parseValue(step.arg) as ValueSource<number>)
      }

      case 'divide': {
        assertNumberSelector(selector)
        if (step.arg.type === 'raw:number' && step.arg.value === 0) {
          throw new Error('除数不能为0')
        }
        return selector.divide(parseValue(step.arg) as ValueSource<number>)
      }

      case 'shuffled':
        return selector.shuffled()

      case 'clampMax': {
        assertNumberSelector(selector)
        return selector.clampMax(parseValue(step.arg) as ValueSource<number>)
      }

      case 'clampMin': {
        assertNumberSelector(selector)
        return selector.clampMax(parseValue(step.arg) as ValueSource<number>)
      }

      default:
        throw new Error(`未知的操作类型: ${(step as any).type}`)
    }
  } catch (e) {
    throw new Error(`步骤[${step.type}]执行失败: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function assertNumberSelector(
  selector: ChainableSelector<SelectorOpinion>,
): asserts selector is ChainableSelector<number> {
  if (!selector.isNumberType()) {
    throw new Error(`数值操作需要选择器返回数字类型，当前类型为 ${selector.type}`)
  }
}

export function parseExtractor(
  selector: ChainableSelector<SelectorOpinion>,
  dsl: ExtractorDSL,
): PathExtractor<SelectorOpinion, SelectorOpinion> {
  switch (dsl.type) {
    case 'base':
      return Extractor[dsl.arg] as PathExtractor<SelectorOpinion, SelectorOpinion>
    case 'dynamic':
      return createPathExtractor(selector.type, dsl.arg)
    default:
      throw Error('未知的提取器')
  }
}

function parseEvaluator(dsl: EvaluatorDSL): Evaluator<SelectorOpinion> {
  switch (dsl.type) {
    case 'compare':
      return Evaluators.compare(
        dsl.operator,
        parseValue(dsl.value) as ValueSource<number>,
      ) as Evaluator<SelectorOpinion>
    case 'same':
      return Evaluators.same(
        parseValue(dsl.value) as ValueSource<number | string | boolean>,
      ) as Evaluator<SelectorOpinion>
    case 'any':
      // 递归解析嵌套条件（OR 逻辑）
      return Evaluators.any(...dsl.conditions.map(v => parseEvaluator(v)))
    case 'all':
      // 递归解析嵌套条件（AND 逻辑）
      return Evaluators.all(...dsl.conditions.map(v => parseEvaluator(v)))
    case 'probability':
      return Evaluators.probability(parseValue(dsl.percent) as ValueSource<number>)
    case 'hasTag':
      return Evaluators.hasTag(dsl.tag) as Evaluator<SelectorOpinion>
    default: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw new Error(`Unknown condition type: ${(dsl as any).type}`)
    }
  }
}

export function createAction(dsl: OperatorDSL) {
  switch (dsl.type) {
    case 'dealDamage':
      return parseDamageAction(dsl)
    case 'heal':
      return parseHealAction(dsl)
    case 'addMark':
      return parseAddMarkAction(dsl)
    case 'addStacks':
      return parseAddStacksAction(dsl)
    case 'consumeStacks':
      return parseConsumeStacksAction(dsl)
    case 'modifyStat':
      return parseModifyStatAction(dsl)
    case 'statStageBuff':
      return parseStatStageBuffAction(dsl)
    case 'addRage':
      return parseAddRageAction(dsl)
    case 'amplifyPower':
      return parseAmplifyPowerAction(dsl)
    case 'addPower':
      return parseAddPowerAction(dsl)
    case 'transferMark':
      return parseTransferMark(dsl)
    case 'stun':
      return parseStunAction(dsl)
    case 'setSureHit':
      return parseSetSureHitAction(dsl)
    case 'destroyMark':
      return parseDestroyMarkAction(dsl)
    case 'setSkill':
      return parseSetSkill(dsl)
    case 'preventDamage':
      return parsePreventDamage(dsl)
    case 'setActualTarget':
      return parseSetActualTarget(dsl)
  }
}

// Common value parser reused across actions [source_id: parse.ts]
export function parseValue(v: Value): string | number | boolean | ValueSource<SelectorOpinion> {
  if (v.type === 'raw:number') return v.value as number
  if (v.type === 'raw:string') return v.value as string
  if (v.type === 'raw:boolean') return v.value as boolean
  if (v.type === 'entity:baseMark')
    return (() => [DataRepository.getInstance().getMark(v.value as baseMarkId)]) as ValueSource<BaseMark>
  if (v.type === 'entity:baseSkill')
    return (() => [DataRepository.getInstance().getSkill(v.value as baseSkillId)]) as ValueSource<BaseSkill>
  if (v.type === 'dynamic') return parseSelector(v.selector)
  throw Error('未知的数值类型')
}

export function isNumberValue(value: ValueSource<SelectorOpinion>): value is number {
  return typeof value === 'number'
}

export function parseDamageAction(dsl: Extract<OperatorDSL, { type: 'dealDamage' }>) {
  const value = parseValue(dsl.value)
  if (!isNumberValue(value)) {
    throw new Error('Damage value must be a number')
  }
  return parseSelector<Pet>(dsl.target).apply(Operators.dealDamage(parseValue(dsl.value) as ValueSource<number>))
}

export function parseHealAction(dsl: Extract<OperatorDSL, { type: 'heal' }>) {
  const selector = parseSelector<Pet>(dsl.target)
  return selector.apply(Operators.heal(parseValue(dsl.value) as ValueSource<number>))
}

export function parseAddMarkAction(dsl: Extract<OperatorDSL, { type: 'addMark' }>) {
  const selector = parseSelector<Pet>(dsl.target)
  const mark = parseValue(dsl.mark) as ValueSource<BaseMark>
  const duration = dsl.duration ? (parseValue(dsl.duration) as ValueSource<number>) : undefined
  const stack = dsl.stack ? (parseValue(dsl.stack) as ValueSource<number>) : undefined
  return selector.apply(Operators.addMark(mark, stack, duration))
}

// Pattern for stack-related actions [source_id: operator.ts]
export function parseAddStacksAction(dsl: Extract<OperatorDSL, { type: 'addStacks' }>) {
  return parseSelector<MarkInstance>(dsl.target).apply(Operators.addStack(dsl.value))
}

export function parseConsumeStacksAction(dsl: Extract<OperatorDSL, { type: 'consumeStacks' }>) {
  return parseSelector<MarkInstance>(dsl.target).apply(Operators.consumeStacks(dsl.value))
}

// Stat modification pattern [source_id: parse.ts]
export function parseModifyStatAction(dsl: Extract<OperatorDSL, { type: 'modifyStat' }>) {
  return parseSelector<Pet>(dsl.target).apply(
    Operators.modifyStat(
      parseValue(dsl.statType) as ValueSource<StatTypeOnBattle>,
      parseValue(dsl.value) as ValueSource<number>,
      parseValue(dsl.percent) as ValueSource<number>,
    ),
  )
}

export function parseStatStageBuffAction(dsl: Extract<OperatorDSL, { type: 'statStageBuff' }>) {
  return parseSelector<Pet>(dsl.target).apply(
    Operators.statStageBuff(
      parseValue(dsl.statType) as ValueSource<StatTypeWithoutHp>,
      parseValue(dsl.value) as ValueSource<number>,
    ),
  )
}

// Utility action handlers [source_id: operator.ts]
export function parseAddRageAction(dsl: Extract<OperatorDSL, { type: 'addRage' }>) {
  return parseSelector<Player>(dsl.target).apply(Operators.addRage(parseValue(dsl.value) as ValueSource<number>))
}

export function parseAmplifyPowerAction(dsl: Extract<OperatorDSL, { type: 'amplifyPower' }>) {
  return parseSelector<UseSkillContext>(dsl.target).apply(
    Operators.amplifyPower(parseValue(dsl.value) as ValueSource<number>),
  )
}

export function parseAddPowerAction(dsl: Extract<OperatorDSL, { type: 'addPower' }>) {
  return parseSelector<UseSkillContext>(dsl.target).apply(
    Operators.addPower(parseValue(dsl.value) as ValueSource<number>),
  )
}

export function parseStunAction(dsl: Extract<OperatorDSL, { type: 'stun' }>) {
  return parseSelector<UseSkillContext>(dsl.target).apply(Operators.stun())
}

export function parseTransferMark(dsl: Extract<OperatorDSL, { type: 'transferMark' }>) {
  return parseSelector<Pet>(dsl.target).apply(Operators.transferMark(parseValue(dsl.mark) as ValueSource<MarkInstance>))
}

export function parseSetSureHitAction(dsl: Extract<OperatorDSL, { type: 'setSureHit' }>) {
  return parseSelector<UseSkillContext>(dsl.target).apply(
    Operators.setSureHit(parseValue(dsl.value) as ValueSource<boolean>),
  )
}

export function parseDestroyMarkAction(dsl: Extract<OperatorDSL, { type: 'destroyMark' }>) {
  return parseSelector<MarkInstance>(dsl.target).apply(Operators.destroyMark())
}

export function parseSetSkill(dsl: Extract<OperatorDSL, { type: 'setSkill' }>) {
  return parseSelector<UseSkillContext>(dsl.target).apply(
    Operators.setSkill(parseValue(dsl.value) as ValueSource<SkillInstance>),
  )
}

export function parsePreventDamage(dsl: Extract<OperatorDSL, { type: 'preventDamage' }>) {
  return parseSelector<DamageContext>(dsl.target).apply(Operators.preventDamage())
}

export function parseSetActualTarget(dsl: Extract<OperatorDSL, { type: 'setActualTarget' }>) {
  return parseSelector<UseSkillContext>(dsl.target).apply(
    Operators.setActualTarget(parseValue(dsl.newTarget) as ValueSource<Pet>),
  )
}

export function parseCondition(dsl: ConditionDSL): Condition {
  switch (dsl.type) {
    case 'evaluate':
      return parseEvaluateCondition(dsl)
    case 'some':
      return parseSomeCondition(dsl)
    case 'every':
      return parseEveryCondition(dsl)
    case 'not':
      return parseNotCondition(dsl)
    case 'selfUseSkill':
      return Conditions.selfUseSkill()
    case 'checkSelf':
      return Conditions.checkSelf()
    case 'foeUseSkill':
      return Conditions.foeUseSkill()
    case 'selfDamage':
      return Conditions.selfDamage()
  }
}

export function parseEvaluateCondition(dsl: Extract<ConditionDSL, { type: 'evaluate' }>): Condition {
  const target = parseSelector(dsl.target)
  const evaluator = parseEvaluator(dsl.evaluator)
  return target.condition(evaluator)
}

export function parseSomeCondition(dsl: Extract<ConditionDSL, { type: 'some' }>): Condition {
  return Conditions.some(dsl.conditions.map(parseCondition))
}

export function parseEveryCondition(dsl: Extract<ConditionDSL, { type: 'every' }>): Condition {
  return Conditions.every(dsl.conditions.map(parseCondition))
}

export function parseNotCondition(dsl: Extract<ConditionDSL, { type: 'not' }>): Condition {
  return Conditions.not(parseCondition(dsl.condition))
}

function validatePath(selector: ChainableSelector<SelectorOpinion>, path: string) {
  if (!RuntimeTypeChecker.validatePath(selector.type, path)) {
    const expected = RuntimeTypeChecker.getExpectedType(selector.type, path)
    throw new Error(`[路径校验失败] 路径 '${path}' 在类型 ${selector.type} 中不存在\n预期类型: ${expected}`)
  }
}
