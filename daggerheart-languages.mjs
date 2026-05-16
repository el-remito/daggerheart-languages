import { registerSettings } from './scripts/settings.mjs';
import { ACTOR_TYPES } from './scripts/constants.mjs';
import { injectLanguageBadge } from './scripts/badge/badge.mjs';

Hooks.once('init', () => {
  registerSettings();
});

// renderActorSheetV2 fires for both CharacterSheet and AdversarySheet in Foundry v14
// ApplicationV2 — confirmed via hook diagnostic. app.document is the actor.
Hooks.on('renderActorSheetV2', (app, html, _data) => {
  const actor = app.document;
  if (!Object.values(ACTOR_TYPES).includes(actor.type)) return;
  injectLanguageBadge(app, html, actor);
});
