import type { WaterEntry } from '../model';

export type MemoryWaterLog = {
  list(localDate: string): Promise<readonly WaterEntry[]>;
  insert(entry: WaterEntry): Promise<WaterEntry>;
  clear(): void;
};

// V1 keeps entries in module memory, so a reload drops them.
// TODO(debt): replace this store with the water table insert once that migration exists.
export function createMemoryWaterLog(): MemoryWaterLog {
  return {
    async list() {
      return [];
    },
    async insert(entry) {
      return entry;
    },
    clear() {},
  };
}

export const memoryWaterLog = createMemoryWaterLog();
