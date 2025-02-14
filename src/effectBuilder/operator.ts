import { EffectTrigger } from '@core/effect'
import { EffectContext, UseSkillContext, DamageContext, HealContext, AddMarkContext, RageContext } from '@core/context'
import { CreateStatStageMark, Mark } from '@core/mark'
import { Pet } from '@core/pet'
import { Player } from '@core/player'
import { type SelectorOpinion, type ValueSource, ChainableSelector, GetValueFromSource } from './selector'
import { StatTypeOnBattle, StatTypeWithoutHp } from '@/core/const'
import { Operator } from './effectBuilder'

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
          finalValue = source.build()(context)
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
    <T extends Pet>(mark: Mark, stack: number) =>
    (context: EffectContext<EffectTrigger>, targets: T[]) => {
      targets.forEach(pet => {
        pet.addMark(new AddMarkContext(context, pet, mark, stack))
      })
    },

  transferMark:
    <T extends Pet, U extends Mark>(mark: ValueSource<U>) =>
    (context: EffectContext<EffectTrigger>, targets: T[]) => {
      const _mark = GetValueFromSource(context, mark)
      _mark.forEach(m => {
        m.transfer(context, targets[0])
      })
    },

  addStack:
    <T extends Mark>(markid: string, value: number) =>
    (context: EffectContext<EffectTrigger>, targets: T[]) => {
      targets.filter(mark => mark.id == markid).forEach(mark => mark.addStack(value))
    },

  consumeStacks:
    <T extends Mark>(markid: string, value: number) =>
    (context: EffectContext<EffectTrigger>, targets: T[]) => {
      targets.filter(mark => mark.id == markid).forEach(mark => mark.consumeStack(context, value))
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
        finalMultiplier.forEach(v => (skillCtx.power *= v))
      })
    },

  addPower: (value: ValueSource<number>) => (context: EffectContext<EffectTrigger>, contexts: UseSkillContext[]) => {
    contexts.forEach(skillCtx => {
      const _value = GetValueFromSource(context, value)
      _value.forEach(v => (skillCtx.power += v))
    })
  },

  statStageBuff:
    (statType: ValueSource<StatTypeWithoutHp>, value: ValueSource<number>) =>
    (context: EffectContext<EffectTrigger>, target: Pet[]) => {
      //TODO: 万一找不到呢？
      const _value = GetValueFromSource(context, value)[0] ?? 0
      const _statType = GetValueFromSource(context, statType)[0] ?? null
      const upMark = CreateStatStageMark(_statType, _value)
      target.forEach(v => v.addMark(new AddMarkContext(context, v, upMark, _value)))
    },
}
