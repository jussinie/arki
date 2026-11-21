import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WaterEntry } from '../model';
import { memoryWaterLog } from './memoryWaterLog';

const waterEntriesKey = (localDate: string) =>
  ['water-entries', localDate] as const;

export function clearMemoryWaterLog(): void {
  memoryWaterLog.clear();
}

export function useWaterDay(localDate: string) {
  return useQuery({
    queryKey: waterEntriesKey(localDate),
    queryFn: () => memoryWaterLog.list(localDate),
  });
}

export function useAddWater() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entry: WaterEntry) => {
      await memoryWaterLog.insert(entry);
      return memoryWaterLog.list(entry.localDate);
    },
    onSuccess: (entries, entry) => {
      queryClient.setQueryData(waterEntriesKey(entry.localDate), entries);
    },
  });
}
