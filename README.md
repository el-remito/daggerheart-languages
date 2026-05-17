# Daggerheart Languages

A [Foundry VTT](https://foundryvtt.com/) module for the [Daggerheart](https://darringtonpress.com/daggerheart/) system that adds a fully configurable language acquisition system to your world.

**Compatibility:** Foundry v14 · Daggerheart v2.2+

---

## Features

- **GM-configured language catalogue** — define language categories with default costs and optional requirements, then add individual languages with per-language overrides.
- **Point pool** — each PC has a point pool driven by a configurable formula (supports actor traits, `@level`, `@proficiency`, `@tier`, and keyword requirements such as `hasFeature:X` or `traitAtLeast:presence:2`).
- **Cousin discounts** — languages can grant a discount amount when a related language is already known, optionally waiving the requirement entirely.
- **Formula helper** — a built-in picker in the config UI lets GMs build requirement formulas without writing them by hand.
- **Badge** — a small icon is injected into every actor sheet header showing acquired languages on hover. It glows amber when the player can afford a new language and red if they have overspent.
- **Acquisition dialog** — players click the badge to open a dialog listing all available languages grouped by category, with live affordability and requirement checking, a real-time search bar, and per-category acquired/total counters.
- **Adversary support** — adversaries can be assigned languages freely (no cost or requirement enforcement).

---

## Installation

**Via manifest URL** (recommended):

1. In Foundry's module manager, click **Install Module**.
2. Paste the manifest URL and click Install:
   ```
   https://raw.githubusercontent.com/el-remito/daggerheart-languages/main/module.json
   ```

**Manual:**

Download the [latest release](https://github.com/el-remito/daggerheart-languages/releases) ZIP and unpack it into your `Data/modules/` folder.

---

## Usage

### GM setup

1. Open **Game Settings → Module Settings → Configure Languages**.
2. Add one or more **categories** (e.g. *Common*, *Ancient*, *Planar*). Each category has a default cost and an optional requirement formula.
3. Add **languages** inside each category. Leave cost/requirement blank to inherit from the category.
4. Optionally add **cousin relationships** to a language — when a player already knows the cousin language, the target language gets a discount (entered as an amount subtracted from the base cost, floored at 0).
5. Set the **Point Pool Formula** at the top. Default is `2`; you can use any roll formula referencing actor data (e.g. `@tier * 2`).
6. Click **Save**.

### Players

Click the **🗨** badge next to the actor name on any character sheet to open the language dialog. Languages you can afford and meet the requirements for show an **Acquire** button. Already-acquired languages are listed at the top of the dialog and on your sheet header tooltip.

### GMs removing languages

The GM can open any actor's language dialog and click the **Remove** button next to any acquired language.

---

## Requirement Formulas

The formula helper supports the following types out of the box:

| Type | Example formula | Meaning |
|---|---|---|
| Trait threshold | `traitAtLeast:knowledge:2` | Actor must have Knowledge ≥ 2 |
| Has feature | `hasFeature:Wildtouch` | Actor must have an item named "Wildtouch" |
| Has domain | `hasDomain:Splendor` | Actor must have the Splendor domain |
| Has spellcasting | `hasSpellcasting` | Actor must have a spellcasting trait |
| Roll expression | `@tier >= 2` | Any Foundry roll formula resolving to truthy |

---

## Changelog

### 1.1.0
- Acquired languages section moved above category list in the dialog
- Category descriptions visible when the category is collapsed
- Collapse state preserved when acquiring or removing languages
- Acquired / total counter `(X / Y)` per category in the dialog
- Language count `(N)` per category in the Settings config
- Real-time search bar in both the dialog and the Settings config
- Point formula ⓘ badge on the point bar (hover to see the formula)
- Smart badge glow — amber glow only fires when at least one unacquired language is affordable
- Cousin "Discounted Cost" field replaced by **Discount Amount** (amount subtracted from base cost) ⚠️ *Breaking: existing cousin entries need to be re-entered*
- Discount ⓘ badge on discounted languages showing which cousin applied the discount
- Acquired languages show their cost as strikethrough

### 1.0.0
- Initial release: language categories, point pool, cousin relationships, formula requirements, formula picker, badge, acquisition dialog
