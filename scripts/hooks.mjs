import { MODULE_ID } from './constants.mjs';

/**
 * Re-renders any open sheet for the updated actor when its language flags change.
 * In ApplicationV2 the document is exposed as w.document, not w.actor.
 */
Hooks.on('updateActor', (actor, changes, _options, _userId) => {
  if (!changes.flags?.[MODULE_ID]) return;
  for (const w of Object.values(ui.windows)) {
    if (w.document?.id === actor.id) w.render();
  }
});
