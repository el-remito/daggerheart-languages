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
 * Returns the labelled formulas that make up the base point pool, in display order.
 * Configs saved before v1.4.0 only have a single `pointFormula` string; it is read
 * as one unlabelled component so old worlds keep working until the GM next saves.
 *
 * @param {object} config
 * @returns {{ id: string, label: string|null, formula: string }[]}
 */
export function getPointComponents(config) {
  if (Array.isArray(config.pointComponents) && config.pointComponents.length > 0) {
    return config.pointComponents;
  }
  return [{ id: 'base', label: null, formula: String(config.pointFormula ?? '2') }];
}

/**
 * Thrown by calculatePointPool when a point component cannot be evaluated for an actor.
 * Carries the failing component so callers can name it.
 */
export class PointComponentError extends Error {
  constructor(component, cause) {
    super(cause?.message ?? String(cause));
    this.name      = 'PointComponentError';
    this.component = component;
  }
}

/**
 * Describes a calculatePointPool failure for display. Players get a generic message;
 * GMs get the failing component's label, formula and error.
 *
 * @param {Error} error
 * @param {boolean} detailed
 * @returns {string}
 */
export function describePointPoolError(error, detailed) {
  if (!detailed) return game.i18n.localize('DHLANG.Pool.errorGeneric');
  if (error instanceof PointComponentError) {
    return game.i18n.format('DHLANG.Pool.errorComponent', {
      label:   error.component.label || game.i18n.localize('DHLANG.Dialog.poolBreakdownBase'),
      formula: error.component.formula,
      error:   error.message,
    });
  }
  return game.i18n.format('DHLANG.Pool.errorOther', { error: error?.message ?? String(error) });
}

/**
 * Calculates the point pool totals for an actor.
 * Spent points are the sum of current effective costs of all acquired languages.
 *
 * Every point component must evaluate — a failing component throws PointComponentError,
 * because skipping it would produce a plausible but wrong total. A failing point rule
 * is skipped silently (the bonus simply doesn't apply).
 *
 * Breakdown entries: { kind: 'component'|'rule', label, value, resolvedFormula? }
 * — resolvedFormula (components only) is the formula with @-references substituted.
 *
 * @param {Actor} actor
 * @param {object} config
 * @returns {Promise<{ total: number, componentsTotal: number, rulesTotal: number, breakdown: object[], spent: number, remaining: number }>}
 */
export async function calculatePointPool(actor, config) {
  const rollData = actor.getRollData();
  const breakdown = [];
  let componentsTotal = 0;

  for (const component of getPointComponents(config)) {
    const formula = String(component.formula ?? '').trim();
    let value;
    try {
      if (!formula) throw new Error('Formula is empty.');
      value = await evaluateFormula(formula, actor);
    } catch (e) {
      throw new PointComponentError(component, e);
    }
    componentsTotal += value;
    breakdown.push({
      kind:            'component',
      label:           component.label || null,
      value,
      resolvedFormula: Roll.replaceFormulaData(formula, rollData),
    });
  }

  let rulesTotal = 0;
  for (const rule of (config.pointRules ?? [])) {
    try {
      const passes = await evaluateRequirement(rule.condition, actor);
      if (!passes) continue;
      const mod = await evaluateFormula(String(rule.modifier ?? '0'), actor);
      rulesTotal += mod;
      breakdown.push({ kind: 'rule', label: rule.label || null, value: mod });
    } catch (_) { /* skip malformed rules silently */ }
  }

  const total = componentsTotal + rulesTotal;
  const acquiredIds = getAcquiredLanguageIds(actor);

  let spent = 0;
  for (const id of acquiredIds) {
    const found = findLanguage(id, config);
    if (!found) continue;
    const { effectiveCost } = await resolveLanguageCost(found.language, found.category, actor);
    spent += effectiveCost;
  }

  return { total, componentsTotal, rulesTotal, breakdown, spent, remaining: total - spent };
}
