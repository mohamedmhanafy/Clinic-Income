import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClinicDto } from '@clinic/shared';
import { useClinics, useCreateClinic, useDeleteClinic, useUpdateClinic } from '../lib/queries';
import { ApiError } from '../lib/api';
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

/**
 * Clinic administration.
 *
 * Adding a clinic is data entry, not a deployment: the portal is designed so new clinics
 * appear everywhere - dashboards, comparisons, annual reports - the moment they are saved
 * here, with no code change.
 */
export default function SettingsClinics() {
  const { t } = useTranslation();
  const clinics = useClinics(true);
  const create = useCreateClinic();
  const update = useUpdateClinic();

  const [editing, setEditing] = useState<ClinicDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  const openCreate = () => {
    setName('');
    setStatus('ACTIVE');
    setEditing(null);
    setCreating(true);
    create.reset();
  };

  const openEdit = (clinic: ClinicDto) => {
    setName(clinic.name);
    setStatus(clinic.status);
    setCreating(false);
    setEditing(clinic);
    update.reset();
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input: { name: trimmed, status } });
      } else {
        await create.mutateAsync({ name: trimmed, status });
      }
      close();
    } catch {
      // Rendered inside the sheet from the mutation error below.
    }
  };

  const pending = create.isPending || update.isPending;
  const mutationError =
    create.error instanceof ApiError
      ? create.error.message
      : update.error instanceof ApiError
        ? update.error.message
        : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">{t('settings.clinicsTitle')}</h1>
        <Button onClick={openCreate}>{t('settings.addClinic')}</Button>
      </div>

      {clinics.isPending && <Spinner />}
      {clinics.isError && <ErrorNotice message={t('common.somethingWrong')} />}

      {clinics.data && (
        <ul className="flex flex-col gap-2">
          {clinics.data.map((clinic) => (
            <li key={clinic.id}>
              <Card>
                <button
                  type="button"
                  onClick={() => openEdit(clinic)}
                  className="tap flex w-full items-center gap-3 px-4 py-3.5 text-start"
                >
                  <span className="flex-1 font-semibold text-ink">{clinic.name}</span>
                  <Badge tone={clinic.status === 'ACTIVE' ? 'active' : 'inactive'}>
                    {clinic.status === 'ACTIVE' ? t('common.active') : t('common.inactive')}
                  </Badge>
                  <span className="text-sm font-semibold text-brand-700">{t('common.edit')}</span>
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={creating || editing !== null}
        onClose={close}
        title={editing ? t('settings.editClinic') : t('settings.addClinic')}
      >
        <div className="flex flex-col gap-4">
          <Field label={t('settings.clinicName')} htmlFor="clinic-name">
            <Input
              id="clinic-name"
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field label={t('common.status')} htmlFor="clinic-status">
            <Select
              id="clinic-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'INACTIVE')}
            >
              <option value="ACTIVE">{t('common.active')}</option>
              <option value="INACTIVE">{t('common.inactive')}</option>
            </Select>
          </Field>

          {mutationError && <ErrorNotice message={mutationError} />}

          <div className="flex gap-2">
            <Button variant="secondary" block onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button block disabled={pending || !name.trim()} onClick={() => void submit()}>
              {pending ? t('common.saving') : t('common.save')}
            </Button>
          </div>

          {editing && <DeleteClinicSection clinic={editing} onDeleted={close} />}
        </div>
      </Sheet>
    </div>
  );
}

/** Inline delete section rendered at the bottom of the edit sheet. */
function DeleteClinicSection({ clinic, onDeleted }: { clinic: ClinicDto; onDeleted: () => void }) {
  const { t } = useTranslation();
  const del = useDeleteClinic();
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    try {
      await del.mutateAsync(clinic.id);
      onDeleted();
    } catch {
      // Error shown below.
    }
  };

  return (
    <div className="border-t border-line pt-4">
      {!confirming ? (
        <Button variant="danger" block onClick={() => setConfirming(true)}>
          {t('settings.deleteClinic')}
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <Notice tone="warn">{t('settings.deleteClinicConfirm')}</Notice>
          {del.error instanceof ApiError && <ErrorNotice message={del.error.message} />}
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => { del.reset(); setConfirming(false); }}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              block
              disabled={del.isPending}
              onClick={() => void handleDelete()}
            >
              {del.isPending ? t('common.saving') : t('common.delete')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
