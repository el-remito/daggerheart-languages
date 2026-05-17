/**
 * Converts a requirement formula string into a human-readable description.
 * Keyword-based requirements are translated via i18n; plain math formulas
 * are returned unchanged.
 *
 * @param {string|null|undefined} formula
 * @returns {string}
 */
export function formatRequirement(formula) {
  if (!formula) return formula ?? '';
  const req = formula.trim();

  if (req.startsWith('hasFeature:')) {
    const value = req.slice('hasFeature:'.length).trim();
    return game.i18n.format('DHLANG.Requirement.hasFeature', { value });
  }
  if (req.startsWith('hasDomain:')) {
    const value = req.slice('hasDomain:'.length).trim();
    return game.i18n.format('DHLANG.Requirement.hasDomain', { value });
  }
  if (req === 'hasSpellcasting') {
    return game.i18n.localize('DHLANG.Requirement.hasSpellcasting');
  }
  if (req.startsWith('traitAtLeast:')) {
    const parts = req.slice('traitAtLeast:'.length).split(':');
    const rawTrait = parts[0] ?? '';
    const trait = rawTrait.charAt(0).toUpperCase() + rawTrait.slice(1).toLowerCase();
    const value = parts[1] ?? '';
    return game.i18n.format('DHLANG.Requirement.traitAtLeast', { trait, value });
  }

  // Plain math formula — return as-is.
  return formula;
}

/**
 * Evaluates a formula string against an actor's roll data.
 * Returns an integer, or throws if the result is not a valid integer.
 * @param {string} formula
 * @param {Actor} actor
 * @returns {Promise<number>}
 */
export async function evaluateFormula(formula, actor) {
  const rollData = actor.getRollData();
  const roll = new Roll(String(formula), rollData);
  await roll.evaluate();
  const result = roll.total;
  if (!Number.isInteger(result)) {
    throw new Error(`Formula "${formula}" did not evaluate to an integer (got ${result}).`);
  }
  return result;
}

/**
 * Evaluates a requirement expression against an actor.
 *
 * Supports keyword-based requirements (evaluated directly against actor data)
 * and falls back to Roll formula evaluation for anything else.
 *
 * Keyword forms:
 *   hasFeature:FeatureName       — actor has a feature item with that name (case-insensitive)
 *   hasDomain:DomainName         — actor belongs to a domain with that label (case-insensitive)
 *   hasSpellcasting              — actor has any spellcasting trait defined
 *   traitAtLeast:traitName:N     — actor's trait value >= N
 *
 * Non-PC actors always pass keyword checks (requirements are never enforced on adversaries).
 * Keyword evaluation errors fail permissively (return true) so broken configs don't lock players.
 *
 * @param {string|null|undefined} requirement
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
export async function evaluateRequirement(requirement, actor) {
  if (!requirement) return true;
  const req = requirement.trim();

  // ── Keyword: hasFeature:FeatureName ──────────────────────────────────────
  if (req.startsWith('hasFeature:')) {
    if (actor.type !== 'character') return true;
    const featureName = req.slice('hasFeature:'.length).trim();
    if (!featureName) return true;
    try {
      return actor.items.some(
        i => i.type === 'feature' && i.name.toLowerCase() === featureName.toLowerCase()
      );
    } catch (_) { return true; }
  }

  // ── Keyword: hasDomain:DomainName ────────────────────────────────────────
  if (req.startsWith('hasDomain:')) {
    if (actor.type !== 'character') return true;
    const domainName = req.slice('hasDomain:'.length).trim();
    if (!domainName) return true;
    try {
      const domainData = actor.system?.domainData ?? [];
      return domainData.some(d => d.label?.toLowerCase() === domainName.toLowerCase());
    } catch (_) { return true; }
  }

  // ── Keyword: hasSpellcasting ─────────────────────────────────────────────
  if (req === 'hasSpellcasting') {
    if (actor.type !== 'character') return true;
    try {
      return actor.system?.spellcastingModifiers?.main != null;
    } catch (_) { return true; }
  }

  // ── Keyword: traitAtLeast:traitName:N ────────────────────────────────────
  if (req.startsWith('traitAtLeast:')) {
    if (actor.type !== 'character') return true;
    const parts = req.slice('traitAtLeast:'.length).split(':');
    if (parts.length < 2) return true;
    const [traitName, minStr] = parts;
    const minValue = Number(minStr);
    if (!traitName || isNaN(minValue)) return true;
    try {
      const traitValue = actor.system?.traits?.[traitName.toLowerCase()]?.value ?? 0;
      return traitValue >= minValue;
    } catch (_) { return true; }
  }

  // ── Fallback: standard Roll formula ─────────────────────────────────────
  const result = await evaluateFormula(req, actor);
  return result !== 0;
}
