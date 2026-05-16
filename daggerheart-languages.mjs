import { registerSettings } from './scripts/settings.mjs';

Hooks.once('init', () => {
  registerSettings();
});
