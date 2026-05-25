import { MODULE_ID, FLAGS, SETTINGS, TEMPLATES } from '../constants.mjs';
import { evaluateRequirement, evaluateFormula, formatRequirement } from '../utils/formula.mjs';
import {
  getAcquiredLanguageIds,
  findLanguage,
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
    position: { width: 520, height: 550 },
  };

  static PARTS = {
    main: { template: TEMPLATES.LANGUAGE_DIALOG },
  };

  // Collapse state — persisted across re-renders so user-opened categories stay open.
  #openCategories = new Set();

  constructor(options = {}) {
    super(options);
    this.actor = options.actor;
  }

  /** Snapshot which category <details> are currently open before a re-render wipes the DOM. */
  _captureCollapseState() {
    if (!this.element) return;
    this.#openCategories = new Set();
    for (const d of this.element.querySelectorAll('.lang-category')) {
      if (d.open) {
        const id = d.dataset.categoryId;
        if (id) this.#openCategories.add(id);
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
      pool.breakdownLines = pool.breakdown.map(entry => entry.isBase
        ? { label: game.i18n.localize('DHLANG.Dialog.poolBreakdownBase'), value: entry.value, sign: '' }
        : {
            label:    entry.label ?? game.i18n.localize('DHLANG.Dialog.poolBreakdownBonus'),
            value:    Math.abs(entry.value),
            sign:     entry.value >= 0 ? '+' : '−',
            negative: entry.value < 0,
          }
      );
      pool.hasRules = pool.breakdown.length > 1;
      pool.sticky   = pool.remaining > 0;
    }

    // Build active discounts list (PC only) — best discount per language only,
    // using the same winner logic as resolveLanguageCost().
    const activeDiscounts = [];
    if (isPC) {
      for (const cat of (config.categories ?? [])) {
        for (const lang of (cat.languages ?? [])) {
          let discount = null;
          try {
            const result = await resolveLanguageCost(lang, cat, this.actor);
            if (result.effectiveCost < result.originalCost) {
              const discountAmount = result.originalCost - result.effectiveCost;
              let requirementText = '';
              if (result.cousinApplied) {
                const cousinLang = findLanguage(result.cousinApplied.languageId, config);
                requirementText = game.i18n.format('DHLANG.Dialog.activeDiscountsCousin', { name: cousinLang?.language?.name ?? '?' });
              } else if (result.costRuleApplied) {
                requirementText = formatRequirement(result.costRuleApplied.requirement);
              }
              discount = { discountAmount, requirementText };
            }
          } catch (_) { /* skip */ }

          if (discount) {
            activeDiscounts.push({
              languageName:    lang.name,
              categoryName:    cat.name,
              alreadyAcquired: acquiredIds.includes(lang.id),
              discount,
            });
          }
        }
      }
    }

    const categories = [];
    const sortedCategories = [...(config.categories ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const category of sortedCategories) {
      const languages = [];
      const sortedLanguages = [...(category.languages ?? [])].sort((a, b) => a.name.localeCompare(b.name));
      for (const language of sortedLanguages) {
        const alreadyAcquired = acquiredIds.includes(language.id);
        const { effectiveCost, originalCost, cousinApplied, requirementWaived, costRuleApplied } =
          await resolveLanguageCost(language, category, this.actor);
        const requirementFormula = resolveEffectiveRequirement(language, category, requirementWaived);
        const requirementMet = await evaluateRequirement(requirementFormula, this.actor);

        // Build the single unified ⓘ badge tooltip — always at most one badge per row.
        // Priority order: active discount context → active cost rule → full cousin list.
        const infoParts = [];

        // 1. Active cousin discount — names the cousin that won the contest.
        if (cousinApplied) {
          const cousinEntry = findLanguage(cousinApplied.languageId, config);
          const cousinName  = cousinEntry ? cousinEntry.language.name : cousinApplied.languageId;
          infoParts.push(
            game.i18n.format('DHLANG.Dialog.discountReason', {
              name:   this.actor.name,
              cousin: cousinName,
            })
          );
        }

        // 2. Active cost rule discount — names the rule's requirement.
        if (costRuleApplied?.requirement) {
          infoParts.push(
            game.i18n.format('DHLANG.Dialog.specialCost', {
              requirement: formatRequirement(costRuleApplied.requirement),
            })
          );
        }

        // 3. Full cousin relationship list (informational).
        const cousinsInfo = (language.cousins ?? [])
          .map(c => {
            const entry = findLanguage(c.languageId, config);
            return entry ? `${entry.language.name} (-${c.discountAmount ?? 0})` : null;
          })
          .filter(Boolean);
        if (cousinsInfo.length > 0) {
          infoParts.push(
            `<strong>${game.i18n.localize('DHLANG.Dialog.relatedLanguages')}</strong><br>${cousinsInfo.join('<br>')}`
          );
        }

        const infoTooltip = infoParts.length > 0 ? infoParts.join('<br>') : null;

        const canAfford = isPC ? (pool.remaining >= effectiveCost) : true;
        // Adversaries: cost and requirements are display-only, never enforced.
        const canAcquire = !alreadyAcquired && (isPC ? (canAfford && requirementMet) : true);

        // Build the disabled-button tooltip: requirement takes priority; affordability is the fallback.
        let requirementTooltip = '';
        if (!requirementMet && requirementFormula) {
          requirementTooltip = game.i18n.format('DHLANG.Dialog.requirementUnmet', {
            requirement: formatRequirement(requirementFormula),
          });
        } else if (isPC && !canAfford && !alreadyAcquired) {
          requirementTooltip = game.i18n.format('DHLANG.Dialog.cannotAfford', {
            cost:      effectiveCost,
            remaining: pool.remaining,
          });
        }

        languages.push({
          id:               language.id,
          name:             language.name,
          description:      language.description ?? null,
          effectiveCost,
          originalCost,
          hasDiscount:      cousinApplied !== null || costRuleApplied !== null,
          requirementFormula,
          requirementTooltip,
          requirementMet,
          alreadyAcquired,
          canAcquire,
          canAfford,
          infoTooltip,
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
        if (lang) return { id: lang.id, name: lang.name, universal: !!lang.universal };
      }
      return { id, name: id, universal: false };
    }).sort((a, b) => {
      if (a.universal !== b.universal) return a.universal ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const acquiredNames = acquiredLanguages.map(l => l.name).join(', ');
    const acquiredTooltip = isPC
      ? (acquiredLanguages.length
          ? game.i18n.format('DHLANG.Badge.pcSpeaksLanguages', { name: this.actor.name, languages: acquiredNames })
          : game.i18n.format('DHLANG.Badge.pcNoLanguages', { name: this.actor.name }))
      : (acquiredLanguages.length
          ? game.i18n.format('DHLANG.Badge.speaksLanguages', { languages: acquiredNames })
          : game.i18n.localize('DHLANG.Badge.noLanguages'));

    return {
      actor:          this.actor,
      isPC,
      isGM,
      pool,
      pointFormula:   config.pointFormula ?? '2',
      categories,
      acquiredLanguages,
      acquiredTooltip,
      activeDiscounts,
      isAdversary:    this.actor.type === 'adversary',
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
    // Share to chat button — stopPropagation so clicking it doesn't toggle the acquired <details>.
    const shareBtn = this.element.querySelector('[data-action="shareLanguages"]');
    if (shareBtn) shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._onShareLanguages(e);
    });

    // Restore collapse state: any category that was open before the re-render stays open.
    for (const d of this.element.querySelectorAll('.lang-category')) {
      const id = d.dataset.categoryId;
      if (id && this.#openCategories.has(id)) d.setAttribute('open', '');
    }

    // Search bar — filters language rows and hides empty categories in real time.
    // Matches against: language name, language description, category name, category description.
    // If the category name/description matches, all its languages are shown.
    // Matching categories are force-opened (<details open>) so their content is visible.
    const searchInput = this.element.querySelector('.dh-lang-search');
    if (searchInput) {
      let savedOpenState = null;
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        const categoryEls = [...this.element.querySelectorAll('.lang-category')];

        if (savedOpenState === null) {
          savedOpenState = new Map(categoryEls.map(c => [c, c.open]));
        }

        if (!query) {
          for (const cat of categoryEls) {
            cat.hidden = false;
            cat.open = savedOpenState.get(cat) ?? false;
            for (const row of cat.querySelectorAll('.lang-row')) row.hidden = false;
          }
          return;
        }

        for (const cat of categoryEls) {
          const catName = cat.querySelector('.lang-category-title')?.textContent.toLowerCase() ?? '';
          const catDesc = cat.querySelector('.lang-category-description')?.textContent.toLowerCase() ?? '';
          const categoryMatches = catName.includes(query) || catDesc.includes(query);

          let anyVisible = false;
          for (const row of cat.querySelectorAll('.lang-row')) {
            const name = row.querySelector('.lang-name')?.textContent.toLowerCase() ?? '';
            const desc = row.querySelector('.lang-description')?.textContent.toLowerCase() ?? '';
            const match = categoryMatches || name.includes(query) || desc.includes(query);
            row.hidden = !match;
            if (match) anyVisible = true;
          }

          const visible = anyVisible || categoryMatches;
          cat.hidden = !visible;
          if (visible) cat.open = true;
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

  async _onShareLanguages() {
    const config = game.settings.get(MODULE_ID, SETTINGS.CONFIG);
    const names = getAcquiredLanguageIds(this.actor)
      .map(id => { const f = findLanguage(id, config); return f ? f.language.name : id; });
    if (!names.length) return;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format('DHLANG.Dialog.chatMessage', { languages: names.join(', ') }),
    });
  }

  async _onRemoveLanguage(event) {
    if (!game.user.isGM) return;
    const languageId = event.currentTarget.dataset.languageId;
    const acquired = getAcquiredLanguageIds(this.actor);
    await this.actor.setFlag(MODULE_ID, FLAGS.ACQUIRED, acquired.filter(id => id !== languageId));
    this.render();
  }
}
