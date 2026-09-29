import writeXlsxFile from 'write-excel-file/browser';

export type ExcelColumn<T> = {
  header: string;
  /** Column width in characters. */
  width?: number;
  value: (row: T) => string | number | Date | null | undefined;
};

/** Builds an .xlsx from the given rows/columns in the browser and downloads it. */
export async function downloadExcel<T>(
  fileBaseName: string,
  sheetName: string,
  columns: ExcelColumn<T>[],
  rows: T[],
): Promise<void> {
  const header = columns.map((c) => ({ value: c.header, fontWeight: 'bold' as const }));
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = c.value(row);
      // Keep blanks empty (rather than "—") so filters and formulas work in Excel.
      if (v === undefined || v === null || v === '') return null;
      // write-excel-file rejects Date cells without an explicit number format.
      if (v instanceof Date) return { value: v, format: 'dd mmm yyyy hh:mm' };
      return v;
    }),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  await writeXlsxFile([header, ...body], {
    sheet: sheetName,
    columns: columns.map((c) => ({ width: c.width ?? 18 })),
    stickyRowsCount: 1,
  }).toFile(`${fileBaseName}-${stamp}.xlsx`);
}
