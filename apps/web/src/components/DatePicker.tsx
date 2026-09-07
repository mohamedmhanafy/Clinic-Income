import { forwardRef, useState } from 'react';
import ReactDatePicker, { type ReactDatePickerCustomHeaderProps } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format, type Locale } from 'date-fns';
import { useAppState } from '../lib/app-state';
import { ar, enUS } from 'date-fns/locale';
import { ChevronIcon } from './icons';

interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  minDate?: string;
  maxDate?: string;
  customInput?: React.ReactNode;
}

// The end-gutter chevron marks this as a picker, not a free-text field - the same cue a
// <select> gives for "this opens something."
// h-11 matches the arrow buttons and PDF button's fixed height, so this field lines up with
// whatever control sits beside it instead of being taller from its own padding.
const CONTROL_CLASS =
  'tap h-11 w-full cursor-pointer rounded-xl border border-line bg-white px-3.5 pe-9 text-ink ' +
  'shadow-sm transition-colors placeholder:text-muted/70 hover:border-brand-300 focus:border-brand-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-100';

interface TriggerProps {
  value?: string;
  className?: string;
  onClick?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  id?: string;
  disabled?: boolean;
  tabIndex?: number;
}

/**
 * The default trigger when a caller doesn't supply its own `customInput`. A <button>
 * rather than an <input> - clicking it can only open the calendar, never a text cursor,
 * so there is no way to type an invalid date.
 */
const DefaultTrigger = forwardRef<HTMLButtonElement, TriggerProps>(
  ({ value, className, ...handlers }, ref) => (
    <button type="button" ref={ref} className={`text-start ${className ?? ''}`} {...handlers}>
      {value}
    </button>
  )
);
DefaultTrigger.displayName = 'DatePickerDefaultTrigger';

/** Which grid the popup is currently showing - drilling up from day to month to year. */
type Mode = 'day' | 'month' | 'year';

const ARROW_CLASS =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-muted ' +
  'hover:bg-brand-50 hover:text-ink disabled:pointer-events-none disabled:opacity-30';

/**
 * Replaces react-datepicker's default header. In day mode the month and year are each
 * their own button - clicking one drills up to a month grid or year grid instead of
 * stepping the day calendar one month at a time. Picking a month or year drills back
 * down (handled by the onChange in the parent), so the hierarchy is: day -> month ->
 * year, and back down again once a choice is made.
 */
function CalendarHeader({
  mode,
  monthDate,
  locale,
  visibleYearsRange,
  decreaseMonth,
  increaseMonth,
  decreaseYear,
  increaseYear,
  prevMonthButtonDisabled,
  nextMonthButtonDisabled,
  prevYearButtonDisabled,
  nextYearButtonDisabled,
  onPickMonth,
  onPickYear,
}: {
  mode: Mode;
  monthDate: Date;
  locale: Locale;
  visibleYearsRange?: { startYear: number; endYear: number };
  decreaseMonth: () => void;
  increaseMonth: () => void;
  decreaseYear: () => void;
  increaseYear: () => void;
  prevMonthButtonDisabled: boolean;
  nextMonthButtonDisabled: boolean;
  prevYearButtonDisabled: boolean;
  nextYearButtonDisabled: boolean;
  onPickMonth: () => void;
  onPickYear: () => void;
}) {
  const onPrev = mode === 'day' ? decreaseMonth : decreaseYear;
  const onNext = mode === 'day' ? increaseMonth : increaseYear;
  const prevDisabled = mode === 'day' ? prevMonthButtonDisabled : prevYearButtonDisabled;
  const nextDisabled = mode === 'day' ? nextMonthButtonDisabled : nextYearButtonDisabled;

  let label: React.ReactNode;
  if (mode === 'day') {
    label = (
      <span className="flex items-center gap-1">
        <button type="button" onClick={onPickMonth} className="rounded px-1 hover:bg-brand-50">
          {format(monthDate, 'MMMM', { locale })}
        </button>
        <button type="button" onClick={onPickYear} className="rounded px-1 hover:bg-brand-50">
          {format(monthDate, 'yyyy', { locale })}
        </button>
      </span>
    );
  } else if (mode === 'month') {
    label = (
      <button type="button" onClick={onPickYear} className="rounded px-1 hover:bg-brand-50">
        {format(monthDate, 'yyyy', { locale })}
      </button>
    );
  } else {
    label = visibleYearsRange
      ? `${visibleYearsRange.startYear} - ${visibleYearsRange.endYear}`
      : format(monthDate, 'yyyy', { locale });
  }

  return (
    <div className="flex items-center justify-between px-1.5 py-1">
      <button type="button" onClick={onPrev} disabled={prevDisabled} aria-label="previous" className={ARROW_CLASS}>
        <ChevronIcon className="h-3.5 w-3.5 rotate-180" />
      </button>
      <span className="text-sm font-semibold text-ink">{label}</span>
      <button type="button" onClick={onNext} disabled={nextDisabled} aria-label="next" className={ARROW_CLASS}>
        <ChevronIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const toDate = (iso: string | undefined): Date | null => {
  if (!iso) return null;
  const parts = iso.split('-').map(Number);
  if (parts.length < 3) return null;
  const [y, m, d] = parts as [number, number, number];
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(y, m - 1, d);
};

const toIso = (date: Date | null): string => {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const DatePicker = forwardRef<any, DatePickerProps>(
  ({ id, value, onChange, className = '', minDate, maxDate, customInput }, ref) => {
    const { language } = useAppState();
    const locale = language === 'ar' ? ar : enUS;
    const [mode, setMode] = useState<Mode>('day');

    return (
      <div className="relative w-full">
        <ReactDatePicker
          id={id}
          selected={toDate(value)}
          onChange={(date: Date | null) => {
            if (!date) return;
            // Picking a year or month drills down a level instead of committing a value -
            // only a day click (mode "day") is a real selection.
            if (mode === 'year') {
              setMode('month');
              return;
            }
            if (mode === 'month') {
              setMode('day');
              return;
            }
            onChange(toIso(date));
          }}
          onCalendarOpen={() => setMode('day')}
          shouldCloseOnSelect={mode === 'day'}
          showMonthYearPicker={mode === 'month'}
          showYearPicker={mode === 'year'}
          renderCustomHeader={(headerProps: ReactDatePickerCustomHeaderProps) => (
            <CalendarHeader
              mode={mode}
              monthDate={headerProps.monthDate}
              locale={locale}
              visibleYearsRange={headerProps.visibleYearsRange}
              decreaseMonth={headerProps.decreaseMonth}
              increaseMonth={headerProps.increaseMonth}
              decreaseYear={headerProps.decreaseYear}
              increaseYear={headerProps.increaseYear}
              prevMonthButtonDisabled={headerProps.prevMonthButtonDisabled}
              nextMonthButtonDisabled={headerProps.nextMonthButtonDisabled}
              prevYearButtonDisabled={headerProps.prevYearButtonDisabled}
              nextYearButtonDisabled={headerProps.nextYearButtonDisabled}
              onPickMonth={() => setMode('month')}
              onPickYear={() => setMode('year')}
            />
          )}
          dateFormat="d MMM yyyy"
          className={`${CONTROL_CLASS} ${className}`}
          locale={locale}
          minDate={toDate(minDate) || undefined}
          maxDate={toDate(maxDate) || undefined}
          showPopperArrow={false}
          popperPlacement="bottom-start"
          // Rendered into a body-level portal so the calendar isn't clipped by the Sheet's
          // overflow-y-auto container, which otherwise cuts off the month header and week rows.
          portalId="datepicker-portal"
          wrapperClassName="w-full"
          customInput={(customInput as any) ?? <DefaultTrigger />}
          calendarClassName="font-sans border border-line rounded-xl shadow-lg"
        />
        {!customInput && (
          <ChevronIcon className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-muted" />
        )}
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';
