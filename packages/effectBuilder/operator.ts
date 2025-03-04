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
  SkillInstance,
  UseSkillContext,
} from '@test-battle/battle'
import { EffectTrigger, type StatTypeOnBattle, StatTypeWithoutHp } from '@test-battle/const'
import type { Operator } from './effectBuilder'
import { ChainableSelector, type PrimitiveOpinion, type PropertyRef, type SelectorOpinion } from './selector'
import { type ValueSource } from './effectBuilder'

function createDynamicOperator<T, U>(handler: (value: U[], target: T, context: EffectContext<EffectTrigger>) => void) {
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
          finalValue = value
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

export const Operators = {
  dealDamage: createDynamicOperator<Pet, number>((value, pet, context) => {
    let source
    if (context.parent instanceof UseSkillContext) source = context.parent.pet
    else source = context.source
    pet.damage(new DamageContext(context, source, pet, value[0]))
  }),

  heal: createDynamicOperator<Pet, number>((value, pet, context) => {
    pet.heal(new HealContext(context, context.source, value[0]))
  }),

  addMark:
    <T extends MarkOwner>(mark: ValueSource<BaseMark>, stack?: ValueSource<number>, duration?: ValueSource<number>) =>
    (context: EffectContext<EffectTrigger>, targets: T[]) => {
      const marks = GetValueFromSource(context, mark)
      if (marks.length === 0) return

      const stackValue = stack ? GetValueFromSource(context, stack)[0] : undefined
      const durationValue = duration ? GetValueFromSource(context, duration)[0] : undefined
      targets.forEach(target => {
        target.addMark(new AddMarkContext(context, target, marks[0], stackValue, durationValue))
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

  destroyMark:
    <T extends MarkInstance>() =>
    (context: EffectContext<EffectTrigger>, targets: T[]) => {
      targets.forEach(m => {
        m.destroy(context)
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
  addRage: createDynamicOperator<Player | Pet, number>((value, target, context) => {
    target.addRage(
      new RageContext(context, target instanceof Player ? target : target.owner!, 'effect', 'add', value[0]),
    )
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
      if (_value.length == 0) return
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

  stun: (): Operator<UseSkillContext> => {
    return (context, contexts) => {
      contexts.forEach(ctx => {
        ctx.available = false
      })
    }
  },

  setSureHit: (value: ValueSource<boolean>): Operator<UseSkillContext> => {
    return (context, contexts) => {
      const _value = GetValueFromSource(context, value)
      contexts.forEach(ctx => {
        ctx.setSureHit(_value[0])
      })
    }
  },

  setSkill: (skill: ValueSource<SkillInstance>): Operator<UseSkillContext> => {
    return (context, contexts) => {
      const _skill = GetValueFromSource(context, skill)
      if (_skill.length === 0) return
      contexts.forEach(ctx => {
        ctx.setSkill(_skill[0])
      })
    }
  },

  preventDamage: (): Operator<DamageContext> => {
    return (context, contexts) => {
      contexts.forEach(ctx => {
        ctx.available = false
      })
    }
  },

  setActualTarget: (newTarget: ValueSource<Pet>): Operator<UseSkillContext> => {
    return (context, contexts) => {
      const _target = GetValueFromSource(context, newTarget)
      if (_target.length === 0) return
      contexts.forEach(ctx => {
        ctx.setActualTarget(_target[0])
      })
    }
  },
}

export function GetValueFromSource<T extends SelectorOpinion>(
  context: EffectContext<EffectTrigger>,
  source: ValueSource<T>,
): T[] {
  if (source instanceof ChainableSelector) {
    const result = source.build()(context)
    return result
  }
  if (typeof source == 'function') return source(context) //TargetSelector
  return [source]
}
