import type { Status } from './primitives.js';

/**
 * Response shapes returned by the API.
 *
 * `Money` is a decimal string (e.g. "4000.00"), never a number - see primitives.ts.
 * `IsoDate` is a `YYYY-MM-DD` calendar date with no time or timezone component.
 */
export type Money = string;
export type IsoDate = string;

export interface ClinicDto {
  id: number;
  name: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceDto {
  id: number;
  clinicId: number;
  code: string;
  nameEn: string;
  nameAr: string;
  status: Status;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PriceDto {
  id: number;
  clinicId: number;
  serviceId: number;
  serviceCode: string;
  serviceNameEn: string;
  serviceNameAr: string;
  fee: Money;
  effectiveFrom: IsoDate;
  effectiveTo: IsoDate | null;
  createdAt: string;
  updatedAt: string;
}

/** The fee applicable to one service on one date, resolved from the price schedule. */
export interface EffectivePriceDto {
  serviceId: number;
  serviceCode: string;
  serviceNameEn: string;
  serviceNameAr: string;
  sortOrder: number;
  /** null when no price period covers the requested date. */
  fee: Money | null;
  priceId: number | null;
  effectiveFrom: IsoDate | null;
  effectiveTo: IsoDate | null;
}

export interface DailyLineDto {
  serviceId: number;
  serviceCode: string;
  serviceNameEn: string;
  serviceNameAr: string;
  sortOrder: number;
  quantity: number;
  /** The fee frozen onto this line when it was saved. */
  unitFee: Money;
  lineTotal: Money;
}

/**
 * One clinic-day.
 *
 * `lines` is the canonical, service-agnostic representation - adding a new service adds a
 * line and requires no change here. The `examination*` / `consultation*` fields alongside
 * it are a read-only convenience projection of the two seeded services, provided because
 * the specification names them explicitly. Nothing writes through them.
 */
export interface DailyActivityDto {
  id: number | null;
  clinicId: number;
  clinicName: string;
  date: IsoDate;
  note: string | null;
  lines: DailyLineDto[];
  totalDailyIncome: Money;
  exists: boolean;

  examinationCount: number;
  examinationFeeApplied: Money | null;
  examinationIncome: Money;
  consultationCount: number;
  consultationFeeApplied: Money | null;
  consultationIncome: Money;

  createdAt: string | null;
  updatedAt: string | null;
}

export interface DashboardSummaryDto {
  clinicId: number;
  clinicName: string;
  year: number;
  month: number;
  totalIncome: Money;
  examinationIncome: Money;
  consultationIncome: Money;
  examinationCount: number;
  consultationCount: number;
  workingDays: number;
  /** Income per service, so the UI stays correct when more services are added. */
  byService: Array<{
    serviceId: number;
    serviceCode: string;
    serviceNameEn: string;
    serviceNameAr: string;
    quantity: number;
    income: Money;
  }>;
}

export interface MonthlyReportRowDto {
  date: IsoDate;
  dayOfMonth: number;
  examinationCount: number;
  examinationIncome: Money;
  consultationCount: number;
  consultationIncome: Money;
  totalDailyIncome: Money;
  lines: DailyLineDto[];
}

export interface MonthlyReportDto {
  clinicId: number;
  clinicName: string;
  year: number;
  month: number;
  rows: MonthlyReportRowDto[];
  totals: {
    examinationCount: number;
    examinationIncome: Money;
    consultationCount: number;
    consultationIncome: Money;
    totalIncome: Money;
    workingDays: number;
  };
}



export interface AnnualReportDto {
  year: number;
  clinics: Array<{ clinicId: number; clinicName: string }>;
  rows: Array<{
    month: number;
    /** Income per clinic, keyed by clinic id as a string. */
    byClinic: Record<string, Money>;
    total: Money;
  }>;
  totals: {
    byClinic: Record<string, Money>;
    total: Money;
  };
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Everything the daily-entry screen needs in one round trip: the saved record (or a blank
 * one) plus the fee schedule applicable on that date, so the form can pre-fill fees and
 * warn when a service has no price configured for the day.
 */
export interface DailyEntryViewDto {
  activity: DailyActivityDto;
  effectivePrices: EffectivePriceDto[];
}
