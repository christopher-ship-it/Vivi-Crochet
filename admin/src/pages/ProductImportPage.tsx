import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiClientError } from '../api/client';
import {
  getProductImportColumns,
  importProducts,
  publishProductsWithPhotos,
  type ProductImportColumn,
  type ProductImportResult,
  type ProductImportRowInput,
  type ProductPublishResult,
} from '../api/productImport';
import {
  completeProductImageUpload,
  listProductCategories,
  listProducts,
  requestProductImageUploadUrl,
} from '../api/products';
import { downloadSampleSheet, readProductSheet } from '../utils/productImportSheet';
import { matchPhotoToCode } from '../utils/productPhotoMatch';
import { formatFileSize, validateImageFile } from '../utils/format';
import { convertHeicToJpeg, isHeicImage, renderProductImage } from '../utils/productImagePrepare';
import { uploadToBlob } from '../utils/videoUpload';

const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;
const PHOTO_UPLOAD_CONCURRENCY = 3;

type CatalogEntry = {
  id: string;
  code: string;
  label: string;
  hasPhoto: boolean;
  published: boolean;
};

type PhotoStatus = 'ready' | 'hasPhoto' | 'noMatch' | 'duplicate' | 'uploading' | 'done' | 'failed';

type PhotoItem = {
  key: string;
  file: File;
  code: string | null;
  status: PhotoStatus;
  message?: string;
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiClientError || err instanceof Error ? err.message : fallback;
}

/** Looks up a column's value in a sheet row, whichever name (admin label or known alias) the sheet uses. */
function cellFor(row: ProductImportRowInput, column: ProductImportColumn | undefined): string {
  if (!column) return '';
  const names = new Set([column.header, ...column.aliases].map(normalize));
  for (const [header, value] of Object.entries(row.cells)) {
    if (names.has(normalize(header)) && value) return value;
  }
  return '';
}

export function ProductImportPage() {
  const [columns, setColumns] = useState<ProductImportColumn[]>([]);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [defaultCategory, setDefaultCategory] = useState('');

  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ProductImportRowInput[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProductImportResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<ProductImportResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [replacePhotos, setReplacePhotos] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<ProductPublishResult | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const checkRun = useRef(0);

  // ---------------------------------------------------------------- loading

  const loadCatalog = useCallback(async () => {
    const products = await listProducts();
    const entries: CatalogEntry[] = [];
    for (const product of products) {
      if (product.variants?.length) {
        for (const variant of product.variants) {
          if (!variant.productCode) continue;
          entries.push({
            id: variant.id,
            code: variant.productCode,
            label: `${product.name} · ${variant.colourName ?? variant.productCode}`,
            hasPhoto: Boolean(variant.imageUrl),
            published: variant.status === 'Published',
          });
        }
      } else if (product.productCode) {
        entries.push({
          id: product.id,
          code: product.productCode,
          label: product.name,
          hasPhoto: Boolean(product.imageUrl) || (product.images?.length ?? 0) > 0,
          published: product.status === 'Published',
        });
      }
    }
    setCatalog(entries);
    return entries;
  }, []);

  useEffect(() => {
    getProductImportColumns()
      .then(setColumns)
      .catch((err) => setColumnsError(errorText(err, 'Could not load the column list.')));
    listProductCategories('Resell')
      .then((list) => {
        setCategories(list);
        setDefaultCategory((current) => current || list[0] || 'Yarn');
      })
      .catch(() => setDefaultCategory((current) => current || 'Yarn'));
    void loadCatalog().catch(() => setCatalog([]));
  }, [loadCatalog]);

  // ------------------------------------------------- step 2: read and check

  const runCheck = useCallback(
    async (sheetRows: ProductImportRowInput[], category: string) => {
      const run = ++checkRun.current;
      setChecking(true);
      setActionError(null);
      try {
        const result = await importProducts(sheetRows, { defaultCategory: category, dryRun: true });
        if (run === checkRun.current) setPreview(result);
      } catch (err) {
        if (run === checkRun.current) {
          setPreview(null);
          setActionError(errorText(err, 'Could not check the sheet.'));
        }
      } finally {
        if (run === checkRun.current) setChecking(false);
      }
    },
    [],
  );

  // Re-check when the default category changes (after a short pause while typing).
  useEffect(() => {
    if (rows.length === 0 || imported) return;
    const timer = window.setTimeout(() => void runCheck(rows, defaultCategory), 450);
    return () => window.clearTimeout(timer);
  }, [rows, defaultCategory, imported, runCheck]);

  async function handleSheet(file: File | undefined) {
    if (!file) return;
    setReadError(null);
    setActionError(null);
    setPreview(null);
    setImported(null);
    setPublished(null);
    setFileName(file.name);
    try {
      const sheet = await readProductSheet(file);
      if (sheet.rows.length === 0) {
        setRows([]);
        setReadError('No product rows found. Row 1 must hold the column names, with products from row 2.');
        return;
      }
      setRows(sheet.rows);
    } catch {
      setRows([]);
      setReadError('Could not read that file. Please upload an Excel (.xlsx) file.');
    }
  }

  function resetSheet() {
    checkRun.current++;
    setRows([]);
    setFileName('');
    setPreview(null);
    setImported(null);
    setReadError(null);
    setActionError(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function handleImport() {
    setImporting(true);
    setActionError(null);
    try {
      const result = await importProducts(rows, { defaultCategory, dryRun: false });
      if (!result.applied) {
        setPreview(result);
        setActionError('Nothing was imported. Fix the errors below and try again.');
        return;
      }
      setImported(result);
      setPublished(null);
      await loadCatalog();
    } catch (err) {
      setActionError(errorText(err, 'Import failed.'));
    } finally {
      setImporting(false);
    }
  }

  // ------------------------------------------------------ step 4: photos

  const productCodeColumn = columns.find((c) => c.key === 'ProductCode');
  const imageColumn = columns.find((c) => c.key === 'ImageFilename');

  /** "dsr001_lilac.jpg" → "DSR001" for every row whose sheet lists an Image filename. */
  const sheetFileNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const image = cellFor(row, imageColumn);
      const code = cellFor(row, productCodeColumn);
      if (image && code) map.set(image.trim().toLowerCase(), code);
    }
    return map;
  }, [rows, imageColumn, productCodeColumn]);

  function classifyPhotos(files: File[], entries: CatalogEntry[]): PhotoItem[] {
    const byCode = new Map(entries.map((e) => [e.code.toLowerCase(), e]));
    const codes = entries.map((e) => e.code);
    const seen = new Set<string>();
    return files.map((file, index) => {
      const matched = matchPhotoToCode(file.name, codes, sheetFileNames);
      const entry = matched ? byCode.get(matched.toLowerCase()) : undefined;
      const item: PhotoItem = { key: `${index}-${file.name}`, file, code: entry?.code ?? null, status: 'ready' };
      if (!entry) return { ...item, status: 'noMatch' };
      if (seen.has(entry.code.toLowerCase())) return { ...item, status: 'duplicate' };
      seen.add(entry.code.toLowerCase());
      if (entry.hasPhoto && !replacePhotos) return { ...item, status: 'hasPhoto' };
      return item;
    });
  }

  // Re-classify only when "replace" is toggled, so the table matches what Upload will do. Never
  // after an upload has started: the catalog refreshes then, and re-matching would erase the
  // "Uploaded" / "Failed" results the admin needs to read.
  useEffect(() => {
    setPhotos((current) =>
      current.length === 0 || current.some((p) => p.status === 'uploading' || p.status === 'done' || p.status === 'failed')
        ? current
        : classifyPhotos(
            current.map((p) => p.file),
            catalog,
          ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately only on the toggle
  }, [replacePhotos]);

  function handlePhotoFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setPhotos(classifyPhotos(Array.from(list), catalog));
  }

  async function uploadOne(item: PhotoItem): Promise<void> {
    const entry = catalog.find((e) => e.code.toLowerCase() === item.code?.toLowerCase());
    if (!entry) throw new Error('Product not found.');

    // iPhone HEIC photos are converted first; every photo is fitted into the shop's 1200×1200 square.
    const source = isHeicImage(item.file) ? await convertHeicToJpeg(item.file) : item.file;
    const sourceCheck = validateImageFile(source, MAX_SOURCE_IMAGE_BYTES);
    if (!sourceCheck.valid) throw new Error(sourceCheck.error ?? 'Invalid image');
    const prepared = await renderProductImage(source);
    const check = validateImageFile(prepared);
    if (!check.valid) throw new Error(check.error ?? 'Prepared image is invalid');

    const ticket = await requestProductImageUploadUrl(entry.id, {
      fileName: prepared.name,
      contentType: check.contentType!,
      fileSizeBytes: prepared.size,
    });
    const upload = await uploadToBlob(ticket.uploadUrl, prepared, check.contentType!);
    if (!upload.success) throw new Error(upload.error ?? 'Upload failed');
    await completeProductImageUpload(entry.id, {
      blobPath: ticket.blobPath,
      fileSizeBytes: prepared.size,
      contentType: check.contentType!,
      setAsMain: true,
    });
  }

  async function handleUploadPhotos() {
    const queue = photos.filter((p) => p.status === 'ready');
    if (queue.length === 0) return;
    setUploadingPhotos(true);

    const update = (key: string, patch: Partial<PhotoItem>) =>
      setPhotos((current) => current.map((p) => (p.key === key ? { ...p, ...patch } : p)));

    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const item = queue[next++];
        update(item.key, { status: 'uploading', message: undefined });
        try {
          await uploadOne(item);
          update(item.key, { status: 'done' });
        } catch (err) {
          update(item.key, { status: 'failed', message: errorText(err, 'Upload failed.') });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PHOTO_UPLOAD_CONCURRENCY, queue.length) }, worker));

    try {
      await loadCatalog();
    } finally {
      setUploadingPhotos(false);
    }
  }

  // --------------------------------------------------------- step 5: publish

  const importedCodes = imported?.productCodes ?? [];
  const publishTargets = useMemo(() => {
    if (importedCodes.length > 0) {
      const wanted = new Set(importedCodes.map((c) => c.toLowerCase()));
      return catalog.filter((e) => wanted.has(e.code.toLowerCase()));
    }
    return catalog.filter((e) => !e.published);
  }, [catalog, importedCodes]);
  const publishable = publishTargets.filter((e) => e.hasPhoto && !e.published).length;
  const waitingForPhoto = publishTargets.filter((e) => !e.hasPhoto).length;

  async function handlePublish() {
    setPublishing(true);
    setPublishError(null);
    try {
      setPublished(await publishProductsWithPhotos(publishTargets.map((e) => e.code)));
      await loadCatalog();
    } catch (err) {
      setPublishError(errorText(err, 'Could not publish.'));
    } finally {
      setPublishing(false);
    }
  }

  // ------------------------------------------------------------------ render

  const hasErrors = (preview?.errors.length ?? 0) > 0;
  const summary = preview?.summary;
  const readyPhotos = photos.filter((p) => p.status === 'ready').length;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">Upload products</h1>
          <p className="page-header__subtitle">
            Add many products at once from an Excel sheet. Details come from the sheet; photos are added
            afterwards.
          </p>
        </div>
        <div className="page-header__actions">
          <Link to="/products" className="btn btn--sm">Back to products</Link>
        </div>
      </header>

      {/* Step 1 */}
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card__header">
          <h2 className="card__title">1. Get the sample sheet</h2>
          <p className="card__subtitle">
            The column names match the product form. Delete the example rows, add your products, save as
            .xlsx.
          </p>
        </div>
        {columnsError ? <div className="form-error">{columnsError}</div> : null}
        <button
          type="button"
          className="btn btn--secondary"
          disabled={columns.length === 0}
          onClick={() => void downloadSampleSheet(columns)}
        >
          Download sample (.xlsx)
        </button>

        {columns.length > 0 ? (
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>What each column means</summary>
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Required</th>
                    <th>What to enter</th>
                    <th>Example</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((c) => (
                    <tr key={c.key}>
                      <td className="cell-strong" style={{ whiteSpace: 'nowrap' }}>{c.header}</td>
                      <td>{c.required ? 'Yes' : '—'}</td>
                      <td>{c.help}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{c.example || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="form-hint" style={{ marginTop: 8 }}>
              Rows with the same <strong>Product name</strong> and a <strong>Shade / colour name</strong> become
              the shades of one listing. A row without a shade is a single product. Your existing yarn sheet
              works as it is.
            </p>
          </details>
        ) : null}
      </section>

      {/* Step 2 */}
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card__header">
          <h2 className="card__title">2. Upload your sheet</h2>
          <p className="card__subtitle">
            We check every row first and show you what will happen. Nothing is saved until you confirm.
          </p>
        </div>

        <div className="form-grid-6">
          <div className="form-field span-3">
            <label htmlFor="import-file">Excel file (.xlsx)</label>
            <input
              id="import-file"
              ref={fileInput}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={Boolean(imported) || importing}
              onChange={(e) => void handleSheet(e.target.files?.[0])}
            />
          </div>
          <div className="form-field span-3">
            <label htmlFor="import-category">Default category</label>
            <input
              id="import-category"
              list="import-category-options"
              maxLength={80}
              value={defaultCategory}
              disabled={Boolean(imported) || importing}
              onChange={(e) => setDefaultCategory(e.target.value)}
            />
            <datalist id="import-category-options">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="form-hint">Used for rows with no Category. Existing products keep their category.</p>
          </div>
        </div>

        {readError ? <div className="form-error" style={{ marginTop: 12 }}>{readError}</div> : null}
        {actionError ? <div className="form-error" style={{ marginTop: 12 }}>{actionError}</div> : null}
        {checking ? <p className="form-hint" style={{ marginTop: 12 }}>Checking {rows.length} rows…</p> : null}

        {preview && !imported ? (
          <div style={{ marginTop: 16 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
              {fileName} · {rows.length} rows
            </p>

            {!hasErrors && summary ? (
              <div className="alert alert--success">
                Ready to import:{' '}
                {[
                  summary.listingsCreated ? `${summary.listingsCreated} new listing${summary.listingsCreated === 1 ? '' : 's'}` : '',
                  summary.listingsUpdated ? `${summary.listingsUpdated} listing${summary.listingsUpdated === 1 ? '' : 's'} updated` : '',
                  summary.shadesCreated ? `${summary.shadesCreated} new shade${summary.shadesCreated === 1 ? '' : 's'}` : '',
                  summary.shadesUpdated ? `${summary.shadesUpdated} shade${summary.shadesUpdated === 1 ? '' : 's'} updated` : '',
                  summary.singleProductsCreated ? `${summary.singleProductsCreated} new single product${summary.singleProductsCreated === 1 ? '' : 's'}` : '',
                  summary.singleProductsUpdated ? `${summary.singleProductsUpdated} single product${summary.singleProductsUpdated === 1 ? '' : 's'} updated` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                . New products start as drafts.
              </div>
            ) : null}

            {hasErrors ? (
              <div className="error-state" style={{ textAlign: 'left' }}>
                <h3>Fix these {preview.errors.length} problem{preview.errors.length === 1 ? '' : 's'} in your sheet</h3>
                <p>Nothing is imported until every row is correct. Fix the sheet and upload it again.</p>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, maxHeight: 220, overflow: 'auto' }}>
                  {preview.errors.map((issue, i) => (
                    <li key={i}>
                      {issue.row > 0 ? <strong>Row {issue.row}: </strong> : null}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview.warnings.length > 0 ? (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer' }}>{preview.warnings.length} note{preview.warnings.length === 1 ? '' : 's'} (the import still works)</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {preview.warnings.map((issue, i) => (
                    <li key={i}>Row {issue.row}: {issue.message}</li>
                  ))}
                </ul>
              </details>
            ) : null}

            {preview.ignoredColumns.length > 0 ? (
              <p className="form-hint" style={{ marginTop: 8 }}>
                Columns not imported: {preview.ignoredColumns.join(', ')}.
              </p>
            ) : null}

            {!hasErrors && preview.rows.length > 0 ? (
              <div className="table-wrap" style={{ marginTop: 12, maxHeight: 320, overflow: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Code</th>
                      <th>Product</th>
                      <th>Shade</th>
                      <th>Will…</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.rowNumber}>
                        <td>{r.rowNumber}</td>
                        <td className="cell-strong">{r.productCode}</td>
                        <td>{r.name}</td>
                        <td>{r.shade || '—'}</td>
                        <td>
                          <span className={`badge ${r.action === 'Create' ? 'badge--published' : 'badge--pending'}`}>
                            {r.action === 'Create' ? 'Create' : 'Update'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                type="button"
                className="btn btn--primary"
                disabled={hasErrors || checking || importing || preview.rows.length === 0}
                onClick={() => void handleImport()}
              >
                {importing
                  ? 'Importing…'
                  : hasErrors
                    ? 'Fix the problems to import'
                    : `Import ${preview.rows.length} product${preview.rows.length === 1 ? '' : 's'}`}
              </button>
              <button type="button" className="btn btn--ghost" disabled={importing} onClick={resetSheet}>
                Choose another file
              </button>
            </div>
          </div>
        ) : null}

        {imported ? (
          <div className="alert alert--success" style={{ marginTop: 16 }}>
            Imported {imported.rows.length} product{imported.rows.length === 1 ? '' : 's'} as drafts. Next, add
            their photos.{' '}
            <button type="button" className="btn btn--ghost btn--sm" onClick={resetSheet}>
              Upload another sheet
            </button>
          </div>
        ) : null}
      </section>

      {/* Step 3 */}
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card__header">
          <h2 className="card__title">3. Add photos</h2>
          <p className="card__subtitle">
            Select all the photos at once. Each file name must start with the product code (for example
            <strong> DSR001_Lilac.jpg</strong>) so it goes to the right product. Photos are resized to the shop's
            square.
          </p>
        </div>

        <div className="form-field">
          <label htmlFor="import-photos">Photos</label>
          <input
            id="import-photos"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
            disabled={uploadingPhotos || catalog.length === 0}
            onChange={(e) => {
              handlePhotoFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {catalog.length === 0 ? (
            <p className="form-hint">Import products first, or add products with a Product code.</p>
          ) : null}
        </div>

        <label className="choice" style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={replacePhotos}
            disabled={uploadingPhotos}
            onChange={(e) => setReplacePhotos(e.target.checked)}
          />
          Replace the main photo of products that already have one
        </label>

        {photos.length > 0 ? (
          <>
            <div className="table-wrap" style={{ marginTop: 12, maxHeight: 360, overflow: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Size</th>
                    <th>Goes to</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {photos.map((p) => {
                    const entry = catalog.find((e) => e.code.toLowerCase() === p.code?.toLowerCase());
                    return (
                      <tr key={p.key}>
                        <td className="cell-clip">{p.file.name}</td>
                        <td>{formatFileSize(p.file.size)}</td>
                        <td>{entry ? `${entry.label} (${entry.code})` : '—'}</td>
                        <td>
                          <span className={`badge ${photoBadge(p.status)}`}>{photoLabel(p.status)}</span>
                          {p.message ? <div className="form-hint">{p.message}</div> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="btn btn--primary"
                disabled={readyPhotos === 0 || uploadingPhotos}
                onClick={() => void handleUploadPhotos()}
              >
                {uploadingPhotos ? 'Uploading…' : `Upload ${readyPhotos} photo${readyPhotos === 1 ? '' : 's'}`}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={uploadingPhotos}
                onClick={() => setPhotos([])}
              >
                Clear list
              </button>
            </div>
          </>
        ) : null}
      </section>

      {/* Step 4 */}
      <section className="card">
        <div className="card__header">
          <h2 className="card__title">4. Publish</h2>
          <p className="card__subtitle">
            Makes {imported ? 'the products you just imported' : 'every draft product'} that already {imported ? 'have' : 'has'} a
            photo visible in the app, together with their listing. Products without a photo stay as drafts.
          </p>
        </div>

        <p style={{ margin: '0 0 10px' }}>
          <strong>{publishable}</strong> ready to publish
          {waitingForPhoto > 0 ? <> · <strong>{waitingForPhoto}</strong> still waiting for a photo</> : null}
        </p>
        {publishError ? <div className="form-error">{publishError}</div> : null}
        <button
          type="button"
          className="btn btn--primary"
          disabled={publishing || publishable === 0}
          onClick={() => void handlePublish()}
        >
          {publishing ? 'Publishing…' : `Publish ${publishable} product${publishable === 1 ? '' : 's'}`}
        </button>

        {published ? (
          <div className="alert alert--success" style={{ marginTop: 12 }}>
            Published {published.published} product{published.published === 1 ? '' : 's'}
            {published.listingsPublished > 0
              ? ` and ${published.listingsPublished} listing${published.listingsPublished === 1 ? '' : 's'}`
              : ''}
            .
            {published.skippedNoPhoto.length > 0
              ? ` Still drafts (no photo yet): ${published.skippedNoPhoto.join(', ')}.`
              : ''}
          </div>
        ) : null}
      </section>
    </>
  );
}

function photoLabel(status: PhotoStatus): string {
  switch (status) {
    case 'ready': return 'Ready';
    case 'hasPhoto': return 'Already has a photo';
    case 'noMatch': return 'No matching product';
    case 'duplicate': return 'Second photo for same product';
    case 'uploading': return 'Uploading…';
    case 'done': return 'Uploaded';
    case 'failed': return 'Failed';
  }
}

function photoBadge(status: PhotoStatus): string {
  switch (status) {
    case 'done': return 'badge--published';
    case 'ready':
    case 'uploading': return 'badge--pending';
    case 'failed':
    case 'noMatch': return 'badge--failed';
    default: return 'badge--inactive';
  }
}
