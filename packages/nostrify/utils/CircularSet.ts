/**
 * Like a Circular Buffer, but the values are deduplicated.
 * Shares the properties of both a Circular Buffer and a Set.
 */
export class CircularSet<T> {
  private set: Set<T>;
  private capacity: number;

  constructor(capacity: number) {
    this.set = new Set();
    this.capacity = capacity;
  }

  add(item: T): void {
    if (this.set.has(item)) {
      return;
    }

    if (this.set.size >= this.capacity) {
      const oldest = this.set.values().next().value;
      if (oldest) {
        this.set.delete(oldest);
      }
    }

    this.set.add(item);
  }

  has(item: T): boolean {
    return this.set.has(item);
  }

  [Symbol.iterator](): Iterator<T> {
    return this.set.values();
  }
}
