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
 * Returns true if the requirement is met (non-zero result) or absent.
 * Returns false if the formula evaluates to 0.
 * @param {string|null|undefined} requirement
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
export async function evaluateRequirement(requirement, actor) {
  if (!requirement) return true;
  const result = await evaluateFormula(requirement, actor);
  return result !== 0;
}
