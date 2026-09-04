import { useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppState } from '../lib/app-state';
import { useClinics } from '../lib/queries';
import { EmptyState, Sheet, Spinner } from './ui';
import {
  CalendarIcon,
  DashboardIcon,
  MoreIcon,
  PlusIcon,
  ReportsIcon,
  SettingsIcon,
} from './icons';

/**
 * Application shell.
 *
 * Phones get a fixed bottom bar - the reachable part of the screen - with the daily-entry
 * action raised in the middle, because recording a day is what the app is opened for.
 * From `lg` upwards the same destinations become a persistent side rail. The routes are
 * identical either way; only the chrome changes.
 */

function ClinicPicker() {
  const { clinicId, setClinicId } = useAppState();
  const { data: clinics } = useClinics();
  const { t } = useTranslation();

  if (!clinics || clinics.length === 0) return null;

  return (
    <label className="flex min-w-0 items-center gap-1.5">
      <span className="sr-only">{t('common.clinic')}</span>
      <select
        value={clinicId ?? ''}
        onChange={(event) => setClinicId(Number(event.target.value))}
        className="tap max-w-[45vw] truncate rounded-lg border-0 bg-transparent py-1 ps-1 pe-6 text-base font-semibold text-ink focus:outline-none sm:max-w-none"
      >
        {clinics.map((clinic) => (
          <option key={clinic.id} value={clinic.id}>
            {clinic.name}
            {clinic.status === 'INACTIVE' ? ` (${t('common.inactive')})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function LanguageToggle() {
  const { language, setLanguage } = useAppState();
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t('nav.language')}
      className="flex shrink-0 overflow-hidden rounded-lg border border-line"
    >
      {(['en', 'ar'] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLanguage(code)}
          aria-pressed={language === code}
          className={[
            'tap px-3 text-sm font-semibold transition-colors',
            language === code ? 'bg-brand-600 text-white' : 'bg-white text-muted',
          ].join(' ')}
        >
          {code === 'en' ? 'EN' : 'ع'}
        </button>
      ))}
    </div>
  );
}

function TopBar() {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <ClinicPicker />
        <LanguageToggle />
      </div>
    </header>
  );
}

const NAV_LINK_BASE =
  'flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors';

function BottomNav({ onMore }: { onMore: () => void }) {
  const { t } = useTranslation();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [NAV_LINK_BASE, 'tap flex-1 py-1', isActive ? 'text-brand-700' : 'text-muted'].join(' ');

  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface lg:hidden">
      <div className="mx-auto flex h-[4.25rem] max-w-lg items-stretch justify-between px-2">
        <NavLink to="/" end className={linkClass}>
          <DashboardIcon />
          <span>{t('nav.dashboard')}</span>
        </NavLink>

        {/* Raised primary action: the daily-entry screen. */}
        <NavLink
          to="/daily"
          className="flex flex-1 flex-col items-center justify-start"
          aria-label={t('nav.add')}
        >
          {({ isActive }) => (
            <>
              <span
                className={[
                  'tap -mt-5 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg ring-4 ring-surface transition-colors',
                  isActive ? 'bg-brand-700' : 'bg-brand-600',
                ].join(' ')}
              >
                <PlusIcon />
              </span>
              <span
                className={[
                  'mt-1 text-[11px] font-medium',
                  isActive ? 'text-brand-700' : 'text-muted',
                ].join(' ')}
              >
                {t('nav.add')}
              </span>
            </>
          )}
        </NavLink>

        <NavLink to="/reports" className={linkClass}>
          <ReportsIcon />
          <span>{t('nav.reports')}</span>
        </NavLink>

        <button type="button" onClick={onMore} className={`${NAV_LINK_BASE} tap flex-1 py-1 text-muted`}>
          <MoreIcon />
          <span>{t('nav.more')}</span>
        </button>
      </div>
      <div className="pb-safe" />
    </nav>
  );
}

interface RailLink {
  to: string;
  labelKey: string;
  Icon: ComponentType<{ className?: string }>;
  end?: boolean;
}

const RAIL_LINKS: RailLink[] = [
  { to: '/', end: true, labelKey: 'nav.dashboard', Icon: DashboardIcon },
  { to: '/daily', labelKey: 'nav.dailyIncome', Icon: PlusIcon },
  { to: '/monthly', labelKey: 'nav.monthlyIncome', Icon: CalendarIcon },
  { to: '/reports', labelKey: 'nav.reports', Icon: ReportsIcon },
];

const SETTINGS_LINKS = [
  { to: '/settings/clinics', labelKey: 'nav.clinics' },
  { to: '/settings/services', labelKey: 'nav.services' },
  { to: '/settings/pricing', labelKey: 'nav.pricing' },
] as const;

function SideRail() {
  const { t } = useTranslation();

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'tap flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
      isActive ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-canvas hover:text-ink',
    ].join(' ');

  return (
    <aside className="no-print fixed inset-y-0 start-0 hidden w-60 flex-col border-e border-line bg-surface p-4 lg:flex">
      <div className="mb-6 px-3 py-2">
        <p className="text-base font-bold text-ink">{t('appName')}</p>
      </div>

      <nav className="flex flex-col gap-1">
        {RAIL_LINKS.map(({ to, end, labelKey, Icon }) => (
          <NavLink key={to} to={to} end={end} className={linkClass}>
            <Icon className="h-5 w-5" />
            <span>{t(labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-6">
        <p className="flex items-center gap-2 px-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
          <SettingsIcon className="h-4 w-4" />
          {t('nav.settings')}
        </p>
        <nav className="flex flex-col gap-1">
          {SETTINGS_LINKS.map(({ to, labelKey }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <span className="ps-8">{t(labelKey)}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}

/** The low-frequency destinations, kept off the four-item bottom bar. */
function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const item =
    'tap flex w-full items-center justify-between rounded-xl border border-line px-4 py-3 text-start text-base font-medium text-ink';

  return (
    <Sheet open={open} onClose={onClose} title={t('nav.more')}>
      <div className="flex flex-col gap-2">
        <button type="button" className={item} onClick={() => go('/monthly')}>
          <span className="flex items-center gap-3">
            <CalendarIcon />
            {t('nav.monthlyIncome')}
          </span>
        </button>

        <p className="mt-3 px-1 text-xs font-semibold tracking-wide text-muted uppercase">
          {t('nav.settings')}
        </p>
        {SETTINGS_LINKS.map(({ to, labelKey }) => (
          <button key={to} type="button" className={item} onClick={() => go(to)}>
            {t(labelKey)}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/**
 * Every screen except Settings > Clinics assumes at least one clinic exists (it's what
 * `clinicId` gets set to, and every query keys off it). On a brand new install there are
 * none yet, so those screens would otherwise sit on a query that's permanently disabled -
 * gate here, once, instead of teaching every page about the empty case.
 */
function ClinicGate() {
  const { t } = useTranslation();
  const location = useLocation();
  const { data: clinics, isPending } = useClinics();

  if (isPending) return <Spinner />;

  if (clinics && clinics.length === 0 && location.pathname !== '/settings/clinics') {
    return (
      <EmptyState
        title={t('dashboard.noClinicsTitle')}
        hint={t('dashboard.noClinicsHint')}
        action={
          <Link
            to="/settings/clinics"
            className="tap mt-1 inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white"
          >
            {t('dashboard.addClinic')}
          </Link>
        }
      />
    );
  }

  return <Outlet />;
}

export function AppShell() {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <SideRail />
      <div className="lg:ms-60">
        <TopBar />
        {/* Bottom padding clears the fixed nav bar so the last row is never trapped under it. */}
        <main className="mx-auto max-w-5xl px-4 pt-4 pb-28 lg:pb-10">
          <ClinicGate />
        </main>
      </div>
      <BottomNav onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}
