const CSS_GRADIENT = /(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/gi;

const FUNCTIONAL_COLOR_BLOCKS = new Map([
  [
    "vendor/particles/packages/editor/src/theme.css",
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
  const failures = [...decorativeSource.matchAll(CSS_GRADIENT)].map(() => (
    `${relativeFilename}: decorative CSS gradient; use a flat theme surface or border`
  ));
  if (relativeFilename.endsWith(".css") && relativeFilename !== "theme.css") {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
    if (/--(?:icon-size-[\w-]+|icon-stroke-[\w-]+|glyph-wash[\w-]*):/.test(css)) {
      failures.push(`${relativeFilename}: icon tokens belong in theme.css`);
    }
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
      if (/\.editor-icon\b/.test(selector)
        && /(?:^|;)\s*(?:width|height|inline-size|block-size|stroke-width|--editor-icon-(?:size|stroke)):\s*[\d.]/.test(body)) {
        failures.push(`${relativeFilename}: literal icon metric; use an icon role from theme.css`);
      }
    }
  }
  if (/\.tsx?$/.test(relativeFilename)
    && /from\s*["']lucide(?:-react)?["']/.test(source)
    && !["ui/icons.ts", "ui/editor-icon-element.ts"].includes(relativeFilename)) {
    failures.push(`${relativeFilename}: import icons through the shared editor registry`);
  }
  return failures;
}
