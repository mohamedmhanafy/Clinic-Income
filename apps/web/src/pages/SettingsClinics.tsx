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
import type { ClinicDto } from '@clinic/shared';
import { keys, useClinics, useCreateClinic, useDeleteClinic, useUpdateClinic } from '../lib/queries';
import { ApiError } from '../lib/api';
import {
  Badge,
  Button,
  Card,
  ErrorNotice,
  Field,
  Input,
  Notice,
  Sheet,
  Spinner,
} from '../components/ui';
import { DragHandleIcon } from '../components/icons';

/**
 * Clinic administration.
 *
 * Adding a clinic is data entry, not a deployment: the portal is designed so new clinics
 * appear everywhere - dashboards, comparisons, annual reports - the moment they are saved
 * here, with no code change.
 */
export default function SettingsClinics() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const clinics = useClinics(true);
  const create = useCreateClinic();
  const update = useUpdateClinic();
  const reorder = useUpdateClinic();

  const [editing, setEditing] = useState<ClinicDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });

  const [orderedClinics, setOrderedClinics] = useState<ClinicDto[]>([]);
  const [isReordering, setIsReordering] = useState(false);

  useEffect(() => {
    if (!isReordering && clinics.data) setOrderedClinics(clinics.data);
  }, [clinics.data, isReordering]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedClinics.findIndex((clinic) => clinic.id === active.id);
    const newIndex = orderedClinics.findIndex((clinic) => clinic.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const moved = arrayMove(orderedClinics, oldIndex, newIndex);
    const changed = moved
      .map((clinic, index) => ({ clinic, index }))
      .filter(({ clinic, index }) => clinic.sortOrder !== index);

    // sortOrder is stamped onto the local copy right away so the dropped position sticks
    // immediately, instead of waiting on the PATCH responses and the query invalidation
    // they each trigger - which land at unpredictable times and briefly snap the list back
    // to its pre-drop order before the fresh fetch arrives.
    const withNewOrder = moved.map((clinic, index) => ({ ...clinic, sortOrder: index }));
    setOrderedClinics(withNewOrder);
    setIsReordering(true);

    void Promise.all(
      changed.map(({ clinic, index }) => reorder.mutateAsync({ id: clinic.id, input: { sortOrder: index } })),
    ).finally(() => {
      queryClient.setQueryData(keys.clinics(true), withNewOrder);
      setIsReordering(false);
    });
  };

  const openCreate = () => {
    setForm({ name: '', status: 'ACTIVE' });
    setEditing(null);
    setCreating(true);
    create.reset();
  };

  const openEdit = (clinic: ClinicDto) => {
    setForm({ name: clinic.name, status: clinic.status });
    setCreating(false);
    setEditing(clinic);
    update.reset();
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
    setForm({ name: '', status: 'ACTIVE' });
  };

  const submit = async () => {
    const trimmed = form.name.trim();
    if (!trimmed) return;
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input: { name: trimmed, status: form.status } });
      } else {
        // New clinics are appended after the last one - reordering from then on is done by
        // dragging the cards below.
        const nextSortOrder =
          orderedClinics.length > 0 ? Math.max(...orderedClinics.map((clinic) => clinic.sortOrder)) + 1 : 0;
        await create.mutateAsync({ name: trimmed, status: form.status, sortOrder: nextSortOrder });
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedClinics.map((clinic) => clinic.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2">
              {orderedClinics.map((clinic) => (
                <SortableClinicRow key={clinic.id} clinic={clinic} onEdit={() => openEdit(clinic)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
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
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
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
                        : 'bg-red-600 text-white'
                      : 'bg-white text-muted',
                  ].join(' ')}
                >
                  {value === 'ACTIVE' ? t('common.active') : t('common.inactive')}
                </button>
              ))}
            </div>
          </Field>

          {mutationError && <ErrorNotice message={mutationError} />}

          <div className="flex gap-2">
            <Button variant="secondary" block onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button block disabled={pending || !form.name.trim()} onClick={() => void submit()}>
              {pending ? t('common.saving') : t('common.save')}
            </Button>
          </div>

          {editing && <DeleteClinicSection clinic={editing} onDeleted={close} />}
        </div>
      </Sheet>
    </div>
  );
}

/**
 * A clinic row draggable by its handle to reorder the list. The handle is a separate
 * button from the tap-to-edit content, since dnd-kit's drag listeners on a button that
 * also has an onClick would fight over the same pointer gesture.
 */
function SortableClinicRow({ clinic, onEdit }: { clinic: ClinicDto; onEdit: () => void }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: clinic.id,
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
          aria-label={t('common.dragToReorder')}
          className="tap flex w-11 shrink-0 touch-none cursor-grab items-center justify-center text-muted active:cursor-grabbing"
        >
          <DragHandleIcon />
        </button>
        <button type="button" onClick={onEdit} className="tap flex w-full items-center gap-3 py-3.5 ps-1 pe-4 text-start">
          <span className="flex-1 font-semibold text-ink">{clinic.name}</span>
          <Badge tone={clinic.status === 'ACTIVE' ? 'active' : 'inactive'}>
            {clinic.status === 'ACTIVE' ? t('common.active') : t('common.inactive')}
          </Badge>
          <span className="text-sm font-semibold text-brand-700">{t('common.edit')}</span>
        </button>
      </Card>
    </li>
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
