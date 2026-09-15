import type { PluginRest } from '../api/runs'
import type { UsageSnapshot } from '../trace/usage'

import { isRecord, numberValue } from './serialization'

export interface ModelPricing {
  /** USD per million prompt tokens. */
  inputPerMillion: number
  /** USD per million completion tokens. */
  outputPerMillion: number
}

// Rates change far more slowly than runs arrive, so one lookup per model id
// per session is plenty. A miss is cached too — an unpriced model should not
// re-request on every completed run.
const pricingCache = new Map<string, ModelPricing | null>()

function readPricing(value: unknown): ModelPricing | null {
  if (!isRecord(value)) {
    return null
  }

  const inputPerMillion = numberValue(value.inputPerMillion)
  const outputPerMillion = numberValue(value.outputPerMillion)

  if (inputPerMillion === undefined || outputPerMillion === undefined) {
    return null
  }

  return { inputPerMillion, outputPerMillion }
}

export async function loadModelPricing(rest: PluginRest, model: string | null): Promise<ModelPricing | null> {
  if (!model) {
    return null
  }

  const cached = pricingCache.get(model)

  if (cached !== undefined) {
    return cached
  }

  let pricing: ModelPricing | null = null

  try {
    pricing = readPricing(await rest('/pricing?model=' + encodeURIComponent(model)))
  } catch {
    // Pricing is decoration on top of the token counts. A backend that is old,
    // disabled, or missing the models.dev cache must cost nothing more than a
    // blank cost cell.
    pricing = null
  }

  pricingCache.set(model, pricing)
  return pricing
}

export function computeCostUsd(
  promptTokens: number | null | undefined,
  completionTokens: number | null | undefined,
  pricing: ModelPricing | null
): number | null {
  if (!pricing || promptTokens === null || promptTokens === undefined) {
    return null
  }

  return (
    (promptTokens / 1_000_000) * pricing.inputPerMillion +
    ((completionTokens ?? 0) / 1_000_000) * pricing.outputPerMillion
  )
}

/** Resolve pricing for a run's model and cost it in one step. */
export async function estimateRunCost(
  rest: PluginRest,
  usage: UsageSnapshot | null,
  fallbackModel: string | null
): Promise<number | null> {
  if (!usage) {
    return null
  }

  // The usage payload's own model id carries the provider prefix that the
  // price lookup needs; the host atom often does not.
  const pricing = await loadModelPricing(rest, usage.model || fallbackModel)

  return computeCostUsd(usage.promptTokens, usage.completionTokens, pricing)
}
