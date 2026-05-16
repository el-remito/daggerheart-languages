// Full implementation in Step 9 — stub so settings.mjs can import the class at registration time.
export class LanguageSettingsConfig extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id:      'dh-language-settings',
    classes: ['daggerheart', 'dh-settings-config'],
    window:  { title: 'DHLANG.Settings.title', resizable: true },
    position: { width: 640, height: 'auto' },
  };

  static PARTS = {
    main: { template: 'modules/daggerheart-languages/templates/settings-config.hbs' },
  };
}
