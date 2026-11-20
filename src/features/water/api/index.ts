import { useMutation, useQuery } from '@tanstack/react-query';
import type { WaterEntry } from '../model';
import { memoryWaterLog } from './memoryWaterLog';

export function clearMemoryWaterLog(): void {
  memoryWaterLog.clear();
}

export function useWaterDay(localDate: string) {
  return useQuery({
    queryKey: ['water-entries', localDate],
    queryFn: async () => [] as WaterEntry[],
  });
}

export function useAddWater() {
  return useMutation({
    mutationFn: async (entry: WaterEntry) => entry,
  });
}
