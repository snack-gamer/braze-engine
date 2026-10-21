import { animatorComponentSchema, animatorSchemaDefinitions, type AnimatorSchema } from './animator-authoring-schema';

/** Closed nested shapes reject typos before the legacy-tolerant document codec. */
export function assertAnimatorAuthoringShape(value: unknown): void {
  let nodes = 0;
  const active = new WeakSet<object>();
  const visit = (value: unknown, schema: AnimatorSchema, path: string, depth: number): void => {
    const fail = (reason: string): never => { throw new Error(`Animator ${path}: ${reason}.`); };
    if (++nodes > 100_000 || depth > 64) fail('document exceeds the authoring shape budget');
    if (schema.$ref) {
      const name = String(schema.$ref).split('/').slice(-1)[0];
      return visit(value, animatorSchemaDefinitions[name as keyof typeof animatorSchemaDefinitions], path, depth);
    }
    if (schema.anyOf) {
      for (const option of schema.anyOf as AnimatorSchema[]) {
        try { visit(value, option, path, depth); return; } catch { /* Try the other declared shape. */ }
      }
      return fail('does not match any supported shape');
    }
    if ('const' in schema && value !== schema.const || schema.enum && !(schema.enum as unknown[]).includes(value)) fail('unsupported value');
    if (value !== null && typeof value === 'object') {
      if (active.has(value)) fail('cyclic document');
      active.add(value);
      try {
        if (Array.isArray(value)) {
          if (schema.type && schema.type !== 'array' || value.length < Number(schema.minItems ?? 0) || value.length > Number(schema.maxItems ?? Infinity)) fail('invalid array length/type');
          value.forEach((item, index) => visit(item, schema.items as AnimatorSchema ?? {}, `${path}[${index}]`, depth + 1));
        } else {
          if (schema.type && schema.type !== 'object') fail('expected ' + schema.type);
          const raw = value as Record<string, unknown>, properties = schema.properties as Record<string, AnimatorSchema> | undefined;
          if (Object.keys(raw).length > Number(schema.maxProperties ?? Infinity)) fail('too many properties');
          for (const key of schema.required as string[] ?? []) if (!Object.prototype.hasOwnProperty.call(raw, key)) fail(`missing ${key}`);
          for (const [key, item] of Object.entries(raw)) {
            const child = properties?.[key] ?? schema.additionalProperties;
            if (child === false) fail(`unsupported field ${key}`);
            visit(item, typeof child === 'object' ? child as AnimatorSchema : {}, `${path}.${key}`, depth + 1);
          }
        }
      } finally { active.delete(value); }
    } else {
      if (schema.type && schema.type !== (value === null ? 'null' : typeof value) && !(schema.type === 'integer' && typeof value === 'number')) fail('expected ' + schema.type);
      if (typeof value === 'number' && (!Number.isFinite(value) || schema.type === 'integer' && !Number.isInteger(value)
        || value < Number(schema.minimum ?? -Infinity) || value > Number(schema.maximum ?? Infinity))) fail('invalid number');
      if (typeof value === 'string' && (value.length < Number(schema.minLength ?? 0) || value.length > Number(schema.maxLength ?? Infinity)
        || schema.pattern && !new RegExp(String(schema.pattern)).test(value))) fail('invalid string');
      if (value !== null && !['number', 'boolean', 'string'].includes(typeof value)) fail('expected JSON data');
    }
  };
  visit(value, animatorComponentSchema, 'component', 0);
}
