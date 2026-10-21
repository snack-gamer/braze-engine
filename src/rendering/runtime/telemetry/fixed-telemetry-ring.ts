/** Fixed-capacity ring whose slots are allocated once at construction. */
export class FixedTelemetryRing<Slot> {
  readonly slots: readonly Slot[];
  private nextWriteIndex = 0;
  private count = 0;

  constructor(
    readonly capacity: number,
    createSlot: () => Slot,
  ) {
    this.slots = Array.from({ length: capacity }, createSlot);
  }

  get writeIndex(): number {
    return this.nextWriteIndex;
  }

  get retainedCount(): number {
    return this.count;
  }

  writeSlot(): Slot {
    return this.slots[this.nextWriteIndex];
  }

  commitWrite(): void {
    this.nextWriteIndex = (this.nextWriteIndex + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
  }

  /** Visitor values alias retained slots and must not be retained by the caller. */
  visit(visitor: (slot: Slot) => void): void {
    const start = this.count === this.capacity ? this.nextWriteIndex : 0;
    for (let offset = 0; offset < this.count; offset += 1) {
      visitor(this.slots[(start + offset) % this.capacity]);
    }
  }
}
