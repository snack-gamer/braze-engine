import { readFileSync } from 'node:fs';

const facade = readFileSync(new URL('../../src/three/tsl.ts', import.meta.url), 'utf8');
const declaration = facade.match(/export const \{([\s\S]+?)\} = TSL;/);
if (!declaration) throw new Error('Review the explicit Braze TSL facade before changing its export form.');
export const brazeTslNames = declaration[1].split(',').map((name) => name.trim()).filter(Boolean);
const alias = (name) => `__braze_tsl_${name}`;

/** Export existing bindings directly so unused frozen-namespace members can tree-shake.
 * No implementations, method registrations or shader bytes are changed. */
export function withBrazeTslExports(source) {
  const namespace = source.match(/var TSL = \/\*#__PURE__\*\/Object\.freeze\(\{([\s\S]+?)\n\}\);/);
  if (!namespace) throw new Error('Pinned Three TSL namespace changed; review the binding adapter.');
  const bindings = new Map([...namespace[1].matchAll(/^\s*(\w+): ([\w$]+),?$/gm)].map((match) => [match[1], match[2]]));
  const exports = brazeTslNames.map((name) => {
    if (!bindings.has(name)) throw new Error(`Pinned Three TSL binding ${name} changed; review the binding adapter.`);
    return `${bindings.get(name)} as ${alias(name)}`;
  });
  return `${source}\nexport { ${exports.join(', ')} };\n`;
}
export const brazeTslFacade = `export { ${brazeTslNames.map((name) => `${alias(name)} as ${name}`).join(', ')} } from 'three/webgpu';`;
