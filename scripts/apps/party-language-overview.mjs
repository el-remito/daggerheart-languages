import { MODULE_ID, FLAGS, SETTINGS, TEMPLATES, ACTOR_TYPES } from '../constants.mjs';
import { getAcquiredLanguageIds } from '../utils/languages.mjs';

export class PartyLanguageOverview extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id:       'dh-party-language-overview',
    classes:  ['daggerheart', 'dh-party-overview'],
    window:   { resizable: true },
    position: { width: 480, height: 600 },
  };

  static PARTS = {
    main: { template: TEMPLATES.PARTY_OVERVIEW },
  };

  constructor(options = {}) {
    super(options);
    this.actor = options.actor;
  }

  get title() {
    return game.i18n.format('DHLANG.Party.dialogTitle', { name: this.actor.name });
  }

  static open(actor) {
    new PartyLanguageOverview({ actor }).render(true);
  }

  async _prepareContext(_options) {
    const config = game.settings.get(MODULE_ID, SETTINGS.CONFIG);

    // Resolve character-type party members.
    const memberUuids = this.actor.system?.partyMembers ?? [];
    const members = memberUuids
      .map(uuid => fromUuidSync(uuid))
      .filter(a => a && a.type === ACTOR_TYPES.PC);

    // Build per-member acquired language ID sets for fast lookup.
    const memberData = members.map(m => ({
      name:        m.name,
      acquiredIds: new Set(getAcquiredLanguageIds(m)),
    }));

    // Collect all configured languages as a flat list.
    const flat = [];
    for (const cat of (config.categories ?? [])) {
      for (const lang of (cat.languages ?? [])) {
        const originalCost = Number(lang.cost ?? cat.cost ?? 0);
        const speakerNames = memberData
          .filter(m => m.acquiredIds.has(lang.id))
          .map(m => m.name);

        flat.push({
          id:          lang.id,
          name:        lang.name,
          description: lang.description ?? null,
          universal:   !!lang.universal,
          originalCost,
          speakerNames,
          hasSpeakers: speakerNames.length > 0,
        });
      }
    }

    // Sort: universal first (alpha), then by originalCost ascending, then alpha.
    flat.sort((a, b) => {
      if (a.universal !== b.universal) return a.universal ? -1 : 1;
      if (a.originalCost !== b.originalCost) return a.originalCost - b.originalCost;
      return a.name.localeCompare(b.name);
    });

    const noSpeakersLabel = game.i18n.localize('DHLANG.Party.noSpeakers');

    return {
      languages:      flat,
      members,
      noMembers:      members.length === 0,
      noLanguages:    flat.length === 0,
      noSpeakersLabel,
    };
  }
}
