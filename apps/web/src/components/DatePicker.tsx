import { forwardRef } from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useTranslation } from 'react-i18next';
import { useAppState } from '../lib/app-state';
import { ar, enUS } from 'date-fns/locale';

interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  minDate?: string;
  maxDate?: string;
  customInput?: React.ReactNode;
}

const CONTROL_CLASS =
  'tap w-full rounded-xl border border-line bg-white px-3.5 py-3 text-ink placeholder:text-muted/70 focus:border-brand-500 focus:outline-none';

const toDate = (iso: string | undefined): Date | null => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
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
          onChange={(date) => onChange(toIso(date))}
          dateFormat="dd/MM/yyyy"
          className={`${CONTROL_CLASS} ${className}`}
          locale={language === 'ar' ? ar : enUS}
          minDate={toDate(minDate) || undefined}
          maxDate={toDate(maxDate) || undefined}
          showPopperArrow={false}
          popperPlacement="bottom-start"
          wrapperClassName="w-full"
          customInput={customInput as any}
          calendarClassName="font-sans border border-line rounded-xl shadow-lg"
        />
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';
