// Full implementation in Step 8 — stub so badge.mjs lazy import resolves.
export class LanguageDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id:       'dh-language-dialog',
    classes:  ['daggerheart', 'dh-languages-dialog'],
    window:   { title: 'DHLANG.Dialog.title', resizable: true },
    position: { width: 500, height: 'auto' },
  };

  static PARTS = {
    main: { template: 'modules/daggerheart-languages/templates/language-dialog.hbs' },
  };

  static open(actor) {
    new LanguageDialog({ actor }).render(true);
  }
}
