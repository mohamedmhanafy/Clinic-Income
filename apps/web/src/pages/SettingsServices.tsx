import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppState } from '../lib/app-state';
import type { ServiceDto } from '@clinic/shared';
import {
  keys,
  useClinics,
  useCreateService,
  useDeleteService,
  useServices,
  useUpdateService,
  useSchedulePriceChange,
} from '../lib/queries';
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
import { DragHandleIcon } from '../components/icons';
import { DatePicker } from '../components/DatePicker';

/**
 * The service code is a stable machine key, never shown to users - so instead of asking
 * for one, it's derived from the English name and de-duplicated against the codes already
 * in use for this clinic.
 */
function deriveServiceCode(nameEn: string, existingCodes: Set<string>): string {
  const base =
    nameEn
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'SERVICE';

  if (!existingCodes.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base.slice(0, 40 - String(suffix).length - 1)}_${suffix}`;
    if (!existingCodes.has(candidate)) return candidate;
  }
}

export default function SettingsServices() {
  const { t } = useTranslation();
  const { clinicId, setClinicId, language } = useAppState();
  
  const queryClient = useQueryClient();
  const clinics = useClinics();
  const services = useServices(clinicId, true);
  const create = useCreateService();
  const update = useUpdateService();
  const reorder = useUpdateService();
  const schedule = useSchedulePriceChange(clinicId);

  const [editing, setEditing] = useState<ServiceDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    nameEn: '',
    nameAr: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });

  const [initialFee, setInitialFee] = useState('');
  const [feesFrom, setFeesFrom] = useState(todayIso());
  const [priceError, setPriceError] = useState<string | null>(null);

  const [orderedServices, setOrderedServices] = useState<ServiceDto[]>([]);
  const [isReordering, setIsReordering] = useState(false);

  useEffect(() => {
    if (!isReordering && services.data) setOrderedServices(services.data);
  }, [services.data, isReordering]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedServices.findIndex((service) => service.id === active.id);
    const newIndex = orderedServices.findIndex((service) => service.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const moved = arrayMove(orderedServices, oldIndex, newIndex);
    const changed = moved
      .map((service, index) => ({ service, index }))
      .filter(({ service, index }) => service.sortOrder !== index);

    // sortOrder is stamped onto the local copy right away so the dropped position sticks
    // immediately, instead of waiting on the PATCH responses and the query invalidation
    // they each trigger - which land at unpredictable times and briefly snap the list back
    // to its pre-drop order before the fresh fetch arrives.
    const withNewOrder = moved.map((service, index) => ({ ...service, sortOrder: index }));
    setOrderedServices(withNewOrder);
    setIsReordering(true);

    void Promise.all(
      changed.map(({ service, index }) => reorder.mutateAsync({ id: service.id, input: { sortOrder: index } })),
    ).finally(() => {
      if (clinicId !== null) queryClient.setQueryData(keys.services(clinicId, true), withNewOrder);
      setIsReordering(false);
    });
  };

  const openCreate = () => {
    setForm({ nameEn: '', nameAr: '', status: 'ACTIVE' });
    setEditing(null);
    setCreating(true);
    setInitialFee('');
    setFeesFrom(todayIso());
    setPriceError(null);
    create.reset();
  };

  const openEdit = (service: ServiceDto) => {
    setForm({ nameEn: service.nameEn, nameAr: service.nameAr, status: service.status });
    setCreating(false);
    setEditing(service);
    update.reset();
  };

  const close = () => { setCreating(false); setEditing(null); };

  const submit = async () => {
    setPriceError(null);
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input: { nameEn: form.nameEn.trim(), nameAr: form.nameAr.trim(), status: form.status } });
        close();
      } else {
        if (!clinicId) return;
        // New services are appended after the last one - reordering from then on is done by
        // dragging the cards below, not by typing a number.
        const nextSortOrder =
          orderedServices.length > 0 ? Math.max(...orderedServices.map((service) => service.sortOrder)) + 1 : 0;
        const code = deriveServiceCode(form.nameEn, new Set(orderedServices.map((service) => service.code)));
        const created = await create.mutateAsync({ clinicId, code, nameEn: form.nameEn.trim(), nameAr: form.nameAr.trim(), status: form.status, sortOrder: nextSortOrder });
        
        if (initialFee.trim() !== '') {
          await schedule.mutateAsync({
            serviceId: created.id,
            fee: initialFee.trim(),
            effectiveFrom: feesFrom,
          });
        }
        
        close();
      }
    } catch (err) {
      if (err instanceof ApiError && create.isSuccess) {
        setPriceError(err.message);
      }
    }
  };

  const pending = create.isPending || update.isPending || schedule.isPending;
  const mutationError = create.error instanceof ApiError ? create.error.message : update.error instanceof ApiError ? update.error.message : null;
  const initialFeeValid = /^\d+(\.\d{1,2})?$/.test(initialFee.trim());
  const valid =
    clinicId !== null &&
    form.nameEn.trim() &&
    form.nameAr.trim() &&
    (editing !== null || initialFeeValid);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">{t('settings.servicesTitle')}</h1>
        <Button onClick={openCreate} disabled={!clinicId}>{t('settings.addService')}</Button>
      </div>

      {services.isPending && <Spinner />}

      {services.data && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={orderedServices.map((service) => service.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {orderedServices.map((service) => (
                <SortableServiceRow
                  key={service.id}
                  service={service}
                  language={language}
                  onEdit={() => openEdit(service)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <Sheet open={creating || editing !== null} onClose={close} title={editing ? t('common.edit') : t('settings.addService')}>
        <div className="flex flex-col gap-4">
          <Field label={t('settings.nameEn')} htmlFor="service-en">
            <Input id="service-en" value={form.nameEn} onChange={(event) => setForm((current) => ({ ...current, nameEn: event.target.value }))} />
          </Field>

          <Field label={t('settings.nameAr')} htmlFor="service-ar">
            <Input id="service-ar" dir="rtl" value={form.nameAr} onChange={(event) => setForm((current) => ({ ...current, nameAr: event.target.value }))} />
          </Field>

          <Field label={t('common.status')}>
            <div className="flex overflow-hidden rounded-xl border border-line">
              {(['ACTIVE', 'INACTIVE'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, status: value }))}
                  className={[
                    'tap flex-1 py-3 text-sm font-semibold transition-colors',
                    form.status === value
                      ? value === 'ACTIVE'
                        ? 'bg-brand-600 text-white'
                        : 'bg-[--color-danger] text-white'
                      : 'bg-white text-muted',
                  ].join(' ')}
                >
                  {value === 'ACTIVE' ? t('common.active') : t('common.inactive')}
                </button>
              ))}
            </div>
          </Field>

          {!editing && (
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-3">
              <p className="text-sm font-semibold text-ink">{t('settings.initialPrices')}</p>
              <p className="text-xs text-muted">{t('settings.initialPricesHint')}</p>
              <Field label={t('settings.effectiveFrom')} htmlFor="init-price-from">
                <DatePicker id="init-price-from" value={feesFrom} onChange={(value) => value && setFeesFrom(value)} />
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

/**
 * A service row draggable by its handle to reorder the list. The handle is a separate
 * button from the tap-to-edit content, since dnd-kit's drag listeners on a button that
 * also has an onClick would fight over the same pointer gesture.
 */
function SortableServiceRow({
  service,
  language,
  onEdit,
}: {
  service: ServiceDto;
  language: string;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: service.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <Card className="flex items-stretch overflow-hidden">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t('settings.reorderService')}
          className="tap flex w-11 shrink-0 touch-none cursor-grab items-center justify-center text-muted active:cursor-grabbing"
        >
          <DragHandleIcon />
        </button>
        <button type="button" onClick={onEdit} className="tap flex w-full items-center gap-3 py-3.5 ps-1 pe-4 text-start">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">
              {language === 'ar' ? service.nameAr : service.nameEn}
            </span>
          </span>
          <Badge tone={service.status === 'ACTIVE' ? 'active' : 'inactive'}>
            {service.status === 'ACTIVE' ? t('common.active') : t('common.inactive')}
          </Badge>
          <span className="text-sm font-semibold text-brand-700">{t('common.edit')}</span>
        </button>
      </Card>
    </li>
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
