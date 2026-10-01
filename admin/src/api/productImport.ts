import { apiRequest } from './client';

/** One column of the upload sheet. Names match the admin product form. */
export interface ProductImportColumn {
  key: string;
  header: string;
  required: boolean;
  help: string;
  example: string;
  aliases: string[];
}

export interface ProductImportRowInput {
  /** Row number in the spreadsheet (header is row 1). */
  rowNumber: number;
  /** Column header → cell text, exactly as in the sheet. */
  cells: Record<string, string>;
}

export interface ProductImportIssue {
  row: number;
  message: string;
}

export interface ProductImportRowResult {
  rowNumber: number;
  productCode: string;
  name: string;
  shade?: string | null;
  action: 'Create' | 'Update' | string;
}

export interface ProductImportSummary {
  listingsCreated: number;
  listingsUpdated: number;
  shadesCreated: number;
  shadesUpdated: number;
  singleProductsCreated: number;
  singleProductsUpdated: number;
}

export interface ProductImportResult {
  dryRun: boolean;
  /** True only when the rows were saved. Any error means nothing is saved. */
  applied: boolean;
  errors: ProductImportIssue[];
  warnings: ProductImportIssue[];
  summary: ProductImportSummary;
  rows: ProductImportRowResult[];
  ignoredColumns: string[];
  productCodes: string[];
}

export interface ProductPublishResult {
  published: number;
  alreadyPublished: number;
  listingsPublished: number;
  skippedNoPhoto: string[];
  notFound: string[];
}

const BASE = '/api/admin/products/import';

export function getProductImportColumns(): Promise<ProductImportColumn[]> {
  return apiRequest<ProductImportColumn[]>(`${BASE}/columns`);
}

export function importProducts(
  rows: ProductImportRowInput[],
  options: { defaultCategory: string; dryRun: boolean },
): Promise<ProductImportResult> {
  return apiRequest<ProductImportResult>(BASE, {
    method: 'POST',
    body: JSON.stringify({
      defaultCategory: options.defaultCategory.trim() || null,
      dryRun: options.dryRun,
      rows,
    }),
  });
}

export function publishProductsWithPhotos(productCodes: string[]): Promise<ProductPublishResult> {
  return apiRequest<ProductPublishResult>(`${BASE}/publish`, {
    method: 'POST',
    body: JSON.stringify({ productCodes }),
  });
}
