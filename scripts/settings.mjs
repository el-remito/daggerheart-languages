import { MODULE_ID, SETTINGS } from './constants.mjs';
import { LanguageSettingsConfig } from './apps/settings-config.mjs';

const DEFAULT_CONFIG = {
  pointFormula: '2',
  categories: [],
};

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.CONFIG, {
    name:    'Language Configuration',
    scope:   'world',
    config:  false,
    type:    Object,
    default: DEFAULT_CONFIG,
  });

  game.settings.registerMenu(MODULE_ID, SETTINGS.MENU, {
    name:       'DHLANG.Settings.menuName',
    label:      'DHLANG.Settings.menuLabel',
    hint:       'DHLANG.Settings.menuHint',
    icon:       'fas fa-language',
    type:       LanguageSettingsConfig,
    restricted: true,
  });
}
