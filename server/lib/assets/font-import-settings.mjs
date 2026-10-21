/** braze.font v1 preserves the source face; layout owns size, weight and color. */
export function decodeFontImportSettings(importer) {
  if (importer?.id !== "braze.font" || importer.settingsVersion !== 1 || !importer.settings || typeof importer.settings !== "object"
    || Array.isArray(importer.settings) || Object.keys(importer.settings).length) throw new Error("Font importer requires braze.font, settingsVersion 1 and empty settings. Restore supported metadata to use this font.");
  return Object.freeze({});
}
