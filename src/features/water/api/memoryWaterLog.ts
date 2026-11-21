import type { WaterEntry } from '../model';

export type MemoryWaterLog = {
  list(localDate: string): Promise<readonly WaterEntry[]>;
  insert(entry: WaterEntry): Promise<WaterEntry>;
  clear(): void;
};

// V1 keeps entries in module memory, so a reload drops them.
// TODO(debt): replace this store with the water table insert once that migration exists.
export function createMemoryWaterLog(): MemoryWaterLog {
  const entries: WaterEntry[] = [];

  return {
    async list(localDate) {
      return entries
        .filter((entry) => entry.localDate === localDate)
        .map((entry) => ({ ...entry }));
    },
    async insert(entry) {
      const existing = entries.find((item) => item.id === entry.id);
      if (existing) {
        return { ...existing };
      }
      const stored = { ...entry };
      entries.push(stored);
      return { ...stored };
    },
    clear() {
      entries.length = 0;
    },
  };
}

export const memoryWaterLog = createMemoryWaterLog();
