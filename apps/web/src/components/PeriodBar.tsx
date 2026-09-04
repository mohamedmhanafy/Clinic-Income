import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppState } from '../lib/app-state';
import { formatMonthYear, monthName } from '../lib/format';

/**
 * Month selector.
 *
 * Stepping one month at a time covers almost every real use, and two large arrows are far
 * easier on a phone than a pair of dropdowns. The dropdowns are still there for jumping to
 * a distant month, but they are secondary.
 */
export function PeriodBar({ showJump = true }: { showJump?: boolean }) {
  const { year, month, setPeriod, stepMonth, language } = useAppState();
  const { t } = useTranslation();
  const [jumpOpen, setJumpOpen] = useState(false);

  // A generous span rather than a narrow window around today - old records and future
  // planning both belong in the same dropdown.
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 60 }, (_, index) => currentYear + 5 - index);

  const arrow =
    'tap flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-xl font-semibold text-ink';

  return (
    <div className="no-print mb-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => stepMonth(-1)}
          className={arrow}
          aria-label="previous month"
        >
          <span aria-hidden="true">
            &#8249;
          </span>
        </button>

        {/*
         * The month name doubles as the control for jumping to a distant month. Keeping the
         * two dropdowns collapsed by default saves roughly 90px of vertical space on a
         * phone, which is the difference between the hero figure being above the fold or
         * below it.
         */}
        <button
          type="button"
          onClick={() => showJump && setJumpOpen((open) => !open)}
          aria-expanded={showJump ? jumpOpen : undefined}
          className="tap flex-1 rounded-xl text-center text-base font-semibold text-ink"
        >
          {formatMonthYear(year, month, language)}
          {showJump && (
            <span className="ms-1.5 text-xs text-muted" aria-hidden="true">
              {jumpOpen ? '▴' : '▾'}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => stepMonth(1)}
          className={arrow}
          aria-label="next month"
        >
          <span aria-hidden="true">
            &#8250;
          </span>
        </button>
      </div>

      {showJump && jumpOpen && (
        <div className="flex gap-2">
          <select
            aria-label={t('common.month')}
            value={month}
            onChange={(event) => setPeriod(year, Number(event.target.value))}
            className="tap flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {monthName(value, language)}
              </option>
            ))}
          </select>

          <select
            aria-label={t('common.year')}
            value={year}
            onChange={(event) => setPeriod(Number(event.target.value), month)}
            className="tap flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none"
          >
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
