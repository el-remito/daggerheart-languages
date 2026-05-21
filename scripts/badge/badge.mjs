import { MODULE_ID, FLAGS, SETTINGS, ACTOR_TYPES } from '../constants.mjs';
import { getAcquiredLanguageIds, findLanguage, calculatePointPool, resolveLanguageCost } from '../utils/languages.mjs';

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
  // The party sheet uses <header class="party-header-sheet"> with <h1 class="item-name">
  // inside — different from character/adversary sheets which use .name-row / h1.actor-name.
  const header = html.querySelector('.party-header-sheet');
  if (!header) {
    console.warn('daggerheart-languages | injectPartyLanguageBadge: .party-header-sheet not found');
    return;
  }

  header.querySelector('.dh-lang-badge')?.remove();

  const config = game.settings.get(MODULE_ID, SETTINGS.CONFIG);
  // actor.system.partyMembers is already an array of resolved Actor documents
  // (ForeignDocumentUUIDField auto-resolves at access time — no fromUuidSync needed).
  const members = (actor.system?.partyMembers ?? [])
    .filter(a => a && a.type === ACTOR_TYPES.PC);

  // Collect unique language names across all party members, sorted: universal first (alpha), rest alpha.
  const knownNames = [];
  const seenIds = new Set();
  for (const member of members) {
    for (const id of getAcquiredLanguageIds(member)) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      const found = findLanguage(id, config);
      if (found) knownNames.push({ name: found.language.name, universal: !!found.language.universal });
    }
  }
  knownNames.sort((a, b) => {
    if (a.universal !== b.universal) return a.universal ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const tooltip = knownNames.length > 0
    ? game.i18n.format('DHLANG.Party.badgeTooltipLanguages', {
        name:      actor.name,
        languages: knownNames.map(e => e.name).join(', '),
      })
    : game.i18n.localize('DHLANG.Party.badgeTooltipNone');

  const badge = document.createElement('span');
  badge.className = 'dh-lang-badge';
  badge.dataset.actorId = actor.id;
  badge.dataset.tooltip = tooltip;
  badge.innerHTML = '<i class="fas fa-language"></i>';

  badge.addEventListener('click', () => openPartyLanguageOverview(actor));

  // Insert badge as last child of h1.item-name so it sits inline next to the name
  // input. Combined with the flex CSS on h1.item-name it appears right-adjacent.
  header.querySelector('h1.item-name').insertAdjacentElement('beforeend', badge);
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
  // Sort tooltip names: universal languages first (alpha), then the rest (alpha).
  const names = acquiredIds
    .map(id => { const f = findLanguage(id, config); return f ? { name: f.language.name, universal: !!f.language.universal } : null; })
    .filter(Boolean)
    .sort((a, b) => { if (a.universal !== b.universal) return a.universal ? -1 : 1; return a.name.localeCompare(b.name); })
    .map(e => e.name);
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
