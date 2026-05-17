import { MODULE_ID, FLAGS, SETTINGS, TEMPLATES } from '../constants.mjs';
import { evaluateRequirement, formatRequirement } from '../utils/formula.mjs';
import {
  getAcquiredLanguageIds,
  resolveLanguageCost,
  resolveEffectiveRequirement,
  calculatePointPool,
} from '../utils/languages.mjs';

export class LanguageDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id:       'dh-language-dialog',
    classes:  ['daggerheart', 'dh-languages-dialog'],
    window:   { resizable: true },
    position: { width: 520, height: 'auto' },
  };

  static PARTS = {
    main: { template: TEMPLATES.LANGUAGE_DIALOG },
  };

  // Collapse state — persisted across re-renders so user-closed categories stay closed.
  #collapsedCategories = new Set();

  constructor(options = {}) {
    super(options);
    this.actor = options.actor;
  }

  /** Snapshot which category <details> are currently closed before a re-render wipes the DOM. */
  _captureCollapseState() {
    if (!this.element) return;
    this.#collapsedCategories = new Set();
    for (const d of this.element.querySelectorAll('.lang-category')) {
      if (!d.open) {
        const id = d.dataset.categoryId;
        if (id) this.#collapsedCategories.add(id);
      }
    }
  }

  /** Override render to capture collapse state before the DOM is replaced. */
  render(options) {
    this._captureCollapseState();
    return super.render(options);
  }

  get title() {
    return game.i18n.format('DHLANG.Dialog.title', { name: this.actor.name });
  }

  static open(actor) {
    new LanguageDialog({ actor }).render(true);
  }

  async _prepareContext(_options) {
    const config = game.settings.get(MODULE_ID, SETTINGS.CONFIG);
    const acquiredIds = getAcquiredLanguageIds(this.actor);
    const isPC = this.actor.type === 'character';
    const isGM = game.user.isGM;

    const pool = isPC ? await calculatePointPool(this.actor, config) : null;
    if (pool) {
      pool.percent   = pool.total > 0 ? Math.min(100, Math.round((pool.spent / pool.total) * 100)) : 0;
      pool.overspent = pool.spent > pool.total;
    }

    const categories = [];
    const sortedCategories = [...(config.categories ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const category of sortedCategories) {
      const languages = [];
      const sortedLanguages = [...(category.languages ?? [])].sort((a, b) => a.name.localeCompare(b.name));
      for (const language of sortedLanguages) {
        const alreadyAcquired = acquiredIds.includes(language.id);
        const { effectiveCost, originalCost, cousinApplied, requirementWaived } =
          await resolveLanguageCost(language, category, this.actor);
        const requirementFormula = resolveEffectiveRequirement(language, category, requirementWaived);
        const requirementMet = await evaluateRequirement(requirementFormula, this.actor);

        const canAfford = isPC ? (pool.remaining >= effectiveCost) : true;
        // Adversaries: cost and requirements are display-only, never enforced.
        const canAcquire = !alreadyAcquired && (isPC ? (canAfford && requirementMet) : true);

        const requirementTooltip = (!requirementMet && requirementFormula)
          ? game.i18n.format('DHLANG.Dialog.requirementUnmet', { requirement: formatRequirement(requirementFormula) })
          : '';

        languages.push({
          id:               language.id,
          name:             language.name,
          description:      language.description ?? null,
          effectiveCost,
          originalCost,
          hasDiscount:      cousinApplied !== null,
          requirementFormula,
          requirementTooltip,
          requirementMet,
          alreadyAcquired,
          canAcquire,
          canAfford,
        });
      }
      if (languages.length > 0) {
        const acquiredCount = languages.filter(l => l.alreadyAcquired).length;
        categories.push({
          id:           category.id,
          name:         category.name,
          description:  category.description ?? null,
          acquiredCount,
          totalCount:   languages.length,
          languages,
        });
      }
    }

    const acquiredLanguages = acquiredIds.map(id => {
      for (const cat of (config.categories ?? [])) {
        const lang = (cat.languages ?? []).find(l => l.id === id);
        if (lang) return { id: lang.id, name: lang.name };
      }
      return { id, name: id };
    });

    return {
      actor:      this.actor,
      isPC,
      isGM,
      pool,
      categories,
      acquiredLanguages,
      isAdversary: this.actor.type === 'adversary',
    };
  }

  _onRender(context, _options) {
    // Acquire buttons
    for (const btn of this.element.querySelectorAll('[data-action="acquireLanguage"]')) {
      btn.addEventListener('click', this._onAcquireLanguage.bind(this));
    }
    // Remove buttons (GM only)
    for (const btn of this.element.querySelectorAll('[data-action="removeLanguage"]')) {
      btn.addEventListener('click', this._onRemoveLanguage.bind(this));
    }

    // Restore collapse state: any category that was closed before the re-render stays closed.
    for (const d of this.element.querySelectorAll('.lang-category')) {
      const id = d.dataset.categoryId;
      if (id && this.#collapsedCategories.has(id)) d.removeAttribute('open');
    }

    // Search bar — filters language rows and hides empty categories in real time.
    // Matches against: language name, language description, category name, category description.
    // If the category name/description matches, all its languages are shown.
    const searchInput = this.element.querySelector('.dh-lang-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        for (const category of this.element.querySelectorAll('.lang-category')) {
          const catName = category.querySelector('.lang-category-title')?.textContent.toLowerCase() ?? '';
          const catDesc = category.querySelector('.lang-category-description')?.textContent.toLowerCase() ?? '';
          const categoryMatches = !query || catName.includes(query) || catDesc.includes(query);

          let anyVisible = false;
          for (const row of category.querySelectorAll('.lang-row')) {
            const name = row.querySelector('.lang-name')?.textContent.toLowerCase() ?? '';
            const desc = row.querySelector('.lang-description')?.textContent.toLowerCase() ?? '';
            const match = categoryMatches || name.includes(query) || desc.includes(query);
            row.hidden = !match;
            if (match) anyVisible = true;
          }
          category.hidden = !anyVisible && !categoryMatches;
        }
      });
    }
  }

  async _onAcquireLanguage(event) {
    const languageId = event.currentTarget.dataset.languageId;
    const config = game.settings.get(MODULE_ID, SETTINGS.CONFIG);

    let languageName = languageId;
    let effectiveCost = 0;
    for (const cat of (config.categories ?? [])) {
      const lang = (cat.languages ?? []).find(l => l.id === languageId);
      if (lang) {
        languageName = lang.name;
        const resolved = await resolveLanguageCost(lang, cat, this.actor);
        effectiveCost = resolved.effectiveCost;
        break;
      }
    }

    if (this.actor.type !== 'adversary') {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize('DHLANG.Dialog.confirmAcquireTitle') },
        content: `<p>${game.i18n.format('DHLANG.Dialog.confirmAcquireContent', {
          name: languageName,
          cost: effectiveCost,
        })}</p>`,
      });
      if (!confirmed) return;
    }

    const acquired = getAcquiredLanguageIds(this.actor);
    await this.actor.setFlag(MODULE_ID, FLAGS.ACQUIRED, [...acquired, languageId]);
    this.render();
  }

  async _onRemoveLanguage(event) {
    if (!game.user.isGM) return;
    const languageId = event.currentTarget.dataset.languageId;
    const acquired = getAcquiredLanguageIds(this.actor);
    await this.actor.setFlag(MODULE_ID, FLAGS.ACQUIRED, acquired.filter(id => id !== languageId));
    this.render();
  }
}
