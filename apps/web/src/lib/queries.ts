import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClinicCreateInput,
  ClinicUpdateInput,
  ServiceCreateInput,
  ServiceUpdateInput,
} from '@clinic/shared';
import { api, type DailySavePayload } from './api';

/**
 * Query keys are grouped so that a write can invalidate everything derived from the data
 * it changed. Saving one day must refresh the dashboard, the monthly view and the reports,
 * or the user sees a stale total right after saving - which in a financial tool reads as a
 * bug even when the stored data is correct.
 */
export const keys = {
  clinics: ['clinics'] as const,
  services: (clinicId: number) => ['services', clinicId] as const,
  prices: (clinicId: number) => ['prices', clinicId] as const,
  effectivePrices: (clinicId: number, date: string) => ['effective-prices', clinicId, date] as const,
  daily: (clinicId: number, date: string) => ['daily', clinicId, date] as const,
  dashboard: (clinicId: number, year: number, month: number) =>
    ['dashboard', clinicId, year, month] as const,
  monthly: (clinicId: number, year: number, month: number) =>
    ['monthly', clinicId, year, month] as const,
  comparison: (params: object) => ['comparison', params] as const,
  annual: (year: number) => ['annual', year] as const,
};

export function useClinics() {
  return useQuery({ queryKey: keys.clinics, queryFn: api.clinics.list, staleTime: 60_000 });
}

export function useServices(clinicId: number | null) {
  return useQuery({
    queryKey: keys.services(clinicId ?? 0),
    queryFn: () => api.services.list(clinicId as number),
    enabled: clinicId !== null,
    staleTime: 60_000,
  });
}

export function usePrices(clinicId: number | null) {
  return useQuery({
    queryKey: keys.prices(clinicId ?? 0),
    queryFn: () => api.prices.list(clinicId as number),
    enabled: clinicId !== null,
  });
}

export function useDailyEntry(clinicId: number | null, date: string) {
  return useQuery({
    queryKey: keys.daily(clinicId ?? 0, date),
    queryFn: () => api.daily.get(clinicId as number, date),
    enabled: clinicId !== null,
  });
}

export function useDashboard(clinicId: number | null, year: number, month: number) {
  return useQuery({
    queryKey: keys.dashboard(clinicId ?? 0, year, month),
    queryFn: () => api.reports.dashboard(clinicId as number, year, month),
    enabled: clinicId !== null,
  });
}

export function useMonthly(clinicId: number | null, year: number, month: number) {
  return useQuery({
    queryKey: keys.monthly(clinicId ?? 0, year, month),
    queryFn: () => api.reports.monthly(clinicId as number, year, month),
    enabled: clinicId !== null,
  });
}

export function useComparison(params: { year?: number; month?: number; from?: string; to?: string }) {
  return useQuery({
    queryKey: keys.comparison(params),
    queryFn: () => api.reports.comparison(params),
  });
}

export function useAnnual(year: number) {
  return useQuery({ queryKey: keys.annual(year), queryFn: () => api.reports.annual(year) });
}

/** Invalidates every view derived from recorded income. */
function useInvalidateIncome() {
  const client = useQueryClient();
  return () => {
    for (const key of ['daily', 'dashboard', 'monthly', 'comparison', 'annual']) {
      void client.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useSaveDaily() {
  const invalidate = useInvalidateIncome();
  return useMutation({
    mutationFn: (payload: DailySavePayload) => api.daily.save(payload),
    onSuccess: invalidate,
  });
}

export function useDeleteDaily() {
  const invalidate = useInvalidateIncome();
  return useMutation({
    mutationFn: (id: number) => api.daily.remove(id),
    onSuccess: invalidate,
  });
}

export function useCreateClinic() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ClinicCreateInput) => api.clinics.create(input),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.clinics }),
  });
}

export function useUpdateClinic() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ClinicUpdateInput }) =>
      api.clinics.update(id, input),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.clinics }),
  });
}

export function useCreateService() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ServiceCreateInput) => api.services.create(input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useUpdateService() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ServiceUpdateInput }) =>
      api.services.update(id, input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useDeleteClinic() {
  const client = useQueryClient();
  const invalidate = useInvalidateIncome();
  return useMutation({
    mutationFn: (id: number) => api.clinics.remove(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.clinics });
      // Cascade deletes all activities, so income views must be refreshed.
      invalidate();
    },
  });
}

export function useDeleteService() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.services.remove(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useSchedulePriceChange(clinicId: number | null) {
  const client = useQueryClient();
  const invalidate = useInvalidateIncome();
  return useMutation({
    mutationFn: (input: { serviceId: number; fee: string; effectiveFrom: string }) =>
      api.prices.scheduleChange(clinicId as number, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['prices'] });
      void client.invalidateQueries({ queryKey: ['effective-prices'] });
      // Fee changes never alter recorded income, but they do change what a NEW entry will
      // be priced at, so the entry screen's cached fees must be refreshed.
      invalidate();
    },
  });
}

export function useDeletePrice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (priceId: number) => api.prices.remove(priceId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['prices'] });
      void client.invalidateQueries({ queryKey: ['effective-prices'] });
    },
  });
}
