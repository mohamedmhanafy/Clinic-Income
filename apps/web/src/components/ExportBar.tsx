import { useTranslation } from 'react-i18next';
import { DownloadIcon } from './icons';

/**
 * Export controls.
 *
 * PDF is the browser's own Print to PDF driven by the print stylesheet, which handles
 * Arabic text shaping correctly and avoids shipping a headless browser or embedded fonts on
 * the server.
 */
export function ExportBar() {
  const { t } = useTranslation();

  // h-11 matches PeriodBar's/DatePicker's fixed control height exactly, so this button lines
  // up with whatever selector it sits beside instead of being taller from its own padding.
  const linkClass =
    'tap inline-flex h-11 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink';

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button type="button" className={linkClass} onClick={() => window.print()}>
        <DownloadIcon />
        {t('common.print')}
      </button>
    </div>
  );
}
