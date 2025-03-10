import {
  STAT_STAGE_MULTIPLIER,
  StatTypeWithoutHp,
  type baseMarkId,
  type markId,
  type effectStateId,
} from '@test-battle/const/const'
import { EffectTrigger } from '@test-battle/const/effectTrigger'
import type { MarkMessage } from '@test-battle/const/message'
import { StackStrategy } from '@test-battle/const/stackStrategy'
import { Battle } from './battle'
import {
  AddMarkContext,
  type AllContext,
  DamageContext,
  EffectContext,
  RemoveMarkContext,
  SwitchPetContext,
  TurnContext,
} from './context'
import { Effect, type EffectContainer, EffectScheduler, EffectState } from './effect'
import { type Instance, type OwnedEntity, type Prototype } from './entity'
import { Pet } from './pet'
import { nanoid } from 'nanoid'

export class BaseMark implements Prototype {
  constructor(
    public readonly id: baseMarkId,
    public readonly name: string,
    public readonly effects: Effect<EffectTrigger>[],
    public readonly config: {
      readonly duration?: number
      readonly persistent?: boolean
      readonly maxStacks?: number
      readonly stackable?: boolean
      readonly stackStrategy?: StackStrategy
      readonly destoyable?: boolean
      readonly isShield?: boolean
      readonly keepOnSwitchOut?: boolean
      readonly transferOnSwitch?: boolean
      readonly inheritOnFaint?: boolean
    } = { destoyable: true },
    public readonly tags: string[] = [],
  ) {}
}

export class MarkInstance implements EffectContainer, OwnedEntity<Battle | Pet | null>, Instance {
  public _stack: number = 1
  public duration: number
  public owner: Battle | Pet | null = null
  public isActive: boolean = true

  public readonly id: markId
  public name: string
  public readonly effects: Effect<EffectTrigger>[]
  public config: {
    duration?: number
    persistent?: boolean
    maxStacks?: number
    stackable?: boolean
    stackStrategy?: StackStrategy
    destoyable?: boolean
    isShield?: boolean
    keepOnSwitchOut?: boolean
    transferOnSwitch?: boolean
    inheritOnFaint?: boolean
  } = { destoyable: true }
  public readonly tags: string[] = []
  public readonly effectState: {
    [id: string]: EffectState
  } = {}

  constructor(
    public readonly base: BaseMark,
    overrides?: {
      duration?: number
      stack?: number
      config?: Partial<BaseMark['config']>
      name?: string
      tags?: string[]
      effects?: Effect<EffectTrigger>[]
    },
  ) {
    this.id = nanoid() as markId
    const mergedConfig = {
      ...base.config,
      ...overrides?.config,
      // 确保枚举类型有默认值
      stackStrategy: overrides?.config?.stackStrategy ?? base.config.stackStrategy ?? StackStrategy.stack,
    }

    this.duration = overrides?.duration ?? mergedConfig.duration ?? 3
    this._stack = overrides?.stack ?? 1
    this.config = mergedConfig
    this.name = overrides?.name ?? base.name
    this.tags = [...base.tags, ...(overrides?.tags || [])]
    this.effects = [...base.effects, ...(overrides?.effects || [])]

    this.config.isShield = mergedConfig.isShield ?? false
    this.effects.forEach(effect => effect.setOwner(this))
  }

  get stack(): number {
    return this._stack
  }

  get baseId(): baseMarkId {
    return this.base.id
  }

  set stack(value: number) {
    this._stack = value
  }

  setOwner(owner: Battle | Pet): void {
    this.owner = owner
  }

  attachTo(target: Battle | Pet) {
    this.owner = target
  }

  private detach() {
    if (this.owner) {
      this.owner.marks = this.owner.marks.filter(m => m !== this)
    }
    this.owner = null
  }

  update(context: TurnContext): boolean {
    if (!this.isActive) return true
    if (this.config.persistent) return false

    this.duration--
    const expired = this.duration <= 0

    if (expired) {
      context.battle.applyEffects(context, EffectTrigger.OnMarkDurationEnd, this)
      this.destroy(context)
    }

    return expired
  }

  addStack(value: number) {
    this.stack = Math.min(this.config.maxStacks ?? Infinity, this.stack + value)
  }

  tryStack(context: AddMarkContext): boolean {
    if (!this.isStackable) return false

    const maxStacks = this.config.maxStacks ?? Infinity
    const strategy = this.config.stackStrategy!
    const newMark = new MarkInstance(context.mark)

    let newStacks = this.stack
    let newDuration = this.duration

    context.battle.applyEffects(context, EffectTrigger.OnStack)

    switch (strategy) {
      case StackStrategy.stack:
        newStacks = Math.min(newStacks + newMark.stack, maxStacks)
        newDuration = Math.max(newDuration, newMark.duration)
        break

      case StackStrategy.refresh:
        newDuration = Math.max(newDuration, newMark.duration)
        break

      case StackStrategy.extend:
        newStacks = Math.min(newStacks + newMark.stack, maxStacks)
        newDuration += newMark.duration
        break

      case StackStrategy.max:
        newStacks = Math.min(Math.max(newStacks, newMark.stack), maxStacks)
        newDuration = Math.max(newDuration, newMark.duration)
        break

      case StackStrategy.replace:
        newStacks = Math.min(newMark.stack, maxStacks)
        newDuration = newMark.duration
        break
      default:
        return false
    }
    // 只有当数值发生变化时才更新
    const changed = newStacks !== this.stack || newDuration !== this.duration
    this.stack = newStacks
    this.duration = newDuration
    this.isActive = true

    return changed
  }

  consumeStack(context: EffectContext<EffectTrigger> | DamageContext, amount: number): number {
    const actual = Math.min(amount, this.stack)
    this.stack -= actual

    if (this.stack <= 0) {
      this.destroy(context)
    }

    return actual
  }

  get isStackable() {
    if (this.config.stackable !== undefined) return this.config.stackable
    return false
  }

  collectEffects(trigger: EffectTrigger, baseContext: AllContext) {
    if (!this.isActive) return

    this.effects
      .filter(effect => effect.trigger === trigger)
      .forEach(effect => {
        const effectContext = new EffectContext(baseContext, trigger, this)
        if (!effect.condition || effect.condition(effectContext)) {
          baseContext.battle.effectScheduler.addEffect(effect, effectContext)
        }
      })
  }

  destroy(
    context:
      | EffectContext<EffectTrigger>
      | TurnContext
      | AddMarkContext
      | SwitchPetContext
      | RemoveMarkContext
      | DamageContext,
  ) {
    if (!this.isActive || !this.config.destoyable) return
    this.isActive = false

    // 触发移除效果
    if (this.owner instanceof Pet) {
      context.battle.applyEffects(context, EffectTrigger.OnMarkDestroy, this)
      context.battle.applyEffects(context, EffectTrigger.OnRemoveMark)
      context.battle.cleanupMarks()
    }
  }

  public transfer(context: EffectContext<EffectTrigger>, target: Battle | Pet) {
    this.attachTo(target)
    target.marks.push(this)
    context.battle.cleanupMarks()
  }

  public setState(id: string, key: string, data: any) {
    if (!this.effectState[id]) {
      this.effectState[id] = new EffectState(id as effectStateId)
    }
    this.effectState[id][key] = data
  }

  public getState(id: string, key: string): any {
    return this.effectState[id]?.[key]
  }

  toMessage(): MarkMessage {
    return {
      name: this.name,
      id: this.id,
      baseId: this.base.id,
      stack: this.stack,
      duration: this.duration,
      isActive: this.isActive,
    }
  }
}

export class BaseStatLevelMark extends BaseMark {
  constructor(
    public readonly statType: StatTypeWithoutHp,
    public initialLevel: number,
    id: baseMarkId,
    name: string,
    effects: Effect<EffectTrigger>[] = [],
    config: BaseMark['config'] = {
      destoyable: true,
    },
  ) {
    super(
      id,
      name,
      effects,
      {
        ...config,
        persistent: true,
        maxStacks: 6,
        stackStrategy: StackStrategy.stack,
      },
      ['statStage'],
    )
  }

  createInstance(context: AddMarkContext): StatLevelMarkInstance {
    const instance = new StatLevelMarkInstance(this)
    instance.level = this.initialLevel
    instance.updateName()
    context.battle.applyEffects(context, EffectTrigger.OnMarkCreate)
    return instance
  }
}

export class StatLevelMarkInstance extends MarkInstance {
  public level: number

  constructor(public readonly base: BaseStatLevelMark) {
    super(base)
    this.level = base.initialLevel
    this.updateName()
  }

  get statType() {
    return this.base.statType
  }

  public updateName() {
    this.name = `${this.base.statType.toUpperCase()} ${this.level > 0 ? '+' : ''}${this.level}`
  }

  tryStack(context: AddMarkContext): boolean {
    const otherMark = context.mark

    if (otherMark instanceof StatLevelMarkInstance && this.isOppositeMark(otherMark)) {
      const remainingLevel = this.level + otherMark.level

      if (remainingLevel === 0) {
        this.destroy(context)
        return true
      } else if (Math.sign(remainingLevel) === Math.sign(this.level)) {
        this.level = remainingLevel
      } else {
        this.level = remainingLevel
      }

      this.updateName()
      if (this.owner instanceof Pet) {
        this.owner.statStage[this.base.statType] = this.level
      }
      return true
    }

    const isSameType = otherMark instanceof StatLevelMarkInstance && otherMark.base.statType === this.base.statType

    if (!isSameType) return super.tryStack(context)

    const maxLevel = (STAT_STAGE_MULTIPLIER.length - 1) / 2
    const newLevel = Math.max(-maxLevel, Math.min(maxLevel, this.level + (otherMark as StatLevelMarkInstance).level))

    if (newLevel === 0) {
      this.destroy(context)
      return true
    }

    this.level = newLevel
    this.updateName()

    if (this.owner instanceof Pet) {
      this.owner.statStage[this.base.statType] = this.level
    }

    return true
  }

  attachTo(target: Pet | Battle) {
    super.attachTo(target)
    if (target instanceof Pet) {
      target.statStage[this.base.statType] = this.level
    }
  }

  public isOppositeMark(other: StatLevelMarkInstance): boolean {
    return this.base.statType === other.base.statType && Math.sign(this.level) !== Math.sign(other.level)
  }
}

export function CreateStatStageMark(statType: StatTypeWithoutHp, level: number): BaseStatLevelMark {
  return new BaseStatLevelMark(
    statType,
    level,
    `stat-stage-${statType}-${level > 0 ? 'up' : 'down'}` as baseMarkId,
    `${statType.toUpperCase()} ${level > 0 ? '+' : ''}${level}`,
    [],
    {
      persistent: true,
      duration: -1,
      maxStacks: 6,
      stackStrategy: StackStrategy.stack,
      destoyable: true,
    },
  )
}
