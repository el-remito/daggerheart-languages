# PROJECT_REFERENCE.md — daggerheart-languages

> **Purpose:** Authoritative reference for Claude sessions working on this module.
> Reflects the *as-built* state of the codebase, not the original plan.
> Read this before making any changes. The source-of-truth for intent is `CLAUDE.md`;
> this document captures implementation details, decisions, and gotchas discovered
> during development.

---

## 1. What This Module Does

A Foundry VTT v14 module for the Daggerheart system that adds a **purely informational language system**:

- GMs define language **categories** (with a default cost and optional requirement), and **languages** within each category (with optional cost/requirement overrides and cousin relationships).
- PC actors have a **point pool** (formula-driven) for acquiring languages; adversaries acquire for free.
- A **badge icon** injected into every actor sheet header shows acquired languages on hover and opens an acquisition dialog on click.
- All data lives in `game.settings` (world config) and actor flags. No system files are modified.

---

## 2. File Structure & Roles

```
daggerheart-languages/
├── module.json                          # Manifest: id, esmodules, styles, lang
├── daggerheart-languages.mjs            # Entry point: init hook, renderActorSheetV2 hook
├── scripts/
│   ├── constants.mjs                    # MODULE_ID, FLAGS, SETTINGS, ACTOR_TYPES, TEMPLATES
│   ├── settings.mjs                     # game.settings.register + registerMenu
│   ├── hooks.mjs                        # updateActor re-render hook
│   ├── utils/
│   │   ├── formula.mjs                  # evaluateFormula(), evaluateRequirement()
│   │   └── languages.mjs               # getAcquiredLanguageIds(), findLanguage(),
│   │                                   #   resolveLanguageCost(), resolveEffectiveRequirement(),
│   │                                   #   calculatePointPool()
│   ├── apps/
│   │   ├── language-dialog.mjs          # LanguageDialog — player-facing acquisition UI
│   │   └── settings-config.mjs         # LanguageSettingsConfig — GM world config UI
│   └── badge/
│       └── badge.mjs                   # injectLanguageBadge() — DOM injection
├── templates/
│   ├── language-dialog.hbs
│   ├── settings-config.hbs
│   └── badge-tooltip.hbs               # Stub — unused; data-tooltip used instead
├── styles/
│   └── daggerheart-languages.css
└── lang/
    └── en.json                          # 48 localisation keys
```

---

## 3. Constants (`scripts/constants.mjs`)

```js
MODULE_ID  = 'daggerheart-languages'
FLAGS      = { ACQUIRED: 'acquiredLanguages' }
SETTINGS   = { CONFIG: 'languageConfig', MENU: 'languageConfigMenu' }
ACTOR_TYPES = { PC: 'character', ADVERSARY: 'adversary' }
TEMPLATES  = {
  LANGUAGE_DIALOG: 'modules/daggerheart-languages/templates/language-dialog.hbs',
  SETTINGS_CONFIG: 'modules/daggerheart-languages/templates/settings-config.hbs',
  BADGE_TOOLTIP:   'modules/daggerheart-languages/templates/badge-tooltip.hbs',
}
```

---

## 4. Data Schemas

### 4a. World Config (`game.settings.get(MODULE_ID, SETTINGS.CONFIG)`)

```js
{
  pointFormula: "2",          // string — Roll formula evaluated per actor
  categories: [
    {
      id:          string,    // foundry.utils.randomID()
      name:        string,
      cost:        number|string,   // category default cost (formula or integer)
      requirement: string|null,     // formula or null
      description: string|null,     // optional display text (added post-plan)
      languages: [
        {
          id:          string,      // foundry.utils.randomID()
          name:        string,
          cost:        number|string|null,  // null = use category default
          requirement: string|null,         // null = use category default
          description: string|null,         // optional display text (added post-plan)
          cousins: [
            {
              languageId:         string,   // ID of another language in config
              discountedCost:     number|string,  // formula or integer
              waiveRequirement:   boolean,
            }
          ]
        }
      ]
    }
  ]
}
```

> **Note:** `description` on both categories and languages was not in the original CLAUDE.md spec — it was added during Step 10b. All existing data without it treats it as `null`.

### 4b. Per-Actor Flag

```js
actor.getFlag('daggerheart-languages', 'acquiredLanguages')
// → string[]  (array of language IDs)
// Returns [] if not set (never null/undefined in practice after first acquire)
```

---

## 5. Key Technical Discoveries (not in CLAUDE.md)

### Hook name for sheet render
`renderActorSheet` **never fires** in Foundry v14 for Daggerheart. The correct hook is:
```js
Hooks.on('renderActorSheetV2', (app, html, _data) => { ... })
```
This fires for both `CharacterSheet` and `AdversarySheet` (confirmed via live diagnostic). The actor is `app.document`, **not** `app.actor`.

### ApplicationV2 open windows
In `hooks.mjs`, open sheets are found via `ui.windows` using `w.document?.id` (not `w.actor?.id`):
```js
for (const w of Object.values(ui.windows)) {
  if (w.document?.id === actor.id) w.render();
}
```

### Fixed window height required for internal scroll
`position: { height: 'auto' }` causes the *page* to scroll rather than the window's content area. The settings config uses `height: 650` (fixed integer) so `.window-content` scrolls internally.

### Handlebars `eq` helper unavailable
The `{{#if (eq a b)}}` subexpression helper is **not guaranteed** in Foundry v14's Handlebars environment. All comparisons are pre-computed as booleans in `_prepareContext` and passed to the template. Example: cousin `_options` carry `selected: boolean`.

### `<summary>` pseudo-elements unreliable
`::before` on `<summary>` is overridden by the browser's native `::marker` in Chrome. The codebase uses explicit `<span class="dh-collapse-arrow">▶</span>` DOM elements inside each `<summary>` instead.

### `<select>` appearance
Native `<select>` ignores `background-color` when `appearance: auto`. The cousin dropdowns use `appearance: none; -webkit-appearance: none; background: #1e1a27` (solid, not transparent) to override OS rendering.

### Cost values are strings from form inputs
All cost/requirement values in the config come from `<input type="text">` elements and are stored as strings. **Always coerce with `Number()` before arithmetic.** `resolveLanguageCost` and `calculatePointPool` do this internally.

### Collapse state is lost on re-render
`LanguageSettingsConfig` overrides `render()` to call `_captureCollapseState()` before the DOM is replaced, then restores the state in `_onRender`. Category/language `<details>` state is keyed by `data-category-id` / `data-language-id` (not array index).

---

## 6. Business Logic

### Cost Resolution (`resolveLanguageCost`)
1. `originalCost = Number(language.cost ?? category.cost ?? 0)`
2. Find all cousins whose `languageId` is in actor's acquired IDs
3. Evaluate `discountedCost` formula for each; skip errors
4. Pick cousin with **lowest** discounted cost (= best discount); ties: first found
5. Return `{ effectiveCost, originalCost, cousinApplied, requirementWaived }`

### Point Pool (`calculatePointPool`)
- `total` = `evaluateFormula(config.pointFormula, actor)`
- `spent` = sum of `effectiveCost` (from `resolveLanguageCost`) for each acquired language
- **Cousin discounts ARE counted** in spent (overrides original CLAUDE.md spec, per user direction)
- If a language ID is in actor flags but not in config, it is skipped silently

### Requirement Resolution (`resolveEffectiveRequirement`)
- Returns `null` if `requirementWaived` (from cousin)
- Otherwise: `language.requirement ?? category.requirement ?? null`

### Acquisition Rules
| | PC (`character`) | Adversary (`adversary`) |
|---|---|---|
| Cost enforced | Yes | No |
| Requirement enforced | Yes (unless cousin waives) | No |
| Confirmation dialog | Yes | No |
| Remove button visible | GM only | GM only |
| Point bar shown | Yes | No |

---

## 7. Settings Config (`LanguageSettingsConfig`) — Important Patterns

- `#config` is a **deep clone** of saved settings. Mutations accumulate here; saved only on explicit Save.
- `_prepareContext` sorts categories and languages **in-place** on `#config` (safe because it's a clone).
- Cousin `_options` are built **per-cousin** with a pre-computed `selected` boolean and filtered to exclude: the language itself + all other cousins' currently selected languages.
- All `data-field` inputs sync to `#config` via `_onRender` event listeners keyed by `data-category-id` / `data-language-id` / `data-cousin-index`.
- Cousin index (`data-cousin-index`) maps directly to array position — cousin sort must happen **before** building `_options` so indices are consistent.
- Validation uses `MOCK_ACTOR` (all traits 0, level 1, proficiency 1) to test formulas before save.

---

## 8. Badge (`badge.mjs`) — Important Patterns

- `injectLanguageBadge` is **async**. The hook callback in `daggerheart-languages.mjs` does not await it (floating promise — normal for Foundry hooks).
- Badge is inserted **synchronously** first; glow class is added **after** `calculatePointPool` resolves.
- Tooltip phrasing branches on `actor.type`:
  - PC: `DHLANG.Badge.pcSpeaksLanguages` / `DHLANG.Badge.pcNoLanguages` (includes actor name)
  - Adversary: `DHLANG.Badge.speaksLanguages` / `DHLANG.Badge.noLanguages`
- Glow state classes (PC only, applied async):
  - `.dh-lang-badge--unspent` — `pool.remaining > 0` — amber pulse
  - `.dh-lang-badge--overspent` — `pool.spent > pool.total` — red pulse
  - Neither class — exactly spent or point pool evaluation failed

---

## 9. Localisation Keys (`lang/en.json`)

### Settings
| Key | Purpose |
|---|---|
| `DHLANG.Settings.menuName` | Module settings button label |
| `DHLANG.Settings.menuLabel` | Button text |
| `DHLANG.Settings.menuHint` | Button hint text |
| `DHLANG.Settings.title` | Window title |
| `DHLANG.Settings.pointFormula` | Point formula field label |
| `DHLANG.Settings.pointFormulaHint` | Point formula hint text |
| `DHLANG.Settings.categoryName` | Category name input placeholder |
| `DHLANG.Settings.languageName` | Language name input placeholder |
| `DHLANG.Settings.addCategory` | Add category button |
| `DHLANG.Settings.addLanguage` | Add language button |
| `DHLANG.Settings.addCousin` | Add cousin button |
| `DHLANG.Settings.defaultCost` | Category default cost label |
| `DHLANG.Settings.defaultRequirement` | Category default requirement label |
| `DHLANG.Settings.costOverride` | Language cost override label |
| `DHLANG.Settings.requirementOverride` | Language requirement override label |
| `DHLANG.Settings.categoryDescription` | Category description textarea label |
| `DHLANG.Settings.languageDescription` | Language description textarea label |
| `DHLANG.Settings.cousins` | Cousin section heading |
| `DHLANG.Settings.cousinLanguage` | Cousin dropdown placeholder |
| `DHLANG.Settings.cousinDiscountedCost` | Cousin discounted cost label |
| `DHLANG.Settings.cousinWaiveRequirement` | Cousin waive requirement checkbox label |
| `DHLANG.Settings.validationError` | Formula validation error (`{error}`) |
| `DHLANG.Settings.save` | Save button |
| `DHLANG.Settings.cancel` | Cancel button |
| `DHLANG.Settings.confirmDeleteTitle` | Deletion confirm dialog title |
| `DHLANG.Settings.confirmDeleteCategory` | Category deletion confirm body |
| `DHLANG.Settings.confirmDeleteLanguage` | Language deletion confirm body |
| `DHLANG.Settings.confirmDeleteCousin` | Cousin deletion confirm body |

### Badge
| Key | Purpose |
|---|---|
| `DHLANG.Badge.noLanguages` | Adversary — no languages tooltip |
| `DHLANG.Badge.speaksLanguages` | Adversary — has languages tooltip (`{languages}`) |
| `DHLANG.Badge.pcNoLanguages` | PC — no languages tooltip (`{name}`) |
| `DHLANG.Badge.pcSpeaksLanguages` | PC — has languages tooltip (`{name}`, `{languages}`) |

### Dialog
| Key | Purpose |
|---|---|
| `DHLANG.Dialog.title` | Window title (`{name}`) |
| `DHLANG.Dialog.points` | Point bar label |
| `DHLANG.Dialog.cost` | Cost label |
| `DHLANG.Dialog.acquire` | Acquire button |
| `DHLANG.Dialog.acquired` | Acquired languages section heading |
| `DHLANG.Dialog.remove` | Remove button (GM) |
| `DHLANG.Dialog.cousinDiscount` | Cousin discount note |
| `DHLANG.Dialog.requirementUnmet` | Requirement tooltip (`{requirement}`) |
| `DHLANG.Dialog.confirmAcquireTitle` | Acquisition confirm title |
| `DHLANG.Dialog.confirmAcquireContent` | Acquisition confirm body (`{name}`, `{cost}`) |
| `DHLANG.Dialog.adversaryFreeNote` | Adversary disclaimer note |
| `DHLANG.Dialog.noLanguagesConfigured` | Empty state hint |

---

## 10. CSS Class Inventory

### Badge
| Class | Element | Purpose |
|---|---|---|
| `.dh-lang-badge` | `<span>` | Base badge — inline-flex, gold icon, next to actor name |
| `.dh-lang-badge--unspent` | `<span>` | Amber pulse glow — PC has unspent points |
| `.dh-lang-badge--overspent` | `<span>` | Red pulse glow — PC has overspent points |

### Language Dialog
| Class | Element | Purpose |
|---|---|---|
| `.dh-languages-dialog` | root | Dialog container |
| `.point-bar` | `<div>` | Point pool row (flex) |
| `.point-track` | `<div>` | Progress bar track |
| `.point-fill` | `<div>` | Progress bar fill (amber) |
| `.point-fill.overspent` | `<div>` | Progress bar fill (red) |
| `.point-label` | `<span>` | "Points" label |
| `.point-values` | `<span>` | "X / Y" text |
| `.adversary-note` | `<p>` | Adversary disclaimer |
| `.lang-category` | `<details>` | Collapsible category |
| `.lang-category-name` | `<summary>` | Category header |
| `.lang-category-description` | `<p>` | Category description (italic) |
| `.lang-row` | `<div>` | Single language row |
| `.lang-row.unaffordable` | | Greyed out — cannot afford |
| `.lang-row.unmet-requirement` | | Greyed out — requirement not met |
| `.lang-name` | `<span>` | Language name |
| `.lang-description` | `<p>` | Language description (italic) |
| `.lang-actions` | `<div>` | Cost + button flex container |
| `.lang-cost` | `<span>` | Cost display |
| `.lang-acquired-tag` | `<span>` | ✓ checkmark (already acquired) |
| `.acquired-section` | `<div>` | Acquired languages section |
| `.acquired-row` | `<div>` | Single acquired language row |

### Settings Config
| Class | Element | Purpose |
|---|---|---|
| `.dh-settings-config` | root | Settings container |
| `.config-section` | `<div>` | Generic section wrapper |
| `.formula-section` | `<div>` | Point formula section |
| `.categories-section` | `<div>` | All categories wrapper |
| `.config-category` | `<details>` | Collapsible category block |
| `.category-header` | `<summary>` | Category summary row |
| `.dh-collapse-arrow` | `<span>` | ▶ arrow (rotates 90° when open) |
| `.category-defaults` | `<div>` | Category cost/requirement/desc fields |
| `.config-language` | `<details>` | Collapsible language block |
| `.language-header` | `<summary>` | Language summary row |
| `.language-fields` | `<div>` | Language cost/requirement/desc fields |
| `.cousin-section` | `<div>` | Cousin relationships for a language |
| `.cousin-row` | `<div>` | Single cousin row |
| `.cousin-cost` | `<label>` | Cousin discounted cost label |
| `.cousin-waive` | `<label>` | Cousin waive-requirement checkbox |
| `.remove-btn.danger` | `<button>` | Red delete button |
| `.add-btn` | `<button>` | Add item button |
| `.category-add-btn` | `<button>` | Add category button |
| `.config-footer` | `<div>` | Save/Cancel footer |
| `.save-btn` | `<button>` | Save button |
| `.cancel-btn` | `<button>` | Cancel button |

---

## 11. Adding New Features — Checklist

When extending this module, follow these patterns:

**Adding a new field to the language or category schema:**
1. Seed the default in `_addLanguage()` / `_addCategory()` in `settings-config.mjs`
2. Add a `<textarea>` or `<input>` to `templates/settings-config.hbs`
3. Wire up the sync listener in `_onRender` in `settings-config.mjs`
4. Pass the value through in `_prepareContext` of `language-dialog.mjs`
5. Render it in `templates/language-dialog.hbs`
6. Add the i18n key to `lang/en.json`
7. Add CSS if needed

**Adding a new action button:**
1. Check `CLAUDE.md` §"data-action names already registered" — do not reuse system names
2. Add `data-action="yourAction"` to the HBS template button
3. Wire up the listener in `_onRender` via `el.querySelector('[data-action="yourAction"]')`

**Making a formula-based calculation:**
- Always `await evaluateFormula(String(value), actor)`
- Always coerce result with `Number()` before arithmetic
- Wrap in try/catch — malformed formulas should fail silently where possible

**Changing badge appearance:**
- The badge element is a `<span class="dh-lang-badge">` injected after `h1.actor-name` inside `.name-row`
- State classes (`.dh-lang-badge--unspent`, `.dh-lang-badge--overspent`) are added async after pool evaluation
- If adding more state classes, follow the same async pattern at the end of `injectLanguageBadge()`

---

## 12. Known Limitations / Future Considerations

- **Spent points are recalculated live** from current costs — if a GM changes a language cost after a player acquires it, the displayed spent total changes. This is intentional (simpler storage).
- **No chat integration** — language acquisition does not post to chat.
- **No macro/API surface** — there is no public API for other modules to interact with.
- **Adversary acquisition is GM-only** — non-GM players cannot see or click acquire buttons on adversary sheets (the `canAcquire` flag is always false for non-GM on adversaries).
- **Formula errors during badge render** fail silently — a broken `pointFormula` means no glow class is applied, but the badge still renders.
- **The `badge-tooltip.hbs` template** is a stub and is not used — tooltip text is set via `data-tooltip` attribute directly on the badge element.
