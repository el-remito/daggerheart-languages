import { MODULE_ID, SETTINGS, TEMPLATES } from '../constants.mjs';
import { evaluateFormula } from '../utils/formula.mjs';

const MOCK_ACTOR = {
  getRollData: () => ({
    traits: {
      agility:   { value: 0 },
      strength:  { value: 0 },
      finesse:   { value: 0 },
      instinct:  { value: 0 },
      presence:  { value: 0 },
      knowledge: { value: 0 },
    },
    level:       1,
    proficiency: 1,
  }),
};

export class LanguageSettingsConfig extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id:       'dh-language-settings',
    classes:  ['daggerheart', 'dh-settings-config'],
    window:   { title: 'DHLANG.Settings.title', resizable: true },
    position: { width: 680, height: 'auto' },
  };

  static PARTS = {
    main: { template: TEMPLATES.SETTINGS_CONFIG },
  };

  // Working copy of config — mutations happen here, not in game.settings until Save.
  #config = null;

  async _prepareContext(_options) {
    if (!this.#config) {
      const saved = game.settings.get(MODULE_ID, SETTINGS.CONFIG);
      this.#config = foundry.utils.deepClone(saved);
    }

    // Build flat list of all languages for cousin dropdowns (keyed by language ID for self-exclusion).
    const allLanguages = [];
    for (const cat of (this.#config.categories ?? [])) {
      for (const lang of (cat.languages ?? [])) {
        allLanguages.push({ id: lang.id, name: `${cat.name} — ${lang.name}` });
      }
    }

    // Per-language cousin options: exclude the language itself so it can't be its own cousin.
    for (const cat of (this.#config.categories ?? [])) {
      for (const lang of (cat.languages ?? [])) {
        lang._cousinOptions = allLanguages.filter(l => l.id !== lang.id);
      }
    }

    return {
      config:       this.#config,
      pointFormulaHint: game.i18n.localize('DHLANG.Settings.pointFormulaHint'),
    };
  }

  _onRender(_context, _options) {
    const el = this.element;

    // Point formula input — live sync to working copy.
    el.querySelector('#point-formula')?.addEventListener('input', e => {
      this.#config.pointFormula = e.target.value;
    });

    el.querySelector('[data-action="addCategory"]')
      ?.addEventListener('click', () => this._addCategory());

    for (const btn of el.querySelectorAll('[data-action="removeCategory"]')) {
      btn.addEventListener('click', e => this._removeCategory(e.currentTarget.dataset.categoryId));
    }

    for (const input of el.querySelectorAll('[data-field="categoryName"]')) {
      input.addEventListener('input', e => {
        const cat = this._findCategory(e.currentTarget.dataset.categoryId);
        if (cat) cat.name = e.target.value;
      });
    }

    for (const input of el.querySelectorAll('[data-field="categoryCost"]')) {
      input.addEventListener('input', e => {
        const cat = this._findCategory(e.currentTarget.dataset.categoryId);
        if (cat) cat.cost = e.target.value;
      });
    }

    for (const input of el.querySelectorAll('[data-field="categoryRequirement"]')) {
      input.addEventListener('input', e => {
        const cat = this._findCategory(e.currentTarget.dataset.categoryId);
        if (cat) cat.requirement = e.target.value || null;
      });
    }

    for (const btn of el.querySelectorAll('[data-action="addLanguage"]')) {
      btn.addEventListener('click', e => this._addLanguage(e.currentTarget.dataset.categoryId));
    }

    for (const btn of el.querySelectorAll('[data-action="removeLanguage"]')) {
      btn.addEventListener('click', e => {
        this._removeLanguage(e.currentTarget.dataset.categoryId, e.currentTarget.dataset.languageId);
      });
    }

    for (const input of el.querySelectorAll('[data-field="languageName"]')) {
      input.addEventListener('input', e => {
        const lang = this._findLanguage(e.currentTarget.dataset.categoryId, e.currentTarget.dataset.languageId);
        if (lang) lang.name = e.target.value;
      });
    }

    for (const input of el.querySelectorAll('[data-field="languageCost"]')) {
      input.addEventListener('input', e => {
        const lang = this._findLanguage(e.currentTarget.dataset.categoryId, e.currentTarget.dataset.languageId);
        if (lang) lang.cost = e.target.value || null;
      });
    }

    for (const input of el.querySelectorAll('[data-field="languageRequirement"]')) {
      input.addEventListener('input', e => {
        const lang = this._findLanguage(e.currentTarget.dataset.categoryId, e.currentTarget.dataset.languageId);
        if (lang) lang.requirement = e.target.value || null;
      });
    }

    for (const ta of el.querySelectorAll('[data-field="categoryDescription"]')) {
      ta.addEventListener('input', e => {
        const cat = this._findCategory(e.currentTarget.dataset.categoryId);
        if (cat) cat.description = e.target.value || null;
      });
    }

    for (const ta of el.querySelectorAll('[data-field="languageDescription"]')) {
      ta.addEventListener('input', e => {
        const lang = this._findLanguage(e.currentTarget.dataset.categoryId, e.currentTarget.dataset.languageId);
        if (lang) lang.description = e.target.value || null;
      });
    }

    for (const btn of el.querySelectorAll('[data-action="addCousin"]')) {
      btn.addEventListener('click', e => {
        this._addCousin(e.currentTarget.dataset.categoryId, e.currentTarget.dataset.languageId);
      });
    }

    for (const btn of el.querySelectorAll('[data-action="removeCousin"]')) {
      btn.addEventListener('click', e => {
        this._removeCousin(
          e.currentTarget.dataset.categoryId,
          e.currentTarget.dataset.languageId,
          Number(e.currentTarget.dataset.cousinIndex),
        );
      });
    }

    for (const sel of el.querySelectorAll('[data-field="cousinLanguageId"]')) {
      sel.addEventListener('change', e => {
        const cousin = this._findCousin(
          e.currentTarget.dataset.categoryId,
          e.currentTarget.dataset.languageId,
          Number(e.currentTarget.dataset.cousinIndex),
        );
        if (cousin) cousin.languageId = e.target.value;
      });
    }

    for (const input of el.querySelectorAll('[data-field="cousinDiscountedCost"]')) {
      input.addEventListener('input', e => {
        const cousin = this._findCousin(
          e.currentTarget.dataset.categoryId,
          e.currentTarget.dataset.languageId,
          Number(e.currentTarget.dataset.cousinIndex),
        );
        if (cousin) cousin.discountedCost = e.target.value;
      });
    }

    for (const cb of el.querySelectorAll('[data-field="cousinWaiveRequirement"]')) {
      cb.addEventListener('change', e => {
        const cousin = this._findCousin(
          e.currentTarget.dataset.categoryId,
          e.currentTarget.dataset.languageId,
          Number(e.currentTarget.dataset.cousinIndex),
        );
        if (cousin) cousin.waiveRequirement = e.target.checked;
      });
    }

    el.querySelector('[data-action="saveConfig"]')
      ?.addEventListener('click', () => this._onSave());

    el.querySelector('[data-action="cancelConfig"]')
      ?.addEventListener('click', () => this.close());
  }

  // ── Mutation helpers ──────────────────────────────────────────────────────

  _findCategory(categoryId) {
    return this.#config.categories.find(c => c.id === categoryId) ?? null;
  }

  _findLanguage(categoryId, languageId) {
    return this._findCategory(categoryId)?.languages.find(l => l.id === languageId) ?? null;
  }

  _findCousin(categoryId, languageId, index) {
    return this._findLanguage(categoryId, languageId)?.cousins[index] ?? null;
  }

  _addCategory() {
    this.#config.categories.push({
      id:          foundry.utils.randomID(),
      name:        'New Category',
      cost:        1,
      requirement: null,
      description: null,
      languages:   [],
    });
    this.render();
  }

  async _removeCategory(categoryId) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('DHLANG.Settings.confirmDeleteTitle') },
      content: `<p>${game.i18n.localize('DHLANG.Settings.confirmDeleteCategory')}</p>`,
    });
    if (!confirmed) return;
    this.#config.categories = this.#config.categories.filter(c => c.id !== categoryId);
    this.render();
  }

  _addLanguage(categoryId) {
    const cat = this._findCategory(categoryId);
    if (!cat) return;
    cat.languages.push({
      id:          foundry.utils.randomID(),
      name:        'New Language',
      cost:        null,
      requirement: null,
      description: null,
      cousins:     [],
    });
    this.render();
  }

  async _removeLanguage(categoryId, languageId) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('DHLANG.Settings.confirmDeleteTitle') },
      content: `<p>${game.i18n.localize('DHLANG.Settings.confirmDeleteLanguage')}</p>`,
    });
    if (!confirmed) return;
    const cat = this._findCategory(categoryId);
    if (!cat) return;
    cat.languages = cat.languages.filter(l => l.id !== languageId);
    this.render();
  }

  _addCousin(categoryId, languageId) {
    const lang = this._findLanguage(categoryId, languageId);
    if (!lang) return;
    lang.cousins.push({ languageId: '', discountedCost: 0, waiveRequirement: false });
    this.render();
  }

  async _removeCousin(categoryId, languageId, index) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('DHLANG.Settings.confirmDeleteTitle') },
      content: `<p>${game.i18n.localize('DHLANG.Settings.confirmDeleteCousin')}</p>`,
    });
    if (!confirmed) return;
    const lang = this._findLanguage(categoryId, languageId);
    if (!lang) return;
    lang.cousins.splice(index, 1);
    this.render();
  }

  // ── Save & validation ─────────────────────────────────────────────────────

  async _onSave() {
    const errors = await this._validate();
    if (errors.length > 0) {
      // Display errors inline — show first error as a UI notification.
      ui.notifications.error(errors[0]);
      return;
    }
    await game.settings.set(MODULE_ID, SETTINGS.CONFIG, this.#config);
    this.close();
  }

  async _validate() {
    const errors = [];
    const check = async (formula, label) => {
      if (!formula && formula !== 0) return null;
      try {
        return await evaluateFormula(String(formula), MOCK_ACTOR);
      } catch (e) {
        errors.push(game.i18n.format('DHLANG.Settings.validationError', { error: `${label}: ${e.message}` }));
        return null;
      }
    };

    const pointTotal = await check(this.#config.pointFormula, 'Point Formula');
    if (pointTotal !== null && pointTotal <= 0) {
      errors.push(game.i18n.format('DHLANG.Settings.validationError', { error: 'Point Formula must resolve to a positive integer' }));
    }

    for (const cat of (this.#config.categories ?? [])) {
      const catCost = await check(cat.cost, `Category "${cat.name}" cost`);
      if (catCost !== null && catCost < 0) {
        errors.push(game.i18n.format('DHLANG.Settings.validationError', { error: `Category "${cat.name}" cost must be non-negative` }));
      }
      if (cat.requirement) await check(cat.requirement, `Category "${cat.name}" requirement`);

      for (const lang of (cat.languages ?? [])) {
        if (lang.cost !== null && lang.cost !== '') {
          const lc = await check(lang.cost, `Language "${lang.name}" cost`);
          if (lc !== null && lc < 0) {
            errors.push(game.i18n.format('DHLANG.Settings.validationError', { error: `Language "${lang.name}" cost must be non-negative` }));
          }
        }
        if (lang.requirement) await check(lang.requirement, `Language "${lang.name}" requirement`);

        for (const cousin of (lang.cousins ?? [])) {
          const dc = await check(cousin.discountedCost, `Cousin discounted cost in "${lang.name}"`);
          if (dc !== null && dc < 0) {
            errors.push(game.i18n.format('DHLANG.Settings.validationError', { error: `Cousin discounted cost in "${lang.name}" must be non-negative` }));
          }
        }
      }
    }

    return errors;
  }
}
