import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Shared UI primitives.
 *
 * Sizing is set for a phone first: nothing interactive is smaller than 44px, primary
 * actions are 52px, and text inputs stay at 16px so iOS Safari does not zoom the viewport
 * when they take focus.
 */

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
  size?: 'md' | 'lg';
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-700 disabled:bg-brand-600/40',
  secondary:
    'bg-white text-ink border border-line hover:bg-canvas active:bg-canvas disabled:text-muted',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50 active:bg-brand-100',
  danger: 'bg-white text-[--color-danger] border border-[--color-danger]/30 hover:bg-[--color-danger-bg]',
};

export function Button({
  variant = 'primary',
  block,
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={[
        'tap inline-flex items-center justify-center gap-2 rounded-xl font-semibold',
        'transition-colors disabled:cursor-not-allowed',
        size === 'lg' ? 'min-h-[52px] px-5 text-base' : 'px-4 text-sm',
        block ? 'w-full' : '',
        BUTTON_VARIANTS[variant],
        className,
      ].join(' ')}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'li';
}) {
  return <Tag className={`card ${className}`}>{children}</Tag>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{children}</h2>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                               */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs font-medium text-[--color-danger]">{error}</p>}
    </div>
  );
}

const CONTROL_CLASS =
  'tap w-full rounded-xl border border-line bg-white px-3.5 py-3 text-ink placeholder:text-muted/70 focus:border-brand-500 focus:outline-none';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL_CLASS} ${className}`} />;
}

export function Select({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${CONTROL_CLASS} appearance-none pe-9 ${className}`}>
      {children}
    </select>
  );
}

/**
 * Count input.
 *
 * The steppers exist so the common case - nudging a number up or down - needs no keyboard
 * at all. Direct entry stays available for larger numbers, with `inputMode="numeric"` so
 * the phone offers a number pad instead of a full keyboard.
 */
export function Stepper({
  value,
  onChange,
  id,
  disabled,
  max = 100000,
}: {
  value: number;
  onChange: (value: number) => void;
  id?: string;
  disabled?: boolean;
  max?: number;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(0, next));

  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        aria-label="decrease"
        disabled={disabled || value <= 0}
        onClick={() => onChange(clamp(value - 1))}
        className="tap flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-2xl font-semibold text-ink disabled:text-muted/40"
      >
        &minus;
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        min={0}
        max={max}
        disabled={disabled}
        value={String(value)}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^\d]/g, '');
          onChange(digits === '' ? 0 : clamp(Number(digits)));
        }}
        className="tabnum h-14 min-w-0 flex-1 rounded-xl border border-line bg-white text-center text-2xl font-semibold text-ink focus:border-brand-500 focus:outline-none disabled:text-muted"
      />
      <button
        type="button"
        aria-label="increase"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="tap flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-2xl font-semibold text-ink disabled:text-muted/40"
      >
        +
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                    */
/* -------------------------------------------------------------------------- */

export function Spinner({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-brand-600" />
      <span className="text-sm">{label ?? t('common.loading')}</span>
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-[--color-danger]/25 bg-[--color-danger-bg] p-4">
      <p className="text-sm font-medium text-[--color-danger]">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function Notice({
  tone = 'warn',
  title,
  children,
  action,
}: {
  tone?: 'warn' | 'info';
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const toneClass =
    tone === 'warn'
      ? 'border-[--color-warn]/25 bg-[--color-warn-bg] text-[--color-warn]'
      : 'border-brand-500/25 bg-brand-50 text-brand-700';
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      {title && <p className="text-sm font-semibold">{title}</p>}
      <div className="mt-1 text-sm">{children}</div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'active' | 'inactive'; children: ReactNode }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tone === 'active' ? 'bg-brand-50 text-brand-700' : 'bg-canvas text-muted',
      ].join(' ')}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Bottom sheet                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Slides up from the bottom on a phone, where the thumb is, and becomes a centred dialog
 * from the tablet breakpoint upwards.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Stops the page behind the sheet from scrolling under the thumb.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="tap -me-2 flex items-center justify-center rounded-lg px-3 text-muted"
          >
            &#10005;
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4 pb-safe">{children}</div>
      </div>
    </div>
  );
}
