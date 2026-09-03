import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../lib/app-state';
import type { ServiceDto } from '@clinic/shared';
import { useClinics, useCreateService, useDeleteService, useServices, useUpdateService, useSchedulePriceChange } from '../lib/queries';
import { ApiError } from '../lib/api';
import { todayIso } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  ErrorNotice,
  Field,
  Input,
  Notice,
  Select,
  Sheet,
  Spinner,
} from '../components/ui';

export default function SettingsServices() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clinicId, setClinicId } = useAppState();
  
  const clinics = useClinics();
  const services = useServices(clinicId);
  const create = useCreateService();
  const update = useUpdateService();
  const schedule = useSchedulePriceChange(clinicId);

  const [editing, setEditing] = useState<ServiceDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    code: '',
    nameEn: '',
    nameAr: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
    sortOrder: 0,
  });

  const [initialFee, setInitialFee] = useState('');
  const [feesFrom, setFeesFrom] = useState(todayIso());
  const [priceError, setPriceError] = useState<string | null>(null);

  const openCreate = () => {
    setForm({ code: '', nameEn: '', nameAr: '', status: 'ACTIVE', sortOrder: 0 });
    setEditing(null);
    setCreating(true);
    setInitialFee('');
    setFeesFrom(todayIso());
    setPriceError(null);
    create.reset();
  };

  const openEdit = (service: ServiceDto) => {
    setForm({ code: service.code, nameEn: service.nameEn, nameAr: service.nameAr, status: service.status, sortOrder: service.sortOrder });
    setCreating(false);
    setEditing(service);
    update.reset();
  };

  const close = () => { setCreating(false); setEditing(null); };

  const submit = async () => {
    setPriceError(null);
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input: { nameEn: form.nameEn.trim(), nameAr: form.nameAr.trim(), status: form.status, sortOrder: form.sortOrder } });
        close();
      } else {
        if (!clinicId) return;
        const created = await create.mutateAsync({ clinicId, code: form.code.trim().toUpperCase(), nameEn: form.nameEn.trim(), nameAr: form.nameAr.trim(), status: form.status, sortOrder: form.sortOrder });
        
        if (initialFee.trim() !== '') {
          await schedule.mutateAsync({
            serviceId: created.id,
            fee: initialFee.trim(),
            effectiveFrom: feesFrom,
          });
        }
        
        close();
        void navigate('/settings/pricing');
      }
    } catch (err) {
      if (err instanceof ApiError && create.isSuccess) {
        setPriceError(err.message);
      }
    }
  };

  const pending = create.isPending || update.isPending || schedule.isPending;
  const mutationError = create.error instanceof ApiError ? create.error.message : update.error instanceof ApiError ? update.error.message : null;
  const valid = clinicId !== null && form.nameEn.trim() && form.nameAr.trim() && (editing !== null || form.code.trim());

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">{t('settings.servicesTitle')}</h1>
        <Button onClick={openCreate} disabled={!clinicId}>{t('settings.addService')}</Button>
      </div>

      <Notice tone="info">{t('settings.sampleData')}</Notice>
      {services.isPending && <Spinner />}

      {services.data && (
        <ul className="flex flex-col gap-2">
          {services.data.map((service) => (
            <li key={service.id}>
              <Card>
                <button type="button" onClick={() => openEdit(service)} className="tap flex w-full items-center gap-3 px-4 py-3.5 text-start">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{service.nameEn}</span>
                    <span className="block text-sm text-muted">{service.nameAr}</span>
                    <span className="mt-0.5 block font-mono text-xs text-muted">{service.code}</span>
                  </span>
                  <Badge tone={service.status === 'ACTIVE' ? 'active' : 'inactive'}>
                    {service.status === 'ACTIVE' ? t('common.active') : t('common.inactive')}
                  </Badge>
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={creating || editing !== null} onClose={close} title={editing ? t('common.edit') : t('settings.addService')}>
        <div className="flex flex-col gap-4">
          {!editing && (
            <Field label={t('settings.serviceCode')} hint={t('settings.serviceCodeHint')} htmlFor="service-code">
              <Input id="service-code" value={form.code} autoFocus placeholder="FOLLOW_UP"
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))} />
            </Field>
          )}

          <Field label={t('settings.nameEn')} htmlFor="service-en">
            <Input id="service-en" value={form.nameEn} onChange={(event) => setForm((current) => ({ ...current, nameEn: event.target.value }))} />
          </Field>

          <Field label={t('settings.nameAr')} htmlFor="service-ar">
            <Input id="service-ar" dir="rtl" value={form.nameAr} onChange={(event) => setForm((current) => ({ ...current, nameAr: event.target.value }))} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('settings.sortOrder')} htmlFor="service-order">
              <Input id="service-order" type="number" inputMode="numeric" min={0} value={String(form.sortOrder)}
                onChange={(event) => setForm((current) => ({ ...current, sortOrder: Number(event.target.value.replace(/[^\d]/g, '') || 0) }))} />
            </Field>
            <Field label={t('common.status')} htmlFor="service-status">
              <Select id="service-status" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as 'ACTIVE' | 'INACTIVE' }))}>
                <option value="ACTIVE">{t('common.active')}</option>
                <option value="INACTIVE">{t('common.inactive')}</option>
              </Select>
            </Field>
          </div>

          {!editing && (
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-3">
              <p className="text-sm font-semibold text-ink">{t('settings.initialPrices')}</p>
              <p className="text-xs text-muted">{t('settings.initialPricesHint')}</p>
              <Field label={t('settings.effectiveFrom')} htmlFor="init-price-from">
                <Input id="init-price-from" type="date" value={feesFrom} onChange={(event) => event.target.value && setFeesFrom(event.target.value)} />
              </Field>
              <Field label={t('settings.newFee')} htmlFor="init-fee">
                <Input id="init-fee" type="text" inputMode="decimal" placeholder="—" value={initialFee}
                  onChange={(event) => setInitialFee(event.target.value.replace(/[^\d.]/g, ''))} />
              </Field>
              {priceError && <ErrorNotice message={priceError} />}
            </div>
          )}

          {mutationError && <ErrorNotice message={mutationError} />}

          <div className="flex gap-2">
            <Button variant="secondary" block onClick={close}>{t('common.cancel')}</Button>
            <Button block disabled={pending || !valid} onClick={() => void submit()}>
              {pending ? t('common.saving') : t('common.save')}
            </Button>
          </div>

          {editing && <DeleteServiceSection service={editing} onDeleted={close} />}
        </div>
      </Sheet>
    </div>
  );
}

function DeleteServiceSection({ service, onDeleted }: { service: ServiceDto; onDeleted: () => void }) {
  const { t } = useTranslation();
  const del = useDeleteService();
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    try { await del.mutateAsync(service.id); onDeleted(); } catch { /* shown below */ }
  };

  return (
    <div className="border-t border-line pt-4">
      {!confirming ? (
        <Button variant="danger" block onClick={() => setConfirming(true)}>{t('settings.deleteService')}</Button>
      ) : (
        <div className="flex flex-col gap-3">
          <Notice tone="warn">{t('settings.deleteServiceConfirm')}</Notice>
          {del.error instanceof ApiError && <ErrorNotice message={del.error.message} />}
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => { del.reset(); setConfirming(false); }}>{t('common.cancel')}</Button>
            <Button variant="danger" block disabled={del.isPending} onClick={() => void handleDelete()}>
              {del.isPending ? t('common.saving') : t('common.delete')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
