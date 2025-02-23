import { Effect, MarkInstance } from '@test-battle/battle'
import { EffectTrigger } from '@test-battle/const'
import { DataRepository } from '@test-battle/data-repository'
import { MarkSchema } from '@test-battle/schema'

export class MarkParser {
  static parse(rawData: unknown): MarkInstance {
    const validated = MarkSchema.parse(rawData)

    let effects: Effect<EffectTrigger>[] = []
    if (validated.effect) {
      effects = validated.effect.map(effectId => {
        try {
          return DataRepository.getInstance().getEffect(effectId)
        } catch (e) {
          throw new Error(
            `[MarkParser] Failed to load effect '${effectId}' for mark '${validated.name}': ${(e as Error).message}`,
          )
        }
      })
    }

    return new MarkInstance(validated.id, validated.name, effects, validated.config, validated.tags)
  }
}
