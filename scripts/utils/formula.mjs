/**
 * Converts a single requirement atom into a human-readable description.
 * Does NOT handle compound AND/OR expressions — call formatRequirement for that.
 * @param {string} req  — already trimmed atom string
 * @returns {string}
 */
function _formatAtom(req) {
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
  if (req.startsWith('tierAtLeast:')) {
    const value = req.slice('tierAtLeast:'.length).trim();
    return game.i18n.format('DHLANG.Requirement.tierAtLeast', { value });
  }
  if (req.startsWith('levelAtLeast:')) {
    const value = req.slice('levelAtLeast:'.length).trim();
    return game.i18n.format('DHLANG.Requirement.levelAtLeast', { value });
  }
  if (req.startsWith('classIs:')) {
    const value = req.slice('classIs:'.length).trim();
    return game.i18n.format('DHLANG.Requirement.classIs', { value });
  }
  // Plain math formula — return as-is.
  return req;
}

/**
 * Converts a requirement formula string into a human-readable description.
 * Supports compound expressions with AND / OR operators.
 *
 * @param {string|null|undefined} formula
 * @returns {string}
 */
export function formatRequirement(formula) {
  if (!formula) return formula ?? '';
  const req = formula.trim();

  // Split by OR first (lower precedence), then AND within each branch.
  const orParts = req.split(/ OR /i);
  if (orParts.length > 1) {
    return orParts.map(p => formatRequirement(p.trim())).join(' OR ');
  }
  const andParts = req.split(/ AND /i);
  if (andParts.length > 1) {
    return andParts.map(p => formatRequirement(p.trim())).join(' AND ');
  }

  return _formatAtom(req);
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
 * Evaluates a single requirement atom against an actor.
 * Does NOT handle compound AND/OR expressions.
 *
 * Non-PC actors always pass keyword checks.
 * Keyword evaluation errors fail permissively (return true).
 *
 * @param {string} req  — already trimmed atom string
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
async function _evaluateAtom(req, actor) {
  // ── Keyword: hasFeature:FeatureName ──────────────────────────────────────
  if (req.startsWith('hasFeature:')) {
    if (actor.type !== 'character') return true;
    const featureName = req.slice('hasFeature:'.length).trim();
    if (!featureName) return true;
    try {
      return actor.items.some(
        i => i.type === 'feature' && i.name.toLowerCase().includes(featureName.toLowerCase())
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

  // ── Keyword: tierAtLeast:N ───────────────────────────────────────────────
  if (req.startsWith('tierAtLeast:')) {
    if (actor.type !== 'character') return true;
    const minValue = Number(req.slice('tierAtLeast:'.length).trim());
    if (isNaN(minValue)) return true;
    try {
      return Number(actor.getRollData()?.tier ?? 0) >= minValue;
    } catch (_) { return true; }
  }

  // ── Keyword: levelAtLeast:N ──────────────────────────────────────────────
  if (req.startsWith('levelAtLeast:')) {
    if (actor.type !== 'character') return true;
    const minValue = Number(req.slice('levelAtLeast:'.length).trim());
    if (isNaN(minValue)) return true;
    try {
      return Number(actor.getRollData()?.level ?? 0) >= minValue;
    } catch (_) { return true; }
  }

  // ── Keyword: classIs:ClassName ───────────────────────────────────────────
  if (req.startsWith('classIs:')) {
    if (actor.type !== 'character') return true;
    const className = req.slice('classIs:'.length).trim().toLowerCase();
    if (!className) return true;
    try {
      return actor.items.some(i => i.type === 'class' && i.name?.toLowerCase().includes(className));
    } catch (_) { return true; }
  }

  // ── Fallback: standard Roll formula ─────────────────────────────────────
  const result = await evaluateFormula(req, actor);
  return result !== 0;
}

/**
 * Evaluates a requirement expression against an actor.
 *
 * Supports compound expressions with AND / OR operators (case-insensitive,
 * space-delimited). AND binds more tightly than OR (standard precedence).
 *
 * Examples:
 *   classIs:Warrior OR classIs:Ranger
 *   tierAtLeast:2 AND hasFeature:Wildtouch
 *   classIs:Warrior OR classIs:Ranger AND tierAtLeast:2
 *     → (classIs:Warrior) OR (classIs:Ranger AND tierAtLeast:2)
 *
 * Single atoms fall back to keyword or Roll evaluation as before.
 * Non-PC actors always pass keyword checks.
 *
 * @param {string|null|undefined} requirement
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
export async function evaluateRequirement(requirement, actor) {
  if (!requirement) return true;

  // Split by OR — each branch is an AND-chain.
  const orBranches = requirement.trim().split(/ OR /i);
  for (const branch of orBranches) {
    const andAtoms = branch.trim().split(/ AND /i);
    let branchPasses = true;
    for (const atom of andAtoms) {
      if (!(await _evaluateAtom(atom.trim(), actor))) {
        branchPasses = false;
        break;
      }
    }
    if (branchPasses) return true;
  }
  return false;
}
