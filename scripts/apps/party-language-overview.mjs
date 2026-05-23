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

  _onRender(_context, _options) {
    const toggleBtn = this.element.querySelector('[data-action="toggleKnownFilter"]');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const root = this.element.querySelector('.dh-party-overview');
        const active = root.classList.toggle('filter-known');
        toggleBtn.textContent = game.i18n.localize(
          active ? 'DHLANG.Party.showAll' : 'DHLANG.Party.showOnlyKnown'
        );
      });
    }
  }

  async _prepareContext(_options) {
    const config = game.settings.get(MODULE_ID, SETTINGS.CONFIG);

    // actor.system.partyMembers is already an array of resolved Actor documents
    // (ForeignDocumentUUIDField auto-resolves at access time — no fromUuidSync needed).
    const members = (this.actor.system?.partyMembers ?? [])
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

    // Sort: universal first, both groups alphabetized.
    flat.sort((a, b) => {
      if (a.universal !== b.universal) return a.universal ? -1 : 1;
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
