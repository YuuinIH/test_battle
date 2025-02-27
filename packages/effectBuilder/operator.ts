import {
  AddMarkContext,
  BaseMark,
  Battle,
  DamageContext,
  EffectContext,
  HealContext,
  MarkInstance,
  type MarkOwner,
  Pet,
  Player,
  RageContext,
  UseSkillContext,
} from '@test-battle/battle'
import { EffectTrigger, type StatTypeOnBattle, StatTypeWithoutHp } from '@test-battle/const'
import type { Operator } from './effectBuilder'
import {
  ChainableSelector,
  isPropertyRef,
  type PrimitiveOpinion,
  type PropertyRef,
  type SelectorOpinion,
} from './selector'
import { type ValueSource } from './effectBuilder'

function createDynamicOperator<T extends SelectorOpinion, U extends SelectorOpinion>(
  handler: (value: U[], target: T, context: EffectContext<EffectTrigger>) => void,
) {
  return (source: ValueSource<U>) => {
    return (context: EffectContext<EffectTrigger>, targets: T[]) => {
      targets.forEach(target => {
        let finalValue: U[] = []

        if (typeof source === 'function') {
          try {
            finalValue = (source as (context: EffectContext<EffectTrigger>) => U[])(context)
          } catch {
            finalValue = []
          }
        } else if (source instanceof ChainableSelector) {
          const value = source.build()(context)
          finalValue = [isPropertyRef(value) ? value.get() : value]
        } else {
          finalValue = [source]
        }

        if (finalValue.length != 0) {
          return handler(finalValue, target, context)
        }
      })
    }
  }
}
// 操作符系统

export const Operators = {
  dealDamage: createDynamicOperator<Pet, number>((value, pet, context) => {
    let source
    if (context.parent instanceof UseSkillContext) source = context.parent.pet
    else source = context.source
    pet.damage(new DamageContext(context, source, value[0]))
  }),

  heal: createDynamicOperator<Pet, number>((value, pet, context) => {
    pet.heal(new HealContext(context, context.source, value[0]))
  }),

  addMark:
    <T extends MarkOwner>(mark: BaseMark, stack: number) =>
    (context: EffectContext<EffectTrigger>, targets: T[]) => {
      targets.forEach(target => {
        target.addMark(new AddMarkContext(context, target, mark, stack))
      })
    },

  transferMark:
    <T extends Battle | Pet, U extends MarkInstance>(mark: ValueSource<U>) =>
    (context: EffectContext<EffectTrigger>, targets: T[]) => {
      const _mark = GetValueFromSource(context, mark)
      _mark.forEach(m => {
        m.transfer(context, targets[0])
      })
    },

  addStack:
    <T extends MarkInstance>(value: number) =>
    (context: EffectContext<EffectTrigger>, targets: T[]) => {
      targets.forEach(mark => mark.addStack(value))
    },

  consumeStacks:
    <T extends MarkInstance>(value: number) =>
    (context: EffectContext<EffectTrigger>, targets: T[]) => {
      targets.forEach(mark => mark.consumeStack(context, value))
    },

  // 玩家操作
  addRage: createDynamicOperator<Player, number>((value, player, context) => {
    player.addRage(new RageContext(context, player, 'effect', 'add', value[0]))
  }),

  modifyStat:
    (stat: ValueSource<StatTypeOnBattle>, percent: ValueSource<number>, value: ValueSource<number>) =>
    (context: EffectContext<EffectTrigger>, targets: Pet[]) => {
      targets.forEach(pet => {
        const _stat = GetValueFromSource(context, stat)[0]
        const _percent = GetValueFromSource(context, percent)[0] ?? 0
        const _value = GetValueFromSource(context, value)[0] ?? 0
        pet.statModifiers[_stat][0] += _percent
        pet.statModifiers[_stat][1] += _value
      })
    },

  amplifyPower:
    (multiplier: ValueSource<number>): Operator<UseSkillContext> =>
    (context: EffectContext<EffectTrigger>, contexts: UseSkillContext[]) => {
      contexts.forEach(skillCtx => {
        const finalMultiplier = GetValueFromSource(context, multiplier)
        finalMultiplier.forEach(v => skillCtx.amplifyPower(v))
      })
    },

  addPower: (value: ValueSource<number>) => (context: EffectContext<EffectTrigger>, contexts: UseSkillContext[]) => {
    contexts.forEach(skillCtx => {
      const _value = GetValueFromSource(context, value)
      _value.forEach(v => skillCtx.addPower(v))
    })
  },

  statStageBuff:
    (statType: ValueSource<StatTypeWithoutHp>, value: ValueSource<number>) =>
    (context: EffectContext<EffectTrigger>, target: Pet[]) => {
      //TODO: 万一找不到呢？
      const _value = GetValueFromSource(context, value)[0] ?? 0
      const _statType = GetValueFromSource(context, statType)[0] ?? null
      target.forEach(v => v.addStatStage(context, _statType, _value))
    },

  setValue: <U extends SelectorOpinion, V extends PrimitiveOpinion>(
    value: ValueSource<V>,
  ): Operator<PropertyRef<U, V>> => {
    return (context, refs) => {
      const _value = GetValueFromSource(context, value)
      refs.forEach(ref => ref.set(_value[0]))
    }
  },

  /** 数值累加操作 */
  addValue: (valueSource: ValueSource<number>): Operator<PropertyRef<any, number>> => {
    return (context, refs) => {
      const values = GetValueFromSource(context, valueSource)
      refs.forEach((ref, index) => {
        const delta = values[index % values.length]
        ref.set(ref.get() + delta)
      })
    }
  },

  /** 布尔值翻转 */
  toggle: (): Operator<PropertyRef<any, boolean>> => {
    return (context, refs) => {
      refs.forEach(ref => ref.set(!ref.get()))
    }
  },
}

export function GetValueFromSource<T extends SelectorOpinion>(
  context: EffectContext<EffectTrigger>,
  source: ValueSource<T>,
): T[] {
  if (source instanceof ChainableSelector) {
    const result = source.build()(context)
    return result.flatMap(item => (isPropertyRef(item) ? [item.get()] : [item]))
  }
  if (typeof source == 'function') return source(context) //TargetSelector
  if (isPropertyRef(source)) {
    return [source.get()] // 返回当前值
  }
  return [source]
}
