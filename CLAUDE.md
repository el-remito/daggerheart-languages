# CLAUDE.md — `daggerheart-languages` Foundry VTT Module

## Overview

Build a Foundry VTT module named **`daggerheart-languages`** that adds a purely informational language system to the Daggerheart system (v2.6) running on Foundry v14.

The end goal is simple: a GM can define languages and their acquisition rules; players can see and acquire languages on their character sheets; and anyone looking at a character can quickly see something like:

> **Bob the Fighter** *(spoken languages: Italian, Old Latin, Cabal)*

Languages are **purely informational** — no chat integration, no permission gating, no mechanical effects.

---

## Technical Environment

| Concern | Value |
|---|---|
| Foundry version | v14 |
| Target system | Daggerheart v2.6 |
| System ID | `daggerheart` (referenced as `CONFIG.DH.id` in system code) |
| Sheet paradigm | ApplicationV2 + HandlebarsApplicationMixin |
| Template engine | Handlebars (`.hbs`) |
| Module ID | `daggerheart-languages` |
| Flag namespace | `daggerheart-languages` |

### Key System Observations (verified from source references)

- The Daggerheart system uses `data-action` attributes for ApplicationV2 event delegation
- Actor data is referenced as `document.system.*` in templates (not `actor.*`)
- PC actor type string: `character` — sheet class: `CharacterSheet extends DHBaseActorSheet`
- Adversary (NPC) actor type string: `adversary`
- **Both PC and adversary sheet headers share the same structure:** a `.name-row` div containing `h1.actor-name` — badge injection logic is identical for both
- PC traits available for formulas: `agility`, `strength`, `finesse`, `instinct`, `presence`, `knowledge`
- `actor.getRollData()` exposes `@traits.<name>.value`, `@level`, `@proficiency`

**Do not modify any system files.** All integration is done via hooks and DOM injection.

---

## Repository Reference Files

Read these before writing any code that touches actor data or sheet rendering. They are located in `_references/`:

| File | What it answers |
|---|---|
| `_references/character-sheet.mjs` | Sheet class, all registered `data-action` names — avoid conflicts |
| `_references/character-data.mjs` | PC data model, schema fields, `getRollData()` — formula paths |
| `_references/character-header.hbs` | PC sheet header — badge injection point (`.name-row > h1.actor-name`) |
| `_references/adversary-header.hbs` | Adversary sheet header — identical `.name-row` structure to PC |

---

## File Structure

```
daggerheart-languages/
├── CLAUDE.md
├── module.json
├── daggerheart-languages.mjs           # Entry point: imports & registers all hooks
├── _references/                        # System source files for context only — do not modify
│   ├── character-sheet.mjs
│   ├── character-data.mjs
│   ├── character-header.hbs
│   └── adversary-header.hbs
├── scripts/
│   ├── constants.mjs                   # Module ID, flag keys, setting keys, defaults
│   ├── settings.mjs                    # game.settings registration
│   ├── hooks.mjs                       # All Hooks.on() declarations
│   ├── utils/
│   │   ├── formula.mjs                 # Roll API formula evaluation
│   │   └── languages.mjs              # Helpers: get acquired, resolve cost, check requirements
│   ├── apps/
│   │   ├── language-dialog.mjs         # ApplicationV2: actor language picker dialog
│   │   └── settings-config.mjs        # ApplicationV2: GM world config UI
│   └── badge/
│       └── badge.mjs                  # DOM injection: renders badge into actor sheet header
├── templates/
│   ├── language-dialog.hbs
│   ├── settings-config.hbs
│   └── badge-tooltip.hbs
├── styles/
│   └── daggerheart-languages.css
└── lang/
    └── en.json
```

---

## Data Architecture

### 1. World Configuration (GM Settings)

Stored as a single world-scoped `game.settings` entry. Only GMs can write to it.

**Setting key:** `languageConfig`

```js
// Full shape of the world config object
{
  pointFormula: "2 + floor(@traits.knowledge.value / 2)", // string, evaluated via Roll API
  categories: [
    {
      id: "common",           // string, unique, generated via foundry.utils.randomID()
      name: "Common Tongues", // string
      cost: 1,                // number or formula string — category default cost
      requirement: null,      // formula string or null — category default requirement
      languages: [
        {
          id: "elvish",             // string, unique, generated via foundry.utils.randomID()
          name: "Elvish",           // string
          cost: null,               // number, formula string, or null (null = use category default)
          requirement: null,        // formula string or null (null = use category default)
          cousins: [                // array, may be empty
            {
              languageId: "old-elvish",   // id of another language in the world config
              discountedCost: 0,          // number or formula string — cost if actor knows this cousin
              waiveRequirement: true      // boolean
            }
          ]
        }
      ]
    }
  ]
}
```

**Registration in `settings.mjs`:**

```js
game.settings.register('daggerheart-languages', 'languageConfig', {
  name: 'Language Configuration',
  scope: 'world',
  config: false,       // managed via custom UI, not the default settings panel
  type: Object,
  default: { pointFormula: '2', categories: [] }
});

game.settings.registerMenu('daggerheart-languages', 'languageConfigMenu', {
  name: 'Configure Languages',
  label: 'Open Language Config',
  icon: 'fas fa-language',
  type: LanguageSettingsConfig,  // the ApplicationV2 class
  restricted: true               // GM only
});
```

---

### 2. Per-Actor Data (Actor Flags)

Languages acquired by an actor are stored in actor flags. This never touches system data.

```js
// Reading
const acquired = actor.getFlag('daggerheart-languages', 'acquiredLanguages') ?? [];
// acquired is an array of language IDs: ["elvish", "old-latin"]

// Acquiring a language (owner or GM)
await actor.setFlag('daggerheart-languages', 'acquiredLanguages', [...acquired, newLanguageId]);

// Removing a language (GM only)
await actor.setFlag('daggerheart-languages', 'acquiredLanguages', acquired.filter(id => id !== languageId));
```

---

## Formula Evaluation (`scripts/utils/formula.mjs`)

Both the point pool formula and language costs/requirements are evaluated using Foundry's `Roll` API against the actor's roll data.

```js
/**
 * Evaluates a formula string against an actor's roll data.
 * Returns an integer, or throws if the result is not a valid integer.
 */
export async function evaluateFormula(formula, actor) {
  const rollData = actor.getRollData();
  const roll = new Roll(String(formula), rollData);
  await roll.evaluate();
  const result = roll.total;
  if (!Number.isInteger(result)) throw new Error(`Formula "${formula}" did not evaluate to an integer.`);
  return result;
}

/**
 * Evaluates a requirement expression.
 * Requirements are formulas that evaluate to 0 (fail) or any non-zero integer (pass).
 * If requirement is null or undefined, always returns true (no requirement).
 */
export async function evaluateRequirement(requirement, actor) {
  if (!requirement) return true;
  const result = await evaluateFormula(requirement, actor);
  return result !== 0;
}
```

**Available roll data keys for formulas (from `DhCharacter.getRollData()`, verified in `_references/character-data.mjs`):**

- `@traits.agility.value`
- `@traits.strength.value`
- `@traits.finesse.value`
- `@traits.instinct.value`
- `@traits.presence.value`
- `@traits.knowledge.value`
- `@level`
- `@proficiency`

---

## Language Resolution Logic (`scripts/utils/languages.mjs`)

### Resolving effective cost for a language

```
1. Start with the language's own cost if set, else use the category default cost
2. Check if the actor has any cousin languages (from language.cousins[])
3. For each cousin whose languageId is in actor's acquiredLanguages:
   - Evaluate that cousin's discountedCost formula
4. If any cousins match: apply the one with the HIGHEST discount
   (highest discount = lowest resulting discountedCost value)
   If two cousins produce the same discountedCost, use the first one found
5. If waiveRequirement is true on the winning cousin: requirement is waived
6. Return { effectiveCost, requirementWaived }
```

### Resolving effective requirement

```
1. If requirement was waived by cousin logic: return null (no requirement)
2. Use language's own requirement if set, else use category default requirement
3. Return the requirement formula string (or null)
```

### Point pool for a PC

```
1. Get pointFormula from world config
2. Evaluate against actor.getRollData()
3. Sum the current effective base costs of all acquired languages
   (base cost = category or language cost, before any cousin discount;
    cousin discounts are display/acquisition aids only, not stored separately)
4. Return { total, spent, remaining }
```

**Important:** The module stores only language IDs in actor flags — not the cost paid at time of acquisition. Spent points are always recalculated from current costs. If a GM changes a language's cost after acquisition, the displayed spent total updates accordingly. This is a deliberate tradeoff: simpler storage, predictable recalculation.

---

## Badge System (`scripts/badge/badge.mjs`)

### Injection Strategy

Both the PC (`character`) and adversary sheet headers use the same structure:

```html
<div class="name-row">
  <h1 class="actor-name ...">...</h1>
  <!-- badge injected here -->
</div>
```

Use `Hooks.on('renderActorSheet', ...)` to inject after every sheet render. This fires for all actor types.

```js
Hooks.on('renderActorSheet', (app, html, data) => {
  const actor = app.actor;
  if (!['character', 'adversary'].includes(actor.type)) return;
  injectLanguageBadge(app, html, actor);
});
```

### Badge Injection (identical for PC and adversary)

```js
const nameRow = html.querySelector('.name-row');
if (!nameRow) return;
const badge = buildBadgeElement(actor);
nameRow.querySelector('h1.actor-name').insertAdjacentElement('afterend', badge);
```

### Badge Element

```html
<span class="dh-lang-badge" data-actor-id="{actorId}">
  <i class="fas fa-language"></i>
</span>
```

- **Hover:** shows a tooltip listing acquired language names (comma-separated). If none: "No languages known".
- **Click:** opens `LanguageDialog` for this actor.
- Use Foundry's native `data-tooltip` attribute for the tooltip where possible.

---

## Language Dialog (`scripts/apps/language-dialog.mjs`)

### Class

```js
class LanguageDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) { ... }
```

### Behaviour by Actor Type

| Feature | PC (`character`) | Adversary (`adversary`) |
|---|---|---|
| Point pool display | ✅ Shown (spent / total) | ✅ Shown (informational only) |
| Cost displayed | ✅ Yes | ✅ Yes |
| Cost enforced | ✅ Yes | ❌ No — free acquisition |
| Requirement displayed | ✅ Greyed out if unmet, tooltip explains | ✅ Same display |
| Requirement enforced | ✅ Yes (unless waived by cousin) | ❌ No |
| Acquire button | Active if affordable + requirements met | Always active |
| Confirmation on acquire | ✅ Required | ✅ Required |
| Remove language | GM only | GM only |

### Layout

```
┌──────────────────────────────────────────────────┐
│  Languages — Bob the Fighter                     │
│  Points: 2 / 4                                   │
├──────────────────────────────────────────────────┤
│  ▼ Common Tongues                                │
│    Elvish          Cost: 1          [Acquire]    │
│    Old Latin       Cost: 1          [Acquire]    │
│    Cabal ░░░░      Cost: 2          [Acquire]  ← greyed, tooltip: unmet requirement │
│  ▼ Arcane                                        │
│    Runic           Cost: ~~2~~ → 1  [Acquire]  ← cousin discount active │
├──────────────────────────────────────────────────┤
│  Acquired Languages                              │
│    Italian    [×] ← GM only                      │
│    Old Latin  [×] ← GM only                      │
└──────────────────────────────────────────────────┘
```

### Cousin Discount Display

When a cousin discount is active, show both the original and discounted cost:

```
Runic    Cost: ~~2~~ → 1  (cousin discount)   [Acquire]
```

### Confirmation Dialog (on Acquire)

```js
const confirmed = await foundry.applications.api.DialogV2.confirm({
  window: { title: game.i18n.localize('DHLANG.Dialog.confirmAcquireTitle') },
  content: `<p>${game.i18n.format('DHLANG.Dialog.confirmAcquireContent', {
    name: language.name,
    cost: effectiveCost
  })}</p>`
});
if (!confirmed) return;
```

---

## GM Settings Config UI (`scripts/apps/settings-config.mjs`)

### Class

```js
class LanguageSettingsConfig extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) { ... }
```

### Features

- Set the global point pool formula (with a descriptive placeholder showing available variables)
- Add / remove / rename categories
- Set category default cost and default requirement
- Add / remove / rename languages within a category
- Override cost and requirement per language
- Manage cousin relationships per language:
  - Select a cousin language from a dropdown of all languages defined in the world config
  - Set discounted cost (formula or integer)
  - Toggle waive requirement
- Save writes the full config object back to `game.settings`

### Validation (before saving)

- Point pool formula: must evaluate to a positive integer
- Language costs: must evaluate to a non-negative integer
- Requirements: must evaluate to 0 or 1, or be null/empty
- Cousin discounted costs: must evaluate to a non-negative integer
- Show inline error messages if validation fails; do not save until resolved
- Test formulas against a minimal mock roll data object (zeroed traits, level 1)

---

## Hooks (`scripts/hooks.mjs`)

```js
// Badge injection on sheet render
Hooks.on('renderActorSheet', (app, html, data) => {
  const actor = app.actor;
  if (!['character', 'adversary'].includes(actor.type)) return;
  injectLanguageBadge(app, html, actor);
});

// Re-render open sheets when actor flags change (language acquired or removed)
Hooks.on('updateActor', (actor, changes, options, userId) => {
  if (!changes.flags?.['daggerheart-languages']) return;
  Object.values(ui.windows)
    .filter(w => w.actor?.id === actor.id)
    .forEach(w => w.render());
});
```

---

## Permissions

| Action | Player (owner) | Player (non-owner) | GM |
|---|---|---|---|
| View badge | ✅ | ✅ | ✅ |
| Hover tooltip | ✅ | ✅ | ✅ |
| Open dialog | ✅ | ❌ | ✅ |
| Acquire language (PC, affordable + requirements met) | ✅ | ❌ | ✅ |
| Acquire language (adversary) | ❌ | ❌ | ✅ |
| Remove language | ❌ | ❌ | ✅ |
| Edit world language config | ❌ | ❌ | ✅ |

Use `actor.isOwner` for ownership checks and `game.user.isGM` for GM-only UI elements.

---

## Localisation (`lang/en.json`)

All user-facing strings must use localisation keys via `game.i18n.localize()` or `game.i18n.format()`.

```json
{
  "DHLANG.Badge.noLanguages": "No languages known",
  "DHLANG.Dialog.title": "Languages — {name}",
  "DHLANG.Dialog.points": "Points: {spent} / {total}",
  "DHLANG.Dialog.acquire": "Acquire",
  "DHLANG.Dialog.acquired": "Acquired Languages",
  "DHLANG.Dialog.remove": "Remove",
  "DHLANG.Dialog.cost": "Cost",
  "DHLANG.Dialog.cousinDiscount": "Cousin discount applied",
  "DHLANG.Dialog.requirementUnmet": "Requirement not met: {requirement}",
  "DHLANG.Dialog.confirmAcquireTitle": "Acquire Language",
  "DHLANG.Dialog.confirmAcquireContent": "Acquire {name} for {cost} point(s)? This cannot be undone without GM intervention.",
  "DHLANG.Dialog.adversaryFreeNote": "Point costs are displayed but not enforced for adversaries.",
  "DHLANG.Settings.title": "Language Configuration",
  "DHLANG.Settings.pointFormula": "Point Pool Formula",
  "DHLANG.Settings.pointFormulaHint": "Evaluated against actor data. Must resolve to a positive integer. Available variables: @traits.agility.value, @traits.strength.value, @traits.finesse.value, @traits.instinct.value, @traits.presence.value, @traits.knowledge.value, @level, @proficiency",
  "DHLANG.Settings.addCategory": "Add Category",
  "DHLANG.Settings.addLanguage": "Add Language",
  "DHLANG.Settings.addCousin": "Add Cousin",
  "DHLANG.Settings.defaultCost": "Default Cost",
  "DHLANG.Settings.defaultRequirement": "Default Requirement (optional)",
  "DHLANG.Settings.costOverride": "Cost Override (optional)",
  "DHLANG.Settings.requirementOverride": "Requirement Override (optional)",
  "DHLANG.Settings.cousins": "Cousin Languages",
  "DHLANG.Settings.cousinLanguage": "Cousin Language",
  "DHLANG.Settings.cousinDiscountedCost": "Discounted Cost",
  "DHLANG.Settings.cousinWaiveRequirement": "Waive Requirement",
  "DHLANG.Settings.validationError": "Formula validation failed: {error}",
  "DHLANG.Settings.save": "Save",
  "DHLANG.Settings.cancel": "Cancel"
}
```

---

## Build Order

Implement in this order. Each step should be independently testable before moving to the next.

1. **`module.json`** — declare the module, `esmodules` entry point, styles, minimum Foundry and system versions
2. **`constants.mjs`** — all magic strings in one place (module ID, flag keys, setting keys, actor types)
3. **`settings.mjs`** — register settings and menu; verify it appears in the Foundry settings panel
4. **`formula.mjs`** — `evaluateFormula()` and `evaluateRequirement()`; test in browser console against a live actor
5. **`languages.mjs`** — all resolution helpers (effective cost, cousin logic, point pool); test in console
6. **`badge.mjs`** — inject static badge into both PC and adversary sheets; verify positioning in both
7. **`badge-tooltip.hbs`** + hover logic — wire up acquired language tooltip on the badge
8. **`language-dialog.mjs`** + **`language-dialog.hbs`** — build dialog; PC logic first, then adversary differences
9. **`settings-config.mjs`** + **`settings-config.hbs`** — GM config UI with validation
10. **`hooks.mjs`** — wire up the `updateActor` re-render hook
11. **`en.json`** — verify all strings are localised throughout every file
12. **`daggerheart-languages.css`** — final styling pass; match Daggerheart visual conventions

---

## Constraints & Conventions

- **Never modify system files.** No edits to anything under `systems/daggerheart/`. The `_references/` folder is read-only context.
- **No hardcoded user-facing strings** — everything goes through `game.i18n.localize()` or `game.i18n.format()`.
- **All new UIs use `ApplicationV2`** + `HandlebarsApplicationMixin`. Do not use legacy `Application` or `FormApplication`.
- **Formula evaluation is always async** — use `await evaluateFormula()` everywhere it is called.
- **Cousin discount resolution:** if multiple cousins apply, pick the one with the lowest `discountedCost` value (= highest discount). On a tie, use the first one found.
- **Spent points** are recalculated as the sum of current base costs of all acquired language IDs. Cousin discounts are not persisted — they are display and acquisition-time helpers only.
- **Adversary acquisition** ignores cost and requirements entirely. The dialog still displays both for informational purposes.
- **GM removal** requires no confirmation dialog — a single GM action removes the language immediately.
- Use `foundry.utils.randomID()` for all generated IDs (categories and languages).
- Use `foundry.utils.mergeObject()` for config updates.
- Check `actor.isOwner` for sheet interaction guards and `game.user.isGM` for GM-only UI elements.
