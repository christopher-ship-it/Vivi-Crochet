import writeXlsxFile from 'write-excel-file/browser';
import { readSheet } from 'read-excel-file/browser';
import type { ProductImportColumn, ProductImportRowInput } from '../api/productImport';

/** Cell value from a spreadsheet as the text a person would see. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value).trim();
}

/**
 * Reads the first sheet of an .xlsx. Row 1 holds the column names; every later row becomes one
 * entry keyed by those names. Fully blank rows are dropped, and row numbers stay the real
 * spreadsheet row numbers so error messages point at the right line.
 */
export async function readProductSheet(file: File): Promise<{
  headers: string[];
  rows: ProductImportRowInput[];
}> {
  const data = (await readSheet(file)) as unknown[][];
  if (data.length === 0) return { headers: [], rows: [] };

  const headers = data[0].map(cellText);
  const rows: ProductImportRowInput[] = [];
  for (let i = 1; i < data.length; i++) {
    const cells: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, col) => {
      if (!header) return;
      const text = cellText(data[i][col]);
      if (text) hasValue = true;
      // Keep the first column when a header repeats.
      if (!(header in cells)) cells[header] = text;
    });
    if (hasValue) rows.push({ rowNumber: i + 1, cells });
  }
  return { headers, rows };
}

/**
 * The three example rows in the sample file (a yarn with two shades and a single product), as
 * header → text. Exported so the sample can be checked against the importer.
 */
export function sampleRows(columns: ProductImportColumn[]): Record<string, string>[] {
  const exampleFor = (column: ProductImportColumn, row: number): string => {
    const yarn = row < 2;
    switch (column.key) {
      case 'ProductName':
        return yarn ? 'Desire Knitting Yarn' : 'Bamboo Hook Set';
      case 'ProductCode':
        return ['DSR001', 'DSR002', 'HOOK-01'][row];
      case 'ShadeName':
        return ['Lilac', 'Beige', ''][row];
      case 'SwatchColour':
        return ['#C8A2C8', '#D9C7A3', ''][row];
      case 'Category':
        return yarn ? 'Yarn' : 'Tools';
      case 'Price':
        return ['130', '130', '499'][row];
      case 'Mrp':
        return ['150', '150', '599'][row];
      case 'Stock':
        return ['50', '40', '12'][row];
      case 'Description':
        return ['Soft, durable acrylic yarn for knitting and crochet.', '', 'Set of 5 bamboo crochet hooks.'][row];
      case 'ImageFilename':
        return ['DSR001_Lilac.jpg', 'DSR002_Beige.jpg', 'HOOK-01.jpg'][row];
      case 'ProductType':
        return 'Crochet Essentials';
      case 'VariantOptionLabel':
        return yarn ? 'Shade' : '';
      default:
        // Yarn specs apply to the yarn rows only.
        return yarn ? column.example : '';
    }
  };

  return [0, 1, 2].map((row) => Object.fromEntries(columns.map((c) => [c.header, exampleFor(c, row)])));
}

/**
 * Sample upload file with the exact column names, three example rows and a "How to fill" sheet.
 * Built from the server's column list, so it can never drift from what the importer accepts.
 */
export async function downloadSampleSheet(columns: ProductImportColumn[]): Promise<void> {
  const bold = (value: string) => ({ value, fontWeight: 'bold' as const });

  const widths = columns.map((c) => ({
    width: Math.max(14, Math.min(34, c.header.length + 4, Math.max(c.example.length + 2, 14))),
  }));

  const dataSheet = [
    columns.map((c) => bold(c.header)),
    ...sampleRows(columns).map((row) => columns.map((c) => (row[c.header] === '' ? null : row[c.header]))),
  ];

  const helpSheet = [
    [bold('Column'), bold('Required?'), bold('What to enter')],
    ...columns.map((c) => [c.header, c.required ? 'Yes' : 'No', c.help]),
    [null, null, null],
    [bold('Good to know'), null, null],
    ['Same product name + a shade name', null, 'Rows become the shades of one listing (like colours of one yarn).'],
    ['No shade name', null, 'The row is a single product on its own.'],
    ['Uploading again', null, 'Products are found by Product code and updated. Empty cells never erase existing data.'],
    ['Photos', null, 'Upload photos after the data, in the "Add photos" step. File names must start with the Product code.'],
    ['Delete the three example rows before you upload.', null, null],
  ];

  await writeXlsxFile([
    { data: dataSheet, sheet: 'Products', columns: widths, stickyRowsCount: 1 },
    { data: helpSheet, sheet: 'How to fill', columns: [{ width: 34 }, { width: 11 }, { width: 90 }] },
  ]).toFile('vivi-product-upload-sample.xlsx');
}
