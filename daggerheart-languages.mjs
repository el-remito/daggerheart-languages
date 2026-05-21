import { registerSettings } from './scripts/settings.mjs';
import { ACTOR_TYPES } from './scripts/constants.mjs';
import { injectLanguageBadge, injectPartyLanguageBadge } from './scripts/badge/badge.mjs';
import './scripts/hooks.mjs';

Hooks.once('init', () => {
  registerSettings();
});

// renderActorSheetV2 fires for CharacterSheet, AdversarySheet, and PartySheet in Foundry v14
// ApplicationV2 — confirmed via hook diagnostic. app.document is the actor.
Hooks.on('renderActorSheetV2', (app, html, _data) => {
  const actor = app.document;
  if (actor.type === ACTOR_TYPES.PARTY) { injectPartyLanguageBadge(app, html, actor); return; }
  if (!Object.values(ACTOR_TYPES).includes(actor.type)) return;
  injectLanguageBadge(app, html, actor);
});
