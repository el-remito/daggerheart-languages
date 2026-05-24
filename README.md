# Daggerheart Languages

A [Foundry VTT](https://foundryvtt.com/) module for the [Daggerheart](https://darringtonpress.com/daggerheart/) system that adds a fully configurable language acquisition system to your world.

**Compatibility:** Foundry v14 · Daggerheart v2.2+

---

## Features

- **GM-configured language catalogue** — define language categories with default costs and optional requirements, then add individual languages with per-language overrides.
- **Point pool** — each PC has a point pool driven by a configurable formula (supports actor traits, `@system.levelData.level.current`, `@prof`, `@tier`, and keyword requirements such as `hasFeature:X` or `traitAtLeast:presence:2`).
- **Unified discount model** — both cousin discounts and cost-rule discounts compete for the best deal; the single largest discount wins (no stacking). Cousins can also optionally waive the language's requirement entirely.
- **Formula helper** — a built-in picker in the config UI lets GMs build requirement formulas without writing them by hand.
- **Badge** — a small icon is injected into every actor sheet header showing acquired languages on hover. It glows amber when the player can afford a new language and red if they have overspent.
- **Acquisition dialog** — players click the badge to open a dialog listing all available languages grouped by category, with live affordability and requirement checking, a real-time search bar, and per-category acquired/total counters.
- **Adversary support** — adversaries can be assigned languages freely (no cost or requirement enforcement).
- **Party overview** — a language badge is injected into the Party actor sheet header. Hovering lists every language known by the party; clicking opens a read-only overview showing all configured languages alongside which party members speak each one. A **Show only known** toggle filters the list down to languages at least one member speaks. Accessible to all users, not just the GM.
- **Universal languages** — individual languages can be flagged as *Universal* (e.g. Common) in the settings config. Universal languages sort to the top of the party overview, character badge tooltips, and the acquired languages section in the acquisition dialog.

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
4. Optionally add **cost rules** to a language — each rule has a requirement and a **Discount Amount**. The first matching rule enters the discount pool.
5. Optionally add **cousin relationships** to a language — when a player already knows the cousin language, that discount also enters the pool. The single best discount wins (cost rules and cousin discounts do **not** stack). Cousins can also optionally waive the language requirement entirely.
6. Set the **Point Pool Formula** at the top. Default is `2`; you can use any roll formula referencing actor data (e.g. `@tier * 2`).
7. Click **Save**.

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
| Tier threshold | `tierAtLeast:2` | Actor must be Tier 2 or higher |
| Level threshold | `levelAtLeast:5` | Actor must be Level 5 or higher |
| Class check | `classIs:Warrior` | Actor must have a class item named "Warrior" |
| Community check | `communityIs:Wanderborne` | Actor must have a community item named "Wanderer" |
| Ancestry check | `ancestryIs:Elf` | Actor must have an ancestry item named "Elf" |
| Roll expression | `@tier >= 2` | Any Foundry roll formula resolving to truthy |

Requirements can be combined using `AND` and `OR` operators (standard precedence — AND binds tighter):

```
classIs:Warrior OR classIs:Ranger
tierAtLeast:2 AND hasFeature:Wildtouch
```

The formula picker's **Set / AND / OR** buttons let GMs build compound expressions interactively.

### Point pool formula — available roll data tokens

| Token | Meaning |
|---|---|
| `@traits.agility.value` | Agility trait value |
| `@traits.strength.value` | Strength trait value |
| `@traits.finesse.value` | Finesse trait value |
| `@traits.instinct.value` | Instinct trait value |
| `@traits.presence.value` | Presence trait value |
| `@traits.knowledge.value` | Knowledge trait value |
| `@tier` | Character tier |
| `@prof` | Proficiency value |
| `@system.levelData.level.current` | Character level |

Example: `2 + @traits.knowledge.value + @system.levelData.level.current`

---

## Changelog

### 1.2.3
- **New requirement keywords** — `communityIs:X` and `ancestryIs:X` check whether a character's community or ancestry item name contains the given string (case-insensitive substring, same logic as `classIs:`); both are available in the formula picker in Settings config

### 1.2.2
- **Adversary dialog — hide cost UI** — cost labels, ⓘ info badges, and the acquired ✓ checkmark are now hidden for adversary actors; adversaries don't operate under purchase rules so this information was irrelevant
- **Requirement matching — contains** — `hasFeature:` and `classIs:` conditions now use substring matching instead of exact name equality, so `hasFeature:Arcane` matches any feature whose name contains "Arcane"
- **Search bar fix** — typing in the language dialog search bar now correctly expands matching categories so their languages are visible; clearing the search restores original collapsed/expanded states

### 1.2.1
- **Party overview — sort fix** — non-universal languages in the party overview are now sorted alphabetically (previously sorted by acquisition cost, then alphabetically)

### 1.2.0
- **Party language overview** — language badge injected into Party actor sheet header; hovering lists languages known by the party; clicking opens a read-only overview dialog organised as a flat list (universal languages first, then remaining languages by acquisition cost ascending, then alphabetically)
- **Party overview — speaker chips** — each language row shows small chips for every party member who speaks it; languages nobody knows are dimmed
- **Party overview — Show only known toggle** — filter button in the overview dialog hides languages with no speakers for a quick reference view
- **Universal language flag** — GMs can mark any language as *Universal* in the Settings config (e.g. Common); universal languages sort to the top of the party overview, character badge tooltips, and the acquired languages section
- **Acquired languages sorting** — the acquired languages section in a character's dialog now lists universal languages first, then the rest alphabetically
- **Badge tooltip sorting** — character and party badge tooltips list universal languages first, then the rest alphabetically

### 1.1.2
- Point pool formula hint and `README` corrected: `@level` → `@system.levelData.level.current`, `@proficiency` → `@prof`
- Cost Rules redesigned: field renamed to **Discount Amount** — value is now subtracted from base cost (floor 0) instead of replacing it ⚠️ *Breaking: existing cost rule entries need to be re-entered*
- Unified discount model: cost rule discounts and cousin discounts now compete — the single best discount wins; they no longer stack
- Language dialog: all supplemental info consolidated into a **single ⓘ badge** per language row (active discount context, active cost rule, and cousin list)

### 1.1.1
- Language dialog: categories start collapsed on first open
- Language dialog: scrollbar contained inside the window (page no longer scrolls)
- Language dialog: **Related Languages** ⓘ badge listing cousin languages and their discounts
- Language dialog: **Share to chat** 📢 button posts acquired languages as a chat message
- Language dialog: disabled Acquire button now shows a tooltip — unmet requirement or insufficient points
- Settings config: categories and languages start collapsed on first open
- Settings config: **Cost Rules** per language — attach `{ requirement, cost }` rules; first matching rule overrides the base cost before cousin discounts apply
- Settings config: **Special Cost** ⓘ badge when a cost rule actively reduces a language's cost for the current actor
- New requirement keyword atoms: `tierAtLeast:N`, `levelAtLeast:N`, `classIs:ClassName`
- Compound requirement expressions: combine any atoms with `AND` / `OR` operators (standard precedence)
- Formula picker: **Set / AND / OR** buttons replace the single Apply button for building compound requirements interactively

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
