import { MODULE_ID, FLAGS, SETTINGS, ACTOR_TYPES } from '../constants.mjs';
import { getAcquiredLanguageIds, findLanguage, calculatePointPool, resolveLanguageCost } from '../utils/languages.mjs';

/**
 * Finds a language name by ID within the world config.
 * @param {string} id
 * @param {object} config
 * @returns {string|null}
 */
function findLanguageName(id, config) {
  const found = findLanguage(id, config);
  return found?.language.name ?? null;
}

/**
 * Returns true if the actor can afford at least one unacquired language,
 * accounting for cousin discounts. Used to suppress the amber "unspent"
 * glow when the player has remaining points but nothing left they can buy.
 * @param {object} config
 * @param {string[]} acquiredIds
 * @param {Actor} actor
 * @param {number} remaining
 * @returns {Promise<boolean>}
 */
async function _canAffordAny(config, acquiredIds, actor, remaining) {
  for (const cat of (config.categories ?? [])) {
    for (const lang of (cat.languages ?? [])) {
      if (acquiredIds.includes(lang.id)) continue;
      try {
        const { effectiveCost } = await resolveLanguageCost(lang, cat, actor);
        if (effectiveCost <= remaining) return true;
      } catch (_) {
        // Malformed cost formula — skip this language.
      }
    }
  }
  return false;
}

/**
 * Opens the LanguageDialog for the given actor.
 * Imported lazily so badge.mjs doesn't hard-depend on the dialog at load time.
 * @param {Actor} actor
 */
async function openLanguageDialog(actor) {
  const { LanguageDialog } = await import('../apps/language-dialog.mjs');
  LanguageDialog.open(actor);
}

/**
 * Opens the PartyLanguageOverview dialog for the given party actor.
 * Imported lazily so badge.mjs doesn't hard-depend on the dialog at load time.
 * @param {Actor} actor
 */
async function openPartyLanguageOverview(actor) {
  const { PartyLanguageOverview } = await import('../apps/party-language-overview.mjs');
  PartyLanguageOverview.open(actor);
}

/**
 * Injects the language badge into a Party actor sheet header.
 * All users who can see the party sheet may click to open the read-only overview.
 * No glow states — parties have no point pool.
 * @param {ActorSheet} app
 * @param {HTMLElement} html
 * @param {Actor} actor
 */
export function injectPartyLanguageBadge(app, html, actor) {
  const nameRow = html.querySelector('.name-row');
  if (!nameRow) return;

  nameRow.querySelector('.dh-lang-badge')?.remove();

  const config = game.settings.get(MODULE_ID, SETTINGS.CONFIG);
  const memberUuids = actor.system?.partyMembers ?? [];
  const members = memberUuids
    .map(uuid => fromUuidSync(uuid))
    .filter(a => a && a.type === ACTOR_TYPES.PC);

  // Count unique languages known across all party members.
  const knownIds = new Set();
  for (const member of members) {
    for (const id of getAcquiredLanguageIds(member)) knownIds.add(id);
  }
  const count = knownIds.size;

  const tooltip = count > 0
    ? game.i18n.format('DHLANG.Party.badgeTooltipCount', { count })
    : game.i18n.localize('DHLANG.Party.badgeTooltipNone');

  const badge = document.createElement('span');
  badge.className = 'dh-lang-badge';
  badge.dataset.actorId = actor.id;
  badge.dataset.tooltip = tooltip;
  badge.innerHTML = '<i class="fas fa-language"></i>';

  badge.addEventListener('click', () => openPartyLanguageOverview(actor));

  nameRow.querySelector('h1.actor-name').insertAdjacentElement('afterend', badge);
}

/**
 * Injects the language badge into the actor sheet header, next to the actor name.
 * Safe to call on every renderActorSheet — removes any existing badge before re-injecting.
 * @param {ActorSheet} app
 * @param {HTMLElement} html
 * @param {Actor} actor
 */
export async function injectLanguageBadge(app, html, actor) {
  const nameRow = html.querySelector('.name-row');
  if (!nameRow) return;

  // Remove stale badge from previous render.
  nameRow.querySelector('.dh-lang-badge')?.remove();

  const config = game.settings.get(MODULE_ID, SETTINGS.CONFIG);
  const acquiredIds = getAcquiredLanguageIds(actor);
  const names = acquiredIds.map(id => findLanguageName(id, config)).filter(Boolean);
  const isPC = actor.type === 'character';
  const tooltip = isPC
    ? (names.length
        ? game.i18n.format('DHLANG.Badge.pcSpeaksLanguages', { name: actor.name, languages: names.join(', ') })
        : game.i18n.format('DHLANG.Badge.pcNoLanguages',     { name: actor.name }))
    : (names.length
        ? game.i18n.format('DHLANG.Badge.speaksLanguages',   { languages: names.join(', ') })
        : game.i18n.localize('DHLANG.Badge.noLanguages'));

  const badge = document.createElement('span');
  badge.className = 'dh-lang-badge';
  badge.dataset.actorId = actor.id;
  badge.dataset.tooltip = tooltip;
  badge.innerHTML = '<i class="fas fa-language"></i>';

  if (actor.isOwner || game.user.isGM) {
    badge.addEventListener('click', () => openLanguageDialog(actor));
  }

  nameRow.querySelector('h1.actor-name').insertAdjacentElement('afterend', badge);

  // For PCs: evaluate the point pool and apply a glow class if points are unspent or overspent.
  // The badge is already in the DOM; the class is added async after pool evaluation completes.
  // Amber "unspent" glow is only shown if the player can actually afford at least one
  // unacquired language — suppressed when remaining points are too few for anything.
  if (isPC) {
    try {
      const pool = await calculatePointPool(actor, config);
      if (pool.spent > pool.total) {
        badge.classList.add('dh-lang-badge--overspent');
      } else if (pool.remaining > 0) {
        const canBuySomething = await _canAffordAny(config, acquiredIds, actor, pool.remaining);
        if (canBuySomething) badge.classList.add('dh-lang-badge--unspent');
      }
    } catch (_e) {
      // Formula evaluation failed — display badge without a state class.
    }
  }
}
