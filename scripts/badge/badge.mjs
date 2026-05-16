import { MODULE_ID, FLAGS, SETTINGS } from '../constants.mjs';
import { getAcquiredLanguageIds, findLanguage } from '../utils/languages.mjs';

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
 * Opens the LanguageDialog for the given actor.
 * Imported lazily so badge.mjs doesn't hard-depend on the dialog at load time.
 * @param {Actor} actor
 */
async function openLanguageDialog(actor) {
  const { LanguageDialog } = await import('../apps/language-dialog.mjs');
  LanguageDialog.open(actor);
}

/**
 * Injects the language badge into the actor sheet header, next to the actor name.
 * Safe to call on every renderActorSheet — removes any existing badge before re-injecting.
 * @param {ActorSheet} app
 * @param {HTMLElement} html
 * @param {Actor} actor
 */
export function injectLanguageBadge(app, html, actor) {
  const nameRow = html.querySelector('.name-row');
  if (!nameRow) return;

  // Remove stale badge from previous render.
  nameRow.querySelector('.dh-lang-badge')?.remove();

  const config = game.settings.get(MODULE_ID, SETTINGS.CONFIG);
  const acquiredIds = getAcquiredLanguageIds(actor);
  const names = acquiredIds.map(id => findLanguageName(id, config)).filter(Boolean);
  const tooltip = names.length
    ? names.join(', ')
    : game.i18n.localize('DHLANG.Badge.noLanguages');

  const badge = document.createElement('span');
  badge.className = 'dh-lang-badge';
  badge.dataset.actorId = actor.id;
  badge.dataset.tooltip = tooltip;
  badge.innerHTML = '<i class="fas fa-language"></i>';

  if (actor.isOwner || game.user.isGM) {
    badge.addEventListener('click', () => openLanguageDialog(actor));
  }

  nameRow.querySelector('h1.actor-name').insertAdjacentElement('afterend', badge);
}
