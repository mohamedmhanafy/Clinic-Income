import { forwardRef } from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useTranslation } from 'react-i18next';
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

    return (
      <div className="relative w-full">
        <ReactDatePicker
          id={id}
          selected={toDate(value)}
          onChange={(date: Date | null) => onChange(toIso(date))}
          dateFormat="d MMM yyyy"
          className={`${CONTROL_CLASS} ${className}`}
          locale={language === 'ar' ? ar : enUS}
          minDate={toDate(minDate) || undefined}
          maxDate={toDate(maxDate) || undefined}
          showPopperArrow={false}
          popperPlacement="bottom-start"
          // Rendered into a body-level portal so the calendar isn't clipped by the Sheet's
          // overflow-y-auto container, which otherwise cuts off the month header and week rows.
          portalId="datepicker-portal"
          // Dropdowns next to the prev/next arrows let a far-off month or year be reached in
          // one selection instead of dozens of clicks through the arrows.
          showMonthDropdown
          showYearDropdown
          dropdownMode="select"
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
