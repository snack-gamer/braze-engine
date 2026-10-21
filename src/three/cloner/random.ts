export function clonerRandomUnit(seed: number): number {
  let value = seed | 0;
  value = (value + 0x6d2b79f5) | 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function clonerRandomSigned(seed: number): number {
  return clonerRandomUnit(seed) * 2 - 1;
}
