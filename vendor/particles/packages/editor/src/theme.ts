/// <reference path="./style.d.ts" />
import './theme.css';

/**
 * Blender 4.x-inspired theme.
 *
 * Design system:
 *  - Inspector body is a darker base. Each module is a "card" with a slightly
 *    lighter background so panels read as distinct objects, separated by a
 *    1px dark line.
 *  - Inputs are darker than cards — they sit recessed into the panel.
 *  - One accent color (blue) for selection and active state.
 *  - 11px Inter/system font, 22-24px row heights, 3px corner radius.
 */

export const THEME_ID = 'particles-blender-theme';

/** Compatibility entry point. The module loader owns the bundled stylesheet. */
export function injectTheme(): void {}
