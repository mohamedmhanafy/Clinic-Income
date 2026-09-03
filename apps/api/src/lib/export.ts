import ExcelJS from 'exceljs';

/**
 * Tabular export.
 *
 * Reports are converted to this neutral shape once, then rendered as CSV or XLSX. PDF is
 * produced from the browser's print view rather than server-side, which keeps Arabic text
 * shaping in the hands of the browser (which does it well) instead of a bundled font.
 */
export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
  /** Right-aligned and formatted with thousands separators in Excel. */
  numeric?: boolean;
}

export interface ExportSheet {
  title: string;
  columns: ExportColumn[];
  rows: Array<Record<string, string | number>>;
  /** Rendered bold at the bottom of the sheet. */
  totals?: Record<string, string | number>;
}

function escapeCsvCell(value: string | number | undefined): string {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A UTF-8 BOM is prepended so that Excel on Windows opens Arabic service names correctly
 * instead of showing mojibake - without it, Excel guesses the local ANSI codepage.
 */
export function toCsv(sheet: ExportSheet): string {
  const lines: string[] = [];
  lines.push(sheet.columns.map((column) => escapeCsvCell(column.header)).join(','));
  for (const row of sheet.rows) {
    lines.push(sheet.columns.map((column) => escapeCsvCell(row[column.key])).join(','));
  }
  if (sheet.totals) {
    lines.push(sheet.columns.map((column) => escapeCsvCell(sheet.totals?.[column.key])).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

export async function toXlsx(sheet: ExportSheet): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Clinic Income Portal';
  workbook.created = new Date();

  // Excel limits worksheet names to 31 characters and forbids several punctuation marks.
  const safeTitle = sheet.title.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Report';
  const worksheet = workbook.addWorksheet(safeTitle);

  worksheet.columns = sheet.columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? Math.max(12, column.header.length + 2),
  }));

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { vertical: 'middle' };

  for (const row of sheet.rows) {
    worksheet.addRow(row);
  }

  if (sheet.totals) {
    const totalRow = worksheet.addRow(sheet.totals);
    totalRow.font = { bold: true };
    totalRow.border = { top: { style: 'thin' } };
  }

  for (const column of sheet.columns) {
    if (!column.numeric) continue;
    const worksheetColumn = worksheet.getColumn(column.key);
    worksheetColumn.numFmt = '#,##0.00';
    worksheetColumn.alignment = { horizontal: 'right' };
  }

  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Money arrives from the API as an exact decimal string. Excel needs a real number to
 * format and total, so it is converted only here, at the very edge, where the value is
 * about to be displayed and never read back for further arithmetic.
 */
export function moneyForExport(value: string): number {
  return Number(value);
}
