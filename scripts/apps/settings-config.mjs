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
    // @tier and @prof are the correct Daggerheart roll-data keys.
    // @system.levelData.level.current is the correct path for character level.
    tier:   1,
    prof:   1,
    system: { levelData: { level: { current: 1 } } },
  }),
};

export class LanguageSettingsConfig extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id:       'dh-language-settings',
    classes:  ['daggerheart', 'dh-settings-config'],
    window:   { title: 'DHLANG.Settings.title', resizable: true },
    position: { width: 680, height: 650 },
  };

  static PARTS = {
    main: { template: TEMPLATES.SETTINGS_CONFIG },
  };

  // Working copy of config — mutations happen here, not in game.settings until Save.
  #config = null;

  // Collapse state — persisted across re-renders so user-opened <details> stay open.
  #openCategories = new Set();
  #openLanguages  = new Set();

  /** Snapshot which <details> elements are currently open before a re-render wipes the DOM. */
  _captureCollapseState() {
    if (!this.element) return;
    this.#openCategories = new Set();
    this.#openLanguages  = new Set();
    for (const d of this.element.querySelectorAll('.config-category')) {
      if (d.open) {
        const id = d.querySelector('[data-category-id]')?.dataset.categoryId;
        if (id) this.#openCategories.add(id);
      }
    }
    for (const d of this.element.querySelectorAll('.config-language')) {
      if (d.open) {
        const id = d.querySelector('[data-language-id]')?.dataset.languageId;
        if (id) this.#openLanguages.add(id);
      }
    }
  }

  /** Override render to capture collapse state before the DOM is replaced. */
  render(options) {
    this._captureCollapseState();
    return super.render(options);
  }

  async _prepareContext(_options) {
    if (!this.#config) {
      const saved = game.settings.get(MODULE_ID, SETTINGS.CONFIG);
      this.#config = foundry.utils.deepClone(saved);
    }

    // Sort categories and their languages alphabetically for display.
    // this.#config is a deepClone of saved settings so in-place sort is safe.
    this.#config.categories.sort((a, b) => a.name.localeCompare(b.name));
    for (const cat of this.#config.categories) {
      cat.languages.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Build flat list of all languages for cousin dropdowns (keyed by language ID for self-exclusion).
    const allLanguages = [];
    for (const cat of (this.#config.categories ?? [])) {
      for (const lang of (cat.languages ?? [])) {
        allLanguages.push({ id: lang.id, name: `${cat.name} — ${lang.name}` });
      }
    }

    // Sort flat language list so cousin dropdowns appear alphabetically.
    allLanguages.sort((a, b) => a.name.localeCompare(b.name));

    // Sort each language's cousin entries by the name of their linked language, then build options.
    for (const cat of this.#config.categories) {
      for (const lang of cat.languages) {
        (lang.cousins ?? []).sort((a, b) => {
          const nameA = allLanguages.find(l => l.id === a.languageId)?.name ?? '';
          const nameB = allLanguages.find(l => l.id === b.languageId)?.name ?? '';
          return nameA.localeCompare(nameB);
        });
      }
    }

    // Per-cousin options: exclude the language itself, exclude languages already claimed
    // by OTHER cousin slots on the same language, and pre-compute selected state.
    // This avoids relying on the {{eq}} Handlebars helper which may not be registered.
    for (const cat of (this.#config.categories ?? [])) {
      for (const lang of (cat.languages ?? [])) {
        const baseOptions = allLanguages.filter(l => l.id !== lang.id);
        const cousins = lang.cousins ?? [];
        cousins.forEach((cousin, idx) => {
          // IDs already claimed by every OTHER cousin slot (ignore empty "" values)
          const otherUsedIds = new Set(
            cousins
              .filter((_, i) => i !== idx)
              .map(c => c.languageId)
              .filter(Boolean)
          );
          cousin._options = baseOptions
            .filter(l => !otherUsedIds.has(l.id))
            .map(l => ({
              id:       l.id,
              name:     l.name,
              selected: l.id === cousin.languageId,
            }));
        });
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

    for (const input of el.querySelectorAll('[data-field="cousinDiscountAmount"]')) {
      input.addEventListener('input', e => {
        const cousin = this._findCousin(
          e.currentTarget.dataset.categoryId,
          e.currentTarget.dataset.languageId,
          Number(e.currentTarget.dataset.cousinIndex),
        );
        if (cousin) cousin.discountAmount = e.target.value;
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

    for (const btn of el.querySelectorAll('[data-action="addCostRule"]')) {
      btn.addEventListener('click', e => {
        this._addCostRule(e.currentTarget.dataset.categoryId, e.currentTarget.dataset.languageId);
      });
    }

    for (const btn of el.querySelectorAll('[data-action="removeCostRule"]')) {
      btn.addEventListener('click', e => {
        this._removeCostRule(
          e.currentTarget.dataset.categoryId,
          e.currentTarget.dataset.languageId,
          Number(e.currentTarget.dataset.ruleIndex),
        );
      });
    }

    for (const input of el.querySelectorAll('[data-field="costRuleRequirement"]')) {
      input.addEventListener('input', e => {
        const rule = this._findCostRule(
          e.currentTarget.dataset.categoryId,
          e.currentTarget.dataset.languageId,
          Number(e.currentTarget.dataset.ruleIndex),
        );
        if (rule) rule.requirement = e.target.value || null;
      });
    }

    for (const input of el.querySelectorAll('[data-field="costRuleDiscountAmount"]')) {
      input.addEventListener('input', e => {
        const rule = this._findCostRule(
          e.currentTarget.dataset.categoryId,
          e.currentTarget.dataset.languageId,
          Number(e.currentTarget.dataset.ruleIndex),
        );
        if (rule) rule.discountAmount = e.target.value;
      });
    }

    // Search bar — filters config-language blocks and hides empty categories in real time.
    // Matches against: language name, language description, category name, category description.
    // If the category name/description matches, all its languages are shown.
    const searchInput = el.querySelector('.dh-lang-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        for (const category of el.querySelectorAll('.config-category')) {
          const catName = category.querySelector('[data-field="categoryName"]')?.value.toLowerCase() ?? '';
          const catDesc = category.querySelector('[data-field="categoryDescription"]')?.value.toLowerCase() ?? '';
          const categoryMatches = !query || catName.includes(query) || catDesc.includes(query);

          let anyVisible = false;
          for (const langEl of category.querySelectorAll('.config-language')) {
            const name = langEl.querySelector('[data-field="languageName"]')?.value.toLowerCase() ?? '';
            const desc = langEl.querySelector('[data-field="languageDescription"]')?.value.toLowerCase() ?? '';
            const match = categoryMatches || name.includes(query) || desc.includes(query);
            langEl.hidden = !match;
            if (match) anyVisible = true;
          }
          // If category name/description matches, show the whole category regardless.
          // Otherwise hide it only if it has languages and none matched.
          const hasLanguages = category.querySelectorAll('.config-language').length > 0;
          category.hidden = !categoryMatches && hasLanguages && !anyVisible;
        }
      });
    }

    el.querySelector('[data-action="saveConfig"]')
      ?.addEventListener('click', () => this._onSave());

    el.querySelector('[data-action="cancelConfig"]')
      ?.addEventListener('click', () => this.close());

    // ── Formula picker wiring ─────────────────────────────────────────────
    for (const wrapper of el.querySelectorAll('.requirement-group')) {
      const reqInput    = wrapper.querySelector('input[data-field]');
      const toggleBtn   = wrapper.querySelector('.picker-toggle-btn');
      const pickerPanel = wrapper.querySelector('.formula-picker');
      const typeSelect  = wrapper.querySelector('.picker-type-select');
      const setBtn  = wrapper.querySelector('.picker-set-btn');
      const andBtn  = wrapper.querySelector('.picker-and-btn');
      const orBtn   = wrapper.querySelector('.picker-or-btn');

      // Show/hide the correct sub-field block for the selected type.
      const syncSubFields = () => {
        const type = typeSelect.value;
        for (const sub of wrapper.querySelectorAll('.picker-sub')) sub.hidden = true;
        if (type === 'hasFeature')   wrapper.querySelector('.picker-sub--feature').hidden       = false;
        if (type === 'hasDomain')    wrapper.querySelector('.picker-sub--domain').hidden        = false;
        if (type === 'traitAtLeast') wrapper.querySelector('.picker-sub--trait').hidden         = false;
        if (type === 'tierAtLeast')  wrapper.querySelector('.picker-sub--tier-at-least').hidden = false;
        if (type === 'levelAtLeast') wrapper.querySelector('.picker-sub--level-at-least').hidden = false;
        if (type === 'classIs')      wrapper.querySelector('.picker-sub--class').hidden         = false;
        // 'hasSpellcasting' and 'custom' need no sub-fields.
      };

      toggleBtn?.addEventListener('click', () => {
        pickerPanel.hidden = !pickerPanel.hidden;
        if (!pickerPanel.hidden) syncSubFields(); // ensure correct sub-field visible on open
      });

      typeSelect?.addEventListener('change', syncSubFields);

      // Build the atom formula string from the current picker state.
      const buildFormula = () => {
        const type = typeSelect.value;
        switch (type) {
          case 'hasFeature': {
            const name = wrapper.querySelector('.picker-feature-name')?.value.trim();
            return name ? `hasFeature:${name}` : '';
          }
          case 'hasDomain': {
            const name = wrapper.querySelector('.picker-domain-name')?.value.trim();
            return name ? `hasDomain:${name}` : '';
          }
          case 'hasSpellcasting':
            return 'hasSpellcasting';
          case 'traitAtLeast': {
            const trait  = wrapper.querySelector('.picker-trait-select')?.value;
            const minVal = wrapper.querySelector('.picker-min-value')?.value;
            return (trait && minVal) ? `traitAtLeast:${trait}:${minVal}` : '';
          }
          case 'tierAtLeast': {
            const min = wrapper.querySelector('.picker-tier-min')?.value ?? '1';
            return `tierAtLeast:${min}`;
          }
          case 'levelAtLeast': {
            const min = wrapper.querySelector('.picker-level-min')?.value ?? '1';
            return `levelAtLeast:${min}`;
          }
          case 'classIs': {
            const cls = wrapper.querySelector('.picker-class-name')?.value.trim();
            return cls ? `classIs:${cls}` : '';
          }
          case 'custom':
          default:
            return '';
        }
      };

      // Apply the built atom to the requirement field using the given mode.
      // 'set' replaces; 'and'/'or' append if field is non-empty, else act as 'set'.
      const applyToField = (mode) => {
        const formula = buildFormula();
        if (!formula) { pickerPanel.hidden = true; return; }
        if (reqInput) {
          const existing = reqInput.value.trim();
          if (mode === 'set' || !existing) {
            reqInput.value = formula;
          } else if (mode === 'and') {
            reqInput.value = `${existing} AND ${formula}`;
          } else if (mode === 'or') {
            reqInput.value = `${existing} OR ${formula}`;
          }
          // Fire the existing sync listener so #config is updated immediately.
          reqInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        pickerPanel.hidden = true;
      };

      setBtn?.addEventListener('click', () => applyToField('set'));
      andBtn?.addEventListener('click', () => applyToField('and'));
      orBtn?.addEventListener('click',  () => applyToField('or'));
    }

    // Restore collapse state: any <details> whose ID was open before the re-render
    // should have its open attribute added back.
    for (const d of el.querySelectorAll('.config-category')) {
      const id = d.querySelector('[data-category-id]')?.dataset.categoryId;
      if (id && this.#openCategories.has(id)) d.setAttribute('open', '');
    }
    for (const d of el.querySelectorAll('.config-language')) {
      const id = d.querySelector('[data-language-id]')?.dataset.languageId;
      if (id && this.#openLanguages.has(id)) d.setAttribute('open', '');
    }
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

  _findCostRule(categoryId, languageId, index) {
    return this._findLanguage(categoryId, languageId)?.costRules?.[index] ?? null;
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
      costRules:   [],
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
    lang.cousins.push({ languageId: '', discountAmount: 0, waiveRequirement: false });
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

  _addCostRule(categoryId, languageId) {
    const lang = this._findLanguage(categoryId, languageId);
    if (!lang) return;
    (lang.costRules ??= []).push({ requirement: null, discountAmount: 0 });
    this.render();
  }

  async _removeCostRule(categoryId, languageId, index) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('DHLANG.Settings.confirmDeleteTitle') },
      content: `<p>${game.i18n.localize('DHLANG.Settings.confirmDeleteCostRule')}</p>`,
    });
    if (!confirmed) return;
    const lang = this._findLanguage(categoryId, languageId);
    if (!lang) return;
    lang.costRules.splice(index, 1);
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

    // ── Roll-formula checker (math expressions only) ──────────────────────
    const check = async (formula, label) => {
      if (!formula && formula !== 0) return null;
      try {
        return await evaluateFormula(String(formula), MOCK_ACTOR);
      } catch (e) {
        errors.push(game.i18n.format('DHLANG.Settings.validationError', { error: `${label}: ${e.message}` }));
        return null;
      }
    };

    // ── Keyword-requirement syntax checker ────────────────────────────────
    // Validates a single requirement atom (no AND/OR). Keywords are syntax-
    // checked only; Roll formulas are evaluated against MOCK_ACTOR.
    const VALID_TRAITS = ['agility', 'strength', 'finesse', 'instinct', 'presence', 'knowledge'];
    const checkAtom = async (req, label) => {
      if (!req) return;
      if (req.startsWith('hasFeature:')) {
        const value = req.slice('hasFeature:'.length).trim();
        if (!value) errors.push(game.i18n.format('DHLANG.Settings.validationError', { error: `${label}: hasFeature requires a feature name (e.g. hasFeature:Spellcasting)` }));
        return;
      }
      if (req.startsWith('hasDomain:')) {
        const value = req.slice('hasDomain:'.length).trim();
        if (!value) errors.push(game.i18n.format('DHLANG.Settings.validationError', { error: `${label}: hasDomain requires a domain name (e.g. hasDomain:Divine)` }));
        return;
      }
      if (req === 'hasSpellcasting') return;
      if (req.startsWith('traitAtLeast:')) {
        const parts = req.slice('traitAtLeast:'.length).split(':');
        const trait = parts[0]?.toLowerCase();
        const minVal = Number(parts[1]);
        if (parts.length < 2 || !VALID_TRAITS.includes(trait) || isNaN(minVal)) {
          errors.push(game.i18n.format('DHLANG.Settings.validationError', {
            error: `${label}: traitAtLeast format is traitAtLeast:<trait>:<number> with trait one of: ${VALID_TRAITS.join(', ')}`,
          }));
        }
        return;
      }
      if (req.startsWith('tierAtLeast:')) {
        const n = Number(req.slice('tierAtLeast:'.length).trim());
        if (isNaN(n)) errors.push(game.i18n.format('DHLANG.Settings.validationError', {
          error: `${label}: tierAtLeast requires a number (e.g. tierAtLeast:2)`,
        }));
        return;
      }
      if (req.startsWith('levelAtLeast:')) {
        const n = Number(req.slice('levelAtLeast:'.length).trim());
        if (isNaN(n)) errors.push(game.i18n.format('DHLANG.Settings.validationError', {
          error: `${label}: levelAtLeast requires a number (e.g. levelAtLeast:3)`,
        }));
        return;
      }
      if (req.startsWith('classIs:')) {
        const cls = req.slice('classIs:'.length).trim();
        if (!cls) errors.push(game.i18n.format('DHLANG.Settings.validationError', {
          error: `${label}: classIs requires a class name (e.g. classIs:Warrior)`,
        }));
        return;
      }
      // Standard Roll formula fallback
      await check(req, label);
    };

    // Splits compound AND/OR expressions and validates each atom.
    const checkRequirement = async (requirement, label) => {
      if (!requirement) return;
      const atoms = requirement.trim().split(/ OR | AND /i).map(a => a.trim()).filter(Boolean);
      for (const atom of atoms) await checkAtom(atom, label);
    };

    // ── Validate point formula ────────────────────────────────────────────
    const pointTotal = await check(this.#config.pointFormula, 'Point Formula');
    if (pointTotal !== null && pointTotal <= 0) {
      errors.push(game.i18n.format('DHLANG.Settings.validationError', { error: 'Point Formula must resolve to a positive integer' }));
    }

    // ── Validate categories, languages, cousins ───────────────────────────
    for (const cat of (this.#config.categories ?? [])) {
      const catCost = await check(cat.cost, `Category "${cat.name}" cost`);
      if (catCost !== null && catCost < 0) {
        errors.push(game.i18n.format('DHLANG.Settings.validationError', { error: `Category "${cat.name}" cost must be non-negative` }));
      }
      if (cat.requirement) await checkRequirement(cat.requirement, `Category "${cat.name}" requirement`);

      for (const lang of (cat.languages ?? [])) {
        if (lang.cost !== null && lang.cost !== '') {
          const lc = await check(lang.cost, `Language "${lang.name}" cost`);
          if (lc !== null && lc < 0) {
            errors.push(game.i18n.format('DHLANG.Settings.validationError', { error: `Language "${lang.name}" cost must be non-negative` }));
          }
        }
        if (lang.requirement) await checkRequirement(lang.requirement, `Language "${lang.name}" requirement`);

        for (const rule of (lang.costRules ?? [])) {
          if (rule.discountAmount !== null && rule.discountAmount !== '') {
            const rc = await check(rule.discountAmount, `Cost rule in "${lang.name}"`);
            if (rc !== null && rc < 0) {
              errors.push(game.i18n.format('DHLANG.Settings.validationError', {
                error: `Cost rule in "${lang.name}" discount amount must be non-negative`,
              }));
            }
          }
          if (rule.requirement) await checkRequirement(rule.requirement, `Cost rule in "${lang.name}" requirement`);
        }

        for (const cousin of (lang.cousins ?? [])) {
          const da = await check(cousin.discountAmount, `Cousin discount amount in "${lang.name}"`);
          if (da !== null && da < 0) {
            errors.push(game.i18n.format('DHLANG.Settings.validationError', { error: `Cousin discount amount in "${lang.name}" must be non-negative` }));
          }
        }
      }
    }

    return errors;
  }
}
