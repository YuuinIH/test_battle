import { DamageContext, MarkInstance, SkillInstance, UseSkillContext } from '@test-battle/battle'
import type { Condition } from 'effectBuilder'

export const Conditions = {
  some: (...conditions: Condition[]): Condition => {
    return context => {
      return conditions.some(condition => condition(context))
    }
  },
  every: (...conditions: Condition[]): Condition => {
    return context => {
      return conditions.every(condition => condition(context))
    }
  },
  not: (condition: Condition): Condition => {
    return context => {
      return !condition(context)
    }
  },

  //用于技能，检查正在使用的技能是否是自身，仅当使用的技能是自身时生效
  selfUseSkill: (): Condition => {
    return context => {
      if (context.parent instanceof UseSkillContext && context.source instanceof SkillInstance) {
        return context.source === context.parent.skill
      }
      return false
    }
  },

  checkSelf: (): Condition => {
    return context => {
      if (context.parent instanceof UseSkillContext) {
        return context.source.owner === context.parent.pet
      }
      return false
    }
  },

  foeUseSkill: (): Condition => {
    return context => {
      if (context.parent instanceof UseSkillContext) {
        return context.source.owner !== context.parent.pet
      }
      return false
    }
  },

  selfDamage: (): Condition => {
    return context => {
      if (context.parent instanceof DamageContext) {
        return context.source.owner === context.parent.target
      }
      return false
    }
  },
}
