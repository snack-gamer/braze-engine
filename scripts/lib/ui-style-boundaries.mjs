const CSS_GRADIENT = /(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/gi;

const FUNCTIONAL_COLOR_BLOCKS = new Map([
  [
    "vendor/particles/packages/editor/src/theme.ts",
    [/\.pi-cpicker-hue\s*\{[\s\S]*?\}/g],
  ],
  [
    "vendor/particles/packages/editor/src/widgets.ts",
    [/const render = \(\): void => \{[\s\S]*?\n  \};/g],
  ],
]);

/** Decorative gradients are forbidden; color-authoring spectra remain functional data views. */
export function uiStyleFailures(relativeFilename, source) {
  let decorativeSource = source;
  for (const functionalBlock of FUNCTIONAL_COLOR_BLOCKS.get(relativeFilename) ?? []) {
    decorativeSource = decorativeSource.replace(functionalBlock, "");
  }
  return [...decorativeSource.matchAll(CSS_GRADIENT)].map(() => (
    `${relativeFilename}: decorative CSS gradient; use a flat theme surface or border`
  ));
}
