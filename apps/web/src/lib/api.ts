import type {
  AnnualReportDto,
  ClinicCreateInput,
  ClinicDto,
  ClinicUpdateInput,
  ComparisonReportDto,
  DailyEntryViewDto,
  DashboardSummaryDto,
  EffectivePriceDto,
  MonthlyReportDto,
  PriceDto,
  ServiceCreateInput,
  ServiceDto,
  ServiceUpdateInput,
} from '@clinic/shared';

/**
 * Empty by default, so every request is same-origin and goes through the dev server's
 * `/api` proxy. That is what lets the app be opened from a phone on the same network with
 * no configuration - an absolute `localhost` URL would point at the phone itself.
 *
 * Set VITE_API_BASE_URL only when the API is genuinely on another origin.
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

/** An error carrying the API's own message, which is written to be shown to the user. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Is the API running?');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const body = payload as { error?: { code?: string; message?: string; details?: unknown } };
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'ERROR',
      body?.error?.message ?? 'The request failed.',
      body?.error?.details,
    );
  }

  return payload as T;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

export interface DailySavePayload {
  clinicId: number;
  date: string;
  lines: Array<{ serviceId: number; quantity: number }>;
  note?: string | null;
  reapplyPriceSchedule?: boolean;
}

export const api = {
  clinics: {
    list: () => request<ClinicDto[]>('/api/clinics'),
    create: (input: ClinicCreateInput) =>
      request<ClinicDto>('/api/clinics', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: ClinicUpdateInput) =>
      request<ClinicDto>(`/api/clinics/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: number) => request<void>(`/api/clinics/${id}`, { method: 'DELETE' }),
  },

  services: {
    list: (clinicId: number) => request<ServiceDto[]>(`/api/services?${query({ clinicId })}`),
    create: (input: ServiceCreateInput) =>
      request<ServiceDto>('/api/services', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: ServiceUpdateInput) =>
      request<ServiceDto>(`/api/services/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: number) => request<void>(`/api/services/${id}`, { method: 'DELETE' }),
  },

  prices: {
    list: (clinicId: number) => request<PriceDto[]>(`/api/clinics/${clinicId}/prices`),
    effective: (clinicId: number, date: string) =>
      request<EffectivePriceDto[]>(`/api/prices/effective?${query({ clinicId, date })}`),
    scheduleChange: (
      clinicId: number,
      input: { serviceId: number; fee: string; effectiveFrom: string },
    ) =>
      request<PriceDto>(`/api/clinics/${clinicId}/prices/schedule-change`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    remove: (priceId: number) => request<void>(`/api/prices/${priceId}`, { method: 'DELETE' }),
  },

  daily: {
    get: (clinicId: number, date: string) =>
      request<DailyEntryViewDto>(`/api/daily?${query({ clinicId, date })}`),
    save: (payload: DailySavePayload) =>
      request<DailyEntryViewDto>('/api/daily', { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request<void>(`/api/daily/${id}`, { method: 'DELETE' }),
  },

  reports: {
    dashboard: (clinicId: number, year: number, month: number) =>
      request<DashboardSummaryDto>(`/api/dashboard/summary?${query({ clinicId, year, month })}`),
    monthly: (clinicId: number, year: number, month: number) =>
      request<MonthlyReportDto>(`/api/reports/monthly?${query({ clinicId, year, month })}`),
    comparison: (params: { year?: number; month?: number; from?: string; to?: string }) =>
      request<ComparisonReportDto>(`/api/reports/comparison?${query(params)}`),
    annual: (year: number) => request<AnnualReportDto>(`/api/reports/annual?${query({ year })}`),
  },

  /** Absolute URL for a report export, used as the href of a download link. */
  exportUrl(
    report: 'daily' | 'monthly' | 'comparison' | 'annual',
    format: 'csv' | 'xlsx',
    params: Record<string, string | number | undefined>,
  ): string {
    return `${BASE_URL}/api/reports/${report}?${query({ ...params, format })}`;
  },
};
