import { Skill } from './skill'
import { Element } from './element'
import {
  type OwnedEntity,
  type Prototype,
  RAGE_PER_TURN,
  STAT_STAGE_MULTIPLIER,
  StatBuffOnBattle,
  type StatOnBattle,
  type StatOutBattle,
  StatType,
  type StatTypeOnBattle,
  StatTypeOnlyBattle,
  StatTypeWithoutHp,
} from './const'
import { Nature, NatureMap } from './nature'
import { Player } from './player'
import { StatLevelMark, Mark } from './mark'
import {
  AddMarkContext,
  DamageContext,
  EffectContext,
  HealContext,
  RemoveMarkContext,
  SwitchPetContext,
} from './context'
import { BattleMessageType, PetMessage } from './message'
import { EffectTrigger } from './effect'

export interface Species extends Prototype {
  id: string //约定:id为原中文名的拼音拼写
  num: number //用于原游戏内的序号
  name: string
  element: Element
  baseStats: { [key in StatType]: number }
  genderRatio?: [number, number]
  ability?: Mark[] //TODO: 特性
  emblem?: Mark[] //TODO: 纹章
}

// 精灵类
export class Pet implements OwnedEntity {
  public currentHp: number
  public baseCritRate: number = 0.1 // 暴击率默认为10%
  public baseAccuracy: number = 1 // 命中率默认为100%
  public statStage: Partial<Record<StatTypeOnBattle, number>> = {} //能力等级
  public statModifiers: StatBuffOnBattle = {
    atk: [100, 0],
    def: [100, 0],
    spa: [100, 0],
    spd: [100, 0],
    spe: [100, 0],
    accuracy: [100, 0],
    critRate: [100, 0],
    evasion: [100, 0],
    ragePerTurn: [15, 0],
  }
  public element: Element
  public isAlive: boolean = true
  public lastUseSkill: Skill | null = null
  public baseRageObtainEfficiency: number = 1
  public owner: Player | null
  public marks: Mark[] = []
  public maxHp: number

  constructor(
    public readonly name: string,
    public readonly id: string,
    public readonly species: Species,
    public readonly level: number,
    public readonly evs: StatOutBattle,
    public readonly ivs: StatOutBattle,
    public readonly nature: Nature,
    public readonly skills: Skill[],
    // abilities?: Mark,
    // emblem?: Mark, //TODO: 暂时没想好怎么实现特性和纹章
    maxHp?: number, //可以额外手动设置hp
  ) {
    this.maxHp = maxHp ? maxHp : this.calculateMaxHp()
    this.currentHp = this.maxHp
    this.element = species.element
    this.owner = null
  }

  public damage(context: DamageContext): boolean {
    //通过技能威力造成伤害的事件
    if (context.source instanceof Pet) {
      context.battle.applyEffects(context, EffectTrigger.OnDamage)
    }
    if (!context.available) {
      context.battle.emitMessage(BattleMessageType.Info, {
        message: `${this.name}受到的伤害被防止了！!`,
      })
      return this.isAlive
    }
    this.currentHp = Math.max(0, this.currentHp - context.value)
    if (this.currentHp === 0) {
      this.isAlive = false
    }

    context.battle!.emitMessage(BattleMessageType.Damage, {
      currentHp: this.currentHp,
      maxHp: this.maxHp!,
      source: context.source.id,
      target: this.id,
      damage: context.value,
      isCrit: context.crit,
      effectiveness: context.effectiveness,
      damageType: context.damageType,
    })
    return this.isAlive
  }

  public heal(context: HealContext): boolean {
    context.battle.applyEffects(context, EffectTrigger.OnHeal)
    if (!context.available) {
      context.battle.emitMessage(BattleMessageType.Info, {
        message: `${this.name}受到的治疗被阻止了！!`,
      })
      return this.isAlive
    }
    this.currentHp = Math.min(this.maxHp!, this.currentHp + context.value)
    return this.isAlive
  }

  public addMark(context: AddMarkContext) {
    if (!context.available) return

    const newMark = context.mark.clone(context)
    if (context.stack) newMark._stack = context.stack
    const existingOppositeMark = this.marks.find(
      mark => mark instanceof StatLevelMark && newMark instanceof StatLevelMark && mark.isOppositeMark(newMark),
    )

    // 优先抵消互斥印记
    if (existingOppositeMark) {
      existingOppositeMark.tryStack(context) // 触发抵消逻辑
      return
    }

    const existingMark = this.marks.find(mark => mark.id === context.mark.id)
    if (existingMark) {
      existingMark.tryStack(context)
    } else {
      context.battle.applyEffects(context, EffectTrigger.OnAddMark)
      context.battle.applyEffects(context, EffectTrigger.OnMarkCreate, newMark)
      newMark.attachTo(this)
      this.marks.push(newMark)
      if (newMark instanceof StatLevelMark) {
        this.statStage[newMark.statType] = newMark.level
      }
    }
  }

  public removeMark(context: RemoveMarkContext) {
    this.marks = this.marks.filter(mark => mark.id !== context.mark.id)
  }

  private calculateStat(type: StatTypeOnBattle): number {
    if (type in StatTypeOnlyBattle) {
      return this.calculateStatOnlyBattle(type)
    } else if (type in StatTypeWithoutHp) {
      return this.calculateStatWithoutHp(type as StatTypeWithoutHp)
    }
    throw new Error('Invalid StatType')
  }

  private calculateStatWithoutHp(type: StatTypeWithoutHp): number {
    const baseStat = this.species.baseStats[type]
    const natureMultiplier = NatureMap[this.nature][type]
    const level = this.level
    const iv = this.ivs[type]
    const ev = this.evs[type]
    const base = Math.floor(((2 * baseStat + iv + Math.floor(ev / 4)) * level) / 100 + 5) * natureMultiplier
    const result = (base + this.statModifiers[type][1]) * (this.statModifiers[type][0] / 100)

    return result
  }

  private calculateStatOnlyBattle(type: StatTypeOnBattle): number {
    let base: number
    if (type === 'accuracy') {
      base = this.baseAccuracy
    } else if (type === 'critRate') {
      base = this.baseCritRate
    } else if (type === 'evasion') {
      base = 0
    } else if (type === 'ragePerTurn') {
      base = RAGE_PER_TURN
    } else {
      return this.calculateStatWithoutHp(type)
    }
    return ((base + this.statModifiers[type][1]) * this.statModifiers[type][0]) / 100
  }

  private calculateMaxHp(): number {
    const baseStat = this.species.baseStats.hp
    const level = this.level
    const iv = this.ivs.hp
    const ev = this.evs.hp
    const base = Math.floor(((2 * baseStat + iv + Math.floor(ev / 4)) * level) / 100) + level + 10
    return base
  }

  public setOwner(player: Player) {
    this.owner = player
  }

  get stat(): StatOnBattle {
    return {
      atk: this.calculateStat(StatTypeWithoutHp.atk),
      def: this.calculateStat(StatTypeWithoutHp.def),
      spa: this.calculateStat(StatTypeWithoutHp.spa),
      spd: this.calculateStat(StatTypeWithoutHp.spd),
      spe: this.calculateStat(StatTypeWithoutHp.spe),
      accuracy: this.calculateStat(StatTypeOnlyBattle.accuracy),
      critRate: this.calculateStat(StatTypeOnlyBattle.critRate),
      evasion: this.calculateStat(StatTypeOnlyBattle.evasion),
      ragePerTurn: this.calculateStat(StatTypeOnlyBattle.ragePerTurn),
    }
  }

  get actualStat(): Record<StatTypeOnBattle, number> {
    const base = this.stat
    const modifiers = this.calculateStageModifiers()

    return {
      atk: modifiers.atk ?? base.atk,
      def: modifiers.def ?? base.def,
      spa: modifiers.spa ?? base.spa,
      spd: modifiers.spd ?? base.spd,
      spe: modifiers.spe ?? base.spe,
      accuracy: modifiers.accuracy ?? base.accuracy,
      evasion: modifiers.evasion ?? base.evasion,
      critRate: modifiers.critRate ?? base.critRate,
      ragePerTurn: modifiers.ragePerTurn ?? base.ragePerTurn,
    }
  }

  private calculateStageModifiers(): Partial<Record<StatTypeOnBattle, number>> {
    const modifiers: Partial<Record<StatTypeOnBattle, number>> = {}
    Object.entries(this.statStage).forEach(([stat, stage]) => {
      const statType = stat as StatTypeOnBattle
      const baseValue = this.stat[statType] // 直接使用 stat 中的基础值
      modifiers[statType] = this.applyStageModifier(baseValue, stage)
    })
    return modifiers
  }

  // 增强安全性的修正计算
  private applyStageModifier(base: number, stage: number): number {
    const validStage = Math.max(-6, Math.min(6, stage)) // 强制等级范围
    const index = validStage + 6
    return Math.floor(base * STAT_STAGE_MULTIPLIER[index])
  }

  // 清理能力等级时同时清除相关印记
  public clearStatStage(context: EffectContext<EffectTrigger>) {
    this.statStage = {}
    this.marks = this.marks.filter(mark => {
      if (mark instanceof StatLevelMark) {
        mark.destory(context)
        return false
      }
      return true
    })
  }

  public switchOut(context: SwitchPetContext) {
    context.battle.applyEffects(context, EffectTrigger.OnOwnerSwitchOut, ...this.marks)
    this.marks = this.marks.filter(mark => {
      const shouldKeep = mark.config.keepOnSwitchOut ?? false

      // 需要转移的印记
      if (mark.config.transferOnSwitch && context.target) {
        context.target.addMark(new AddMarkContext(context, context.target, mark))
      }
      if (!shouldKeep) {
        mark.destory(context)
      }

      return shouldKeep
    })
  }

  switchIn(context: SwitchPetContext) {
    context.battle.applyEffects(context, EffectTrigger.OnOwnerSwitchIn, ...this.marks)
  }

  public toMessage(): PetMessage {
    return {
      name: this.name,
      uid: this.id,
      speciesID: this.species.id,
      element: this.element,
      currentHp: this.currentHp,
      maxHp: this.maxHp,
      skills: this.skills.map(s => s.toMessage()),
      stats: this.actualStat,
      marks: this.marks.map(m => m.toMessage()),
    }
  }

  get status(): string {
    return [`NAME:${this.name} HP: ${this.currentHp}/${this.maxHp}`].join(' | ')
  }
}
