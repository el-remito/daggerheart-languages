import { MODULE_ID, FLAGS, SETTINGS } from '../constants.mjs';
import { evaluateFormula } from './formula.mjs';

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
 * Resolves the effective acquisition cost for a language, accounting for
 * cousin discounts if the actor already knows a cousin language.
 *
 * Returns:
 *   effectiveCost     — the cost to use for affordability and acquisition
 *   originalCost      — base cost before any cousin discount
 *   cousinApplied     — the cousin object that supplied the discount, or null
 *   requirementWaived — true if the winning cousin waives the requirement
 *
 * @param {object} language
 * @param {object} category
 * @param {Actor} actor
 * @returns {Promise<{ effectiveCost: number, originalCost: number, cousinApplied: object|null, requirementWaived: boolean }>}
 */
export async function resolveLanguageCost(language, category, actor) {
  const originalCost = Number(language.cost ?? category.cost ?? 0);
  const acquiredIds = getAcquiredLanguageIds(actor);
  const matchingCousins = (language.cousins ?? []).filter(c => acquiredIds.includes(c.languageId));

  if (matchingCousins.length === 0) {
    return { effectiveCost: originalCost, originalCost, cousinApplied: null, requirementWaived: false };
  }

  // Evaluate discount amount for each matching cousin and derive effective cost; skip errors.
  const evaluated = [];
  for (const cousin of matchingCousins) {
    try {
      const discountAmount = await evaluateFormula(String(cousin.discountAmount ?? 0), actor);
      const discountedCost = Math.max(0, originalCost - discountAmount);
      evaluated.push({ cousin, discountedCost });
    } catch (_) {
      // Malformed formula — skip this cousin.
    }
  }

  if (evaluated.length === 0) {
    return { effectiveCost: originalCost, originalCost, cousinApplied: null, requirementWaived: false };
  }

  // Pick the cousin that yields the lowest (best) discounted cost; ties go to first found.
  evaluated.sort((a, b) => a.discountedCost - b.discountedCost);
  const { cousin: cousinApplied, discountedCost: effectiveCost } = evaluated[0];

  return { effectiveCost, originalCost, cousinApplied, requirementWaived: cousinApplied.waiveRequirement ?? false };
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
 * @returns {Promise<{ total: number, spent: number, remaining: number }>}
 */
export async function calculatePointPool(actor, config) {
  const total = await evaluateFormula(config.pointFormula ?? '2', actor);
  const acquiredIds = getAcquiredLanguageIds(actor);

  let spent = 0;
  for (const id of acquiredIds) {
    const found = findLanguage(id, config);
    if (!found) continue;
    const { effectiveCost } = await resolveLanguageCost(found.language, found.category, actor);
    spent += effectiveCost;
  }

  return { total, spent, remaining: total - spent };
}
