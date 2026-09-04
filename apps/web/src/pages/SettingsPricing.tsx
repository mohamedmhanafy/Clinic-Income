import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppState } from '../lib/app-state';
import {
  useClinics,
  usePrices,
  useSchedulePriceChange,
  useServices,
} from '../lib/queries';
import { ApiError } from '../lib/api';
import { formatFullDate, todayIso } from '../lib/format';
import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  Field,
  Input,
  Money,
  Notice,
  SectionTitle,
  Select,
  Sheet,
  Spinner,
} from '../components/ui';
import { DatePicker } from '../components/DatePicker';

/**
 * Fee management.
 *
 * A fee is not a single value but a period. Changing one does not overwrite the old figure;
 * it closes the running period and opens a new one, which is what keeps recorded income
 * from ever being re-priced. The history below makes that timeline visible, so it is clear
 * which fee any given date resolves to.
 */
export default function SettingsPricing() {
  const { t } = useTranslation();
  const { clinicId, setClinicId, language } = useAppState();

  const clinics = useClinics();
  const services = useServices(clinicId);
  const prices = usePrices(clinicId);
  const schedule = useSchedulePriceChange(clinicId);

  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState<number | ''>('');
  const [fee, setFee] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso);

  const activeServices = services.data?.filter((service) => service.status === 'ACTIVE') ?? [];

  /** The period covering today for each service - what a new entry would be priced at. */
  const currentFees = useMemo(() => {
    const today = todayIso();
    return activeServices.map((service) => {
      const current = prices.data?.find(
        (price) =>
          price.serviceId === service.id &&
          price.effectiveFrom <= today &&
          (price.effectiveTo === null || price.effectiveTo >= today),
      );
      return { service, price: current ?? null };
    });
  }, [activeServices, prices.data]);

  /** The fee a new entry would be priced at today, so editing a schedule starts from the
      current figure instead of a blank field the user has to look up and retype. */
  const feeForService = (id: number | ''): string => {
    if (id === '') return '';
    return currentFees.find((row) => row.service.id === id)?.price?.fee ?? '';
  };

  const openSheet = (preselect?: number) => {
    const id = preselect ?? activeServices[0]?.id ?? '';
    setServiceId(id);
    setFee(feeForService(id));
    setEffectiveFrom(todayIso());
    schedule.reset();
    setOpen(true);
  };

  const submit = async () => {
    if (serviceId === '' || !fee.trim()) return;
    try {
      await schedule.mutateAsync({
        serviceId: Number(serviceId),
        fee: fee.trim(),
        effectiveFrom,
      });
      setOpen(false);
    } catch {
      // Shown in the sheet below.
    }
  };

  const scheduleError = schedule.error instanceof ApiError ? schedule.error.message : null;
  const feeValid = /^\d+(\.\d{1,2})?$/.test(fee.trim());
  const hasCurrentPrice = currentFees.some((row) => row.service.id === serviceId && row.price !== null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">{t('settings.pricingTitle')}</h1>
        <Button onClick={() => openSheet()} disabled={activeServices.length === 0}>
          {t('settings.addFee')}
        </Button>
      </div>

      {(prices.isPending || services.isPending) && <Spinner />}

      {prices.data && (
        <>
          <section>
            <SectionTitle>{t('settings.currentFees')}</SectionTitle>
            <Card>
              <ul className="divide-y divide-line">
                {currentFees.map(({ service, price }) => (
                  <li key={service.id} className="flex items-center gap-3 px-4 py-3.5">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">
                        {language === 'ar' ? service.nameAr : service.nameEn}
                      </span>
                      <span className="block text-xs text-muted">
                        {price
                          ? `${t('settings.effectiveFrom')} ${formatFullDate(price.effectiveFrom, language)}`
                          : t('settings.noPrices')}
                      </span>
                    </span>

                    <span className="tabnum text-lg font-bold text-ink">
                      {price ? <Money value={price.fee} /> : '—'}
                    </span>

                    <button
                      type="button"
                      onClick={() => openSheet(service.id)}
                      className="tap rounded-lg px-2 text-sm font-semibold text-brand-700"
                    >
                      {price ? t('common.edit') : t('settings.addFee')}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section>
            <SectionTitle>{t('settings.history')}</SectionTitle>
            {prices.data.length === 0 ? (
              <EmptyState title={t('settings.noPrices')} />
            ) : (
              <Card>
                <ul className="divide-y divide-line">
                  {prices.data.map((price) => (
                    <li key={price.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">
                          {language === 'ar' ? price.serviceNameAr : price.serviceNameEn}
                        </span>
                        <span className="block text-xs text-muted">
                          {formatFullDate(price.effectiveFrom, language)}
                          {' → '}
                          {price.effectiveTo
                            ? formatFullDate(price.effectiveTo, language)
                            : t('settings.openEnded')}
                        </span>
                      </span>
                      <span className="tabnum font-semibold text-ink">
                        {<Money value={price.fee} />}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={hasCurrentPrice ? t('settings.scheduleChange') : t('settings.addFee')}
      >
        <div className="flex flex-col gap-4">
          <Field label={t('common.service')} htmlFor="price-service">
            <Select
              id="price-service"
              value={serviceId}
              onChange={(event) => {
                const id = Number(event.target.value);
                setServiceId(id);
                setFee(feeForService(id));
              }}
            >
              {activeServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {language === 'ar' ? service.nameAr : service.nameEn}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('settings.newFee')} htmlFor="price-fee">
            <Input
              id="price-fee"
              type="text"
              inputMode="decimal"
              placeholder="300"
              value={fee}
              onChange={(event) => setFee(event.target.value.replace(/[^\d.]/g, ''))}
            />
          </Field>

          <Field
            label={t('settings.effectiveFrom')}
            hint={t('settings.scheduleHint')}
            htmlFor="price-from"
          >
            <DatePicker
              id="price-from"
              value={effectiveFrom}
              onChange={(value) => value && setEffectiveFrom(value)}
            />
          </Field>

          {scheduleError && <ErrorNotice message={scheduleError} />}

          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              block
              disabled={schedule.isPending || !feeValid || serviceId === ''}
              onClick={() => void submit()}
            >
              {schedule.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
