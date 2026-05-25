import { MODULE_ID, FLAGS, SETTINGS } from '../constants.mjs';
import { evaluateFormula, evaluateRequirement } from './formula.mjs';

/**
 * Returns the array of language IDs acquired by this actor.
 * @param {Actor} actor
 * @returns {string[]}
 */
export function getAcquiredLanguageIds(actor) {
  return actor.getFlag(MODULE_ID, FLAGS.ACQUIRED) ?? [];
}

/**
 * Finds a language object and its parent category within the world config.
 * Returns { language, category } or null if not found.
 * @param {string} languageId
 * @param {object} config
 * @returns {{ language: object, category: object }|null}
 */
export function findLanguage(languageId, config) {
  for (const category of (config.categories ?? [])) {
    for (const language of (category.languages ?? [])) {
      if (language.id === languageId) return { language, category };
    }
  }
  return null;
}

/**
 * Resolves the effective acquisition cost for a language, using a unified
 * candidate/competition model for both cost rules and cousin discounts.
 *
 * All discount sources — the first matching cost rule and all acquired cousin
 * discounts — are scored as candidates (effectiveCost = max(0, baseCost − discountAmount)).
 * The candidate with the lowest effective cost wins; discounts do NOT stack.
 *
 * Returns:
 *   effectiveCost     — the cost to use for affordability and acquisition
 *   originalCost      — base cost before any discount
 *   cousinApplied     — the cousin object that won the contest, or null
 *   requirementWaived — true if the winning cousin waives the requirement
 *   costRuleApplied   — the cost rule object that won the contest, or null
 *
 * @param {object} language
 * @param {object} category
 * @param {Actor} actor
 * @returns {Promise<{ effectiveCost: number, originalCost: number, cousinApplied: object|null, requirementWaived: boolean, costRuleApplied: object|null }>}
 */
export async function resolveLanguageCost(language, category, actor) {
  const baseCost = Number(language.cost ?? category.cost ?? 0);
  const candidates = [];

  // First matching cost rule enters the candidate pool.
  for (const rule of (language.costRules ?? [])) {
    try {
      if (await evaluateRequirement(rule.requirement, actor)) {
        const da = await evaluateFormula(String(rule.discountAmount ?? 0), actor);
        candidates.push({ effectiveCost: Math.max(0, baseCost - da), source: 'rule', rule });
        break;
      }
    } catch (_) {
      // Evaluation error — skip this rule.
    }
  }

  // All acquired cousin discounts enter the candidate pool.
  const acquiredIds = getAcquiredLanguageIds(actor);
  for (const cousin of (language.cousins ?? []).filter(c => acquiredIds.includes(c.languageId))) {
    try {
      const da = await evaluateFormula(String(cousin.discountAmount ?? 0), actor);
      candidates.push({ effectiveCost: Math.max(0, baseCost - da), source: 'cousin', cousin });
    } catch (_) {
      // Malformed formula — skip this cousin.
    }
  }

  // No candidates → no discount.
  if (candidates.length === 0) {
    return { effectiveCost: baseCost, originalCost: baseCost, cousinApplied: null, requirementWaived: false, costRuleApplied: null };
  }

  // Best discount wins (lowest effective cost); ties go to first found.
  candidates.sort((a, b) => a.effectiveCost - b.effectiveCost);
  const winner = candidates[0];

  if (winner.source === 'cousin') {
    return {
      effectiveCost:     winner.effectiveCost,
      originalCost:      baseCost,
      cousinApplied:     winner.cousin,
      requirementWaived: winner.cousin.waiveRequirement ?? false,
      costRuleApplied:   null,
    };
  }
  return {
    effectiveCost:     winner.effectiveCost,
    originalCost:      baseCost,
    cousinApplied:     null,
    requirementWaived: winner.rule.waiveRequirement ?? false,
    costRuleApplied:   winner.rule,
  };
}

/**
 * Returns the requirement formula string that applies to a language,
 * or null if there is no requirement (or if it was waived by a cousin).
 * @param {object} language
 * @param {object} category
 * @param {boolean} requirementWaived
 * @returns {string|null}
 */
export function resolveEffectiveRequirement(language, category, requirementWaived) {
  if (requirementWaived) return null;
  return language.requirement ?? category.requirement ?? null;
}

/**
 * Calculates the point pool totals for an actor.
 * Spent points are the sum of current base costs (not discounted costs) of all acquired languages.
 *
 * @param {Actor} actor
 * @param {object} config
 * @returns {Promise<{ total: number, base: number, rulesTotal: number, breakdown: object[], spent: number, remaining: number }>}
 */
export async function calculatePointPool(actor, config) {
  const base = await evaluateFormula(config.pointFormula ?? '2', actor);
  const breakdown = [{ label: null, value: base, isBase: true }];
  let rulesTotal = 0;

  for (const rule of (config.pointRules ?? [])) {
    try {
      const passes = await evaluateRequirement(rule.condition, actor);
      if (!passes) continue;
      const mod = await evaluateFormula(String(rule.modifier ?? '0'), actor);
      rulesTotal += mod;
      breakdown.push({ label: rule.label || null, value: mod, isBase: false });
    } catch (_) { /* skip malformed rules silently */ }
  }

  const total = base + rulesTotal;
  const acquiredIds = getAcquiredLanguageIds(actor);

  let spent = 0;
  for (const id of acquiredIds) {
    const found = findLanguage(id, config);
    if (!found) continue;
    const { effectiveCost } = await resolveLanguageCost(found.language, found.category, actor);
    spent += effectiveCost;
  }

  return { total, base, rulesTotal, breakdown, spent, remaining: total - spent };
}
