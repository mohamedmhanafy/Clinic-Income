import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { DailyEntryViewDto } from '@clinic/shared';
import { useAppState } from '../lib/app-state';
import { useDailyEntry, useDeleteDaily, useSaveDaily } from '../lib/queries';
import { ApiError } from '../lib/api';
import {
  addDaysIso,
  formatCount,
  formatFullDate,
  formatMoney,
  formatRelative,
  todayIso,
} from '../lib/format';
import { Button, Card, ErrorNotice, Notice, Sheet, Spinner, Stepper } from '../components/ui';

/**
 * Daily income entry - the screen the app exists for.
 *
 * It is built so that the common case needs almost no input: the clinic is remembered from
 * last time, the date defaults to today, and the fees come from the price schedule. In
 * practice the user opens the app, taps two counts and saves.
 *
 * Fee and income are read-only. The figures shown while typing are a local preview for
 * immediate feedback; the values that get stored are recomputed on the server, and the
 * totals shown after saving come back from it.
 */

interface EntryRow {
  serviceId: number;
  nameEn: string;
  nameAr: string;
  sortOrder: number;
  /** Fee that would be applied to a new line on this date. */
  scheduleFee: string | null;
  /** Fee already frozen onto a saved line, which takes precedence. */
  savedFee: string | null;
  quantity: number;
  existsOnRecord: boolean;
}

function buildRows(view: DailyEntryViewDto): EntryRow[] {
  const savedByService = new Map(view.activity.lines.map((line) => [line.serviceId, line]));
  const rows = new Map<number, EntryRow>();

  for (const price of view.effectivePrices) {
    rows.set(price.serviceId, {
      serviceId: price.serviceId,
      nameEn: price.serviceNameEn,
      nameAr: price.serviceNameAr,
      sortOrder: price.sortOrder,
      scheduleFee: price.fee,
      savedFee: savedByService.get(price.serviceId)?.unitFee ?? null,
      quantity: savedByService.get(price.serviceId)?.quantity ?? 0,
      existsOnRecord: savedByService.has(price.serviceId),
    });
  }

  // A saved line whose service has since been deactivated still belongs to this record and
  // must remain visible and editable, so it is merged in even though the price schedule no
  // longer lists it.
  for (const line of view.activity.lines) {
    if (rows.has(line.serviceId)) continue;
    rows.set(line.serviceId, {
      serviceId: line.serviceId,
      nameEn: line.serviceNameEn,
      nameAr: line.serviceNameAr,
      sortOrder: line.sortOrder,
      scheduleFee: null,
      savedFee: line.unitFee,
      quantity: line.quantity,
      existsOnRecord: true,
    });
  }

  return [...rows.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.serviceId - b.serviceId);
}

/** The fee that will actually be applied when this row is saved. */
function appliedFee(row: EntryRow): string | null {
  return row.savedFee ?? row.scheduleFee;
}

export default function DailyEntry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clinicId, language } = useAppState();

  const [date, setDate] = useState(todayIso);
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const entry = useDailyEntry(clinicId, date);
  const save = useSaveDaily();
  const remove = useDeleteDaily();

  // Re-seed the form whenever the server view changes (clinic, date, or after a save).
  useEffect(() => {
    if (entry.data) setRows(buildRows(entry.data));
  }, [entry.data]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(timer);
  }, [flash]);

  const setQuantity = (serviceId: number, quantity: number) => {
    setRows((current) =>
      current.map((row) => (row.serviceId === serviceId ? { ...row, quantity } : row)),
    );
  };

  /**
   * Local preview only. Displayed while typing so the numbers respond immediately; the
   * stored figures are computed server-side from the same formula.
   */
  const previewTotal = useMemo(
    () =>
      rows.reduce((total, row) => {
        const fee = appliedFee(row);
        return fee === null ? total : total + row.quantity * Number(fee);
      }, 0),
    [rows],
  );

  const missingFee = rows.filter((row) => appliedFee(row) === null);
  const savable = rows.filter((row) => appliedFee(row) !== null);
  const exists = entry.data?.activity.exists ?? false;

  const submit = async (reapplyPriceSchedule = false) => {
    if (clinicId === null || savable.length === 0) return;
    setFlash(null);
    try {
      await save.mutateAsync({
        clinicId,
        date,
        lines: savable.map((row) => ({ serviceId: row.serviceId, quantity: row.quantity })),
        reapplyPriceSchedule,
      });
      setFlash(exists ? t('daily.updated') : t('daily.saved'));
    } catch {
      // Surfaced through save.error below.
    }
  };

  const stepDate = (delta: number) => setDate((current) => addDaysIso(current, delta));

  const saveError = save.error instanceof ApiError ? save.error.message : null;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink">{t('daily.title')}</h1>
        {exists && (
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t('common.actions')}
            className="tap flex items-center justify-center rounded-lg px-3 text-xl text-muted"
          >
            &#8942;
          </button>
        )}
      </header>

      {/* Date picker: arrows for the common nudge, native picker for a jump. */}
      <Card className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => stepDate(-1)}
          aria-label="previous day"
          className="tap flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-semibold text-ink"
        >
          <span aria-hidden="true" className="rtl:rotate-180">
            &#8249;
          </span>
        </button>

        <label className="flex min-w-0 flex-1 flex-col items-center">
          <span className="sr-only">{t('common.date')}</span>
          <span className="text-base font-semibold text-ink">{formatFullDate(date, language)}</span>
          <input
            type="date"
            value={date}
            onChange={(event) => event.target.value && setDate(event.target.value)}
            className="mt-0.5 bg-transparent text-center text-xs text-muted focus:outline-none"
          />
        </label>

        <button
          type="button"
          onClick={() => stepDate(1)}
          aria-label="next day"
          className="tap flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-semibold text-ink"
        >
          <span aria-hidden="true" className="rtl:rotate-180">
            &#8250;
          </span>
        </button>
      </Card>

      {date !== todayIso() && (
        <button
          type="button"
          onClick={() => setDate(todayIso())}
          className="tap self-start rounded-lg px-2 text-sm font-semibold text-brand-700"
        >
          {t('common.today')}
        </button>
      )}

      {entry.isPending && <Spinner />}
      {entry.isError && (
        <ErrorNotice
          message={entry.error instanceof ApiError ? entry.error.message : t('common.somethingWrong')}
          onRetry={() => void entry.refetch()}
        />
      )}

      {entry.data && (
        <>
          {exists && (
            <Notice tone="info">
              {t('daily.existingRecord')}
              {entry.data.activity.updatedAt && (
                <span className="block text-xs opacity-80">
                  {t('daily.lastUpdated', {
                    when: formatRelative(entry.data.activity.updatedAt, language),
                  })}
                </span>
              )}
            </Notice>
          )}

          {missingFee.length > 0 && (
            <Notice
              title={t('daily.noPriceTitle')}
              action={
                <Button variant="secondary" onClick={() => navigate('/settings/pricing')}>
                  {t('daily.goToPricing')}
                </Button>
              }
            >
              {t('daily.noPriceBody', {
                service: missingFee
                  .map((row) => (language === 'ar' ? row.nameAr : row.nameEn))
                  .join('، '),
                clinic: entry.data.activity.clinicName,
              })}
            </Notice>
          )}

          <div className="flex flex-col gap-3">
            {rows.map((row) => {
              const fee = appliedFee(row);
              const disabled = fee === null;
              const income = fee === null ? null : String(row.quantity * Number(fee));
              const inputId = `service-${row.serviceId}`;

              return (
                <Card key={row.serviceId} className="p-4">
                  <label htmlFor={inputId} className="mb-3 block">
                    <span className="text-base font-semibold text-ink">
                      {language === 'ar' ? row.nameAr : row.nameEn}
                    </span>
                    <span className="ms-2 text-sm text-muted">
                      {language === 'ar' ? row.nameEn : row.nameAr}
                    </span>
                  </label>

                  <Stepper
                    id={inputId}
                    value={row.quantity}
                    disabled={disabled}
                    onChange={(quantity) => setQuantity(row.serviceId, quantity)}
                  />

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 text-sm">
                    <span className="text-muted">
                      {t('common.fee')}{' '}
                      <span className="tabnum font-semibold text-ink">
                        {fee === null ? '—' : formatMoney(fee)}
                      </span>
                    </span>
                    <span className="text-muted">
                      {t('common.income')}{' '}
                      <span className="tabnum font-semibold text-ink">
                        {income === null ? '—' : formatMoney(income)}
                      </span>
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>

          {saveError && <ErrorNotice message={saveError} />}

          {/* Sticky action bar, offset to sit above the fixed bottom navigation. */}
          <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] z-20 -mx-4 mt-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-4 lg:mx-0 lg:rounded-2xl lg:border">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-muted">{t('daily.dailyTotal')}</span>
              <span className="tabnum text-2xl font-bold text-ink">
                {formatMoney(String(previewTotal))}
              </span>
            </div>

            <Button
              size="lg"
              block
              disabled={save.isPending || savable.length === 0}
              onClick={() => void submit(false)}
            >
              {save.isPending ? t('common.saving') : exists ? t('common.update') : t('common.save')}
            </Button>

            {flash && (
              <p
                role="status"
                className="mt-2 text-center text-sm font-semibold text-brand-700"
              >
                {flash}
              </p>
            )}
          </div>
        </>
      )}

      {/* Rare actions, kept off the main surface. */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t('common.actions')}>
        <div className="flex flex-col gap-3">
          <div>
            <Button
              variant="secondary"
              block
              onClick={() => {
                if (!confirm(t('daily.reapplyConfirm'))) return;
                setMenuOpen(false);
                void submit(true);
              }}
            >
              {t('daily.reapply')}
            </Button>
            <p className="mt-2 text-xs text-muted">{t('daily.reapplyHint')}</p>
          </div>

          <Button
            variant="danger"
            block
            onClick={async () => {
              const id = entry.data?.activity.id;
              if (id === null || id === undefined) return;
              if (!confirm(t('daily.deleteConfirm'))) return;
              await remove.mutateAsync(id);
              setMenuOpen(false);
              setFlash(null);
            }}
          >
            {t('daily.deleteRecord')}
          </Button>
        </div>
      </Sheet>

      <p className="sr-only" aria-live="polite">
        {formatCount(previewTotal)}
      </p>
    </div>
  );
}
