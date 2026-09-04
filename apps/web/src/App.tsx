import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';
import { useAppState } from './lib/app-state';
import { useClinics } from './lib/queries';

/*
 * Routes are code-split so the first screen a phone loads is small. Recharts in
 * particular is a large dependency and is only pulled in when a chart-bearing route is
 * actually visited, keeping the daily-entry screen fast on a mobile connection.
 */
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DailyEntry = lazy(() => import('./pages/DailyEntry'));
const Reports = lazy(() => import('./pages/Reports'));
const SettingsClinics = lazy(() => import('./pages/SettingsClinics'));
const SettingsServices = lazy(() => import('./pages/SettingsServices'));
const SettingsPricing = lazy(() => import('./pages/SettingsPricing'));

/**
 * Picks a sensible clinic on first run, and recovers when a remembered clinic has since
 * been deleted - otherwise every screen would sit empty with no obvious cause.
 */
function useClinicBootstrap() {
  const { clinicId, setClinicId } = useAppState();
  const { data: clinics } = useClinics();

  useEffect(() => {
    if (!clinics || clinics.length === 0) return;
    const stillExists = clinics.some((clinic) => clinic.id === clinicId);
    if (stillExists) return;
    const preferred = clinics.find((clinic) => clinic.status === 'ACTIVE') ?? clinics[0];
    if (preferred) setClinicId(preferred.id);
  }, [clinics, clinicId, setClinicId]);
}

export default function App() {
  useClinicBootstrap();

  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/daily" element={<DailyEntry />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings/clinics" element={<SettingsClinics />} />
          <Route path="/settings/services" element={<SettingsServices />} />
          <Route path="/settings/pricing" element={<SettingsPricing />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
