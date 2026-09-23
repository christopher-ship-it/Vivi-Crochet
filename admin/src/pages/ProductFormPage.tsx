import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  completeProductImageUpload,
  createProduct,
  deleteProductImage,
  getProduct,
  listProductCategories,
  listProducts,
  requestProductImageUploadUrl,
  setProductMainImage,
  updateProduct,
} from '../api/products';
import { listCourses } from '../api/courses';
import { ApiClientError } from '../api/client';
import type { Course, Product, ProductImage, ProductRequest, ProductType } from '../types';
import { formatFileSize, validateImageFile } from '../utils/format';
import {
  prepareProductImage,
  PRODUCT_IMAGE_EDGE_PX,
} from '../utils/productImagePrepare';
import { uploadToBlob, type UploadProgress } from '../utils/videoUpload';

const MAX_PHOTOS = 5;

/** Lets admins clear a number field while typing (`Number('')` is 0 and traps the cursor). */
type NumberDraft = number | '';

type ProductFormState = Omit<ProductRequest, 'price' | 'availableStock' | 'sortOrder'> & {
  price: NumberDraft;
  availableStock: NumberDraft;
  sortOrder: NumberDraft;
};

function parseNumberDraft(raw: string): NumberDraft {
  if (raw.trim() === '') return '';
  const n = Number(raw);
  return Number.isFinite(n) ? n : '';
}

const emptyForm: ProductFormState = {
  name: '',
  category: '',
  description: '',
  price: '',
  mrp: null,
  spec1: '',
  spec2: '',
  courseId: null,
  sortOrder: 0,
  productType: 'Handmade',
  availableStock: '',
  recommendedEssentialIds: [],
};

function imagesFromProduct(product: {
  images?: ProductImage[];
  imageUrl?: string | null;
}): ProductImage[] {
  const gallery = product.images ?? [];
  if (gallery.length > 0) return gallery;
  if (!product.imageUrl) return [];
  // Older API builds only returned imageUrl — keep the main photo visible.
  return [{
    id: 'legacy-main',
    url: product.imageUrl,
    blobPath: product.imageUrl,
    sortOrder: 0,
    isMain: true,
  }];
}

function initialProductType(searchParams: URLSearchParams): ProductType {
  const raw = searchParams.get('type');
  return raw === 'Resell' ? 'Resell' : 'Handmade';
}

export function ProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ProductFormState>(() => ({
    ...emptyForm,
    productType: initialProductType(searchParams),
  }));
  const [categories, setCategories] = useState<string[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [essentialsCatalog, setEssentialsCatalog] = useState<Product[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busyImageId, setBusyImageId] = useState<string | null>(null);

  useEffect(() => {
    listProductCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
    listCourses()
      .then(setCourses)
      .catch(() => setCourses([]));
    listProducts('Resell')
      .then(setEssentialsCatalog)
      .catch(() => setEssentialsCatalog([]));
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const product = await getProduct(id!);
        if (cancelled) return;
        setForm({
          name: product.name,
          category: product.category,
          description: product.description ?? '',
          price: product.price,
          mrp: product.mrp ?? null,
          spec1: product.spec1 ?? '',
          spec2: product.spec2 ?? '',
          courseId: product.courseId ?? null,
          sortOrder: product.sortOrder,
          productType: product.productType ?? 'Handmade',
          availableStock: product.availableStock ?? 0,
          recommendedEssentialIds: (product.recommendedEssentials ?? []).map((e) => e.id),
        });
        setImages(imagesFromProduct(product));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load product.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.price === '' || form.price < 0) {
      setError('Enter a valid price (₹).');
      return;
    }
    if (form.availableStock === '' || form.availableStock < 0) {
      setError('Enter available stock (0 or more).');
      return;
    }
    setSaving(true);
    setError(null);
    const payload: ProductRequest = {
      ...form,
      price: form.price,
      availableStock: Math.max(0, Math.floor(form.availableStock)),
      sortOrder: form.sortOrder === '' ? 0 : form.sortOrder,
      description: form.description?.trim() || null,
      spec1: form.spec1?.trim() || null,
      spec2: form.spec2?.trim() || null,
      mrp: form.mrp || null,
      courseId: form.productType === 'Handmade' ? (form.courseId || null) : null,
      recommendedEssentialIds:
        form.productType === 'Handmade'
          ? (form.recommendedEssentialIds ?? []).slice(0, 3)
          : [],
    };
    try {
      if (isEdit && id) {
        await updateProduct(id, payload);
        navigate('/products');
      } else {
        const created = await createProduct(payload);
        navigate(`/products/${created.id}/edit`);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadOneImage(file: File, currentCount: number): Promise<ProductImage[]> {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      throw new Error(validation.error ?? 'Invalid image');
    }

    // Always store a fixed 1200×1200 JPEG for Handmade + Essentials shop photos.
    const prepared = await prepareProductImage(file);
    const preparedValidation = validateImageFile(prepared);
    if (!preparedValidation.valid) {
      throw new Error(preparedValidation.error ?? 'Prepared image is invalid');
    }

    setUploadProgress({ loaded: 0, total: prepared.size, percent: 0 });

    const ticket = await requestProductImageUploadUrl(id!, {
      fileName: prepared.name,
      contentType: preparedValidation.contentType!,
      fileSizeBytes: prepared.size,
    });

    const uploadResult = await uploadToBlob(
      ticket.uploadUrl,
      prepared,
      preparedValidation.contentType!,
      setUploadProgress,
    );

    if (!uploadResult.success) {
      throw new Error(uploadResult.error ?? 'Upload failed');
    }

    const product = await completeProductImageUpload(id!, {
      blobPath: ticket.blobPath,
      fileSizeBytes: prepared.size,
      contentType: preparedValidation.contentType!,
      setAsMain: currentCount === 0,
    });

    return imagesFromProduct(product);
  }

  async function handleImageSelect(fileList: FileList | null) {
    if (!fileList?.length || !id) return;

    const remaining = MAX_PHOTOS - images.length;
    if (remaining <= 0) {
      setUploadError(`You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const files = Array.from(fileList).slice(0, remaining);
    if (fileList.length > remaining) {
      setUploadError(`Only ${remaining} more photo(s) can be added (max ${MAX_PHOTOS}). Uploading the first ${remaining}.`);
    } else {
      setUploadError(null);
    }

    setUploading(true);
    let nextImages = images;
    try {
      for (let i = 0; i < files.length; i++) {
        nextImages = await uploadOneImage(files[i], nextImages.length);
        setImages(nextImages);
      }
      setUploadProgress(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Image upload failed.');
      setUploadProgress(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSetMain(imageId: string) {
    if (!id) return;
    if (imageId === 'legacy-main') {
      setUploadError('Redeploy the API to manage gallery photos. This photo is from an older single-image save.');
      return;
    }
    setBusyImageId(imageId);
    setUploadError(null);
    try {
      const product = await setProductMainImage(id, imageId);
      setImages(imagesFromProduct(product));
    } catch (err) {
      setUploadError(err instanceof ApiClientError ? err.message : 'Could not set main image.');
    } finally {
      setBusyImageId(null);
    }
  }

  async function handleRemove(imageId: string) {
    if (!id) return;
    if (imageId === 'legacy-main') {
      setUploadError('Redeploy the API to manage gallery photos. This photo is from an older single-image save.');
      return;
    }
    if (!window.confirm('Remove this photo from the product?')) return;
    setBusyImageId(imageId);
    setUploadError(null);
    try {
      const product = await deleteProductImage(id, imageId);
      setImages(imagesFromProduct(product));
    } catch (err) {
      setUploadError(err instanceof ApiClientError ? err.message : 'Could not remove photo.');
    } finally {
      setBusyImageId(null);
    }
  }

  if (loading) {
    return (
      <div className="loading-state">
        <p>Loading product…</p>
      </div>
    );
  }

  const canAddMore = images.length < MAX_PHOTOS;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-header__title">{isEdit ? 'Edit product' : 'New product'}</h1>
          <p className="page-header__subtitle">
            {isEdit ? 'Update shop listing details and photos' : 'Products are created as Draft until you publish'}
          </p>
        </div>
        <div className="page-header__actions">
          <Link to="/products" className="btn btn--ghost">Cancel</Link>
        </div>
      </header>

      <form className="card" onSubmit={handleSubmit}>
        {error && <div className="form-error" style={{ marginBottom: 20 }}>{error}</div>}

        <div className="form-grid">
          <div className="form-field form-grid--full">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              required
              maxLength={160}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="category">Category</label>
            <input
              id="category"
              required
              list="product-categories"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
            <datalist id="product-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="form-field">
            <label>Product type</label>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', minHeight: 32 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="productType"
                  checked={form.productType === 'Handmade'}
                  onChange={() => setForm((f) => ({ ...f, productType: 'Handmade' }))}
                />
                Handmade Collection
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="productType"
                  checked={form.productType === 'Resell'}
                  onChange={() => setForm((f) => ({
                    ...f,
                    productType: 'Resell',
                    courseId: null,
                    recommendedEssentialIds: [],
                  }))}
                />
                Crochet Essentials
              </label>
            </div>
          </div>
          <div className="form-field form-grid--full">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              rows={4}
              maxLength={2000}
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="form-grid--full form-row">
            <div className="form-field form-field--narrow">
              <label htmlFor="price">Price (₹)</label>
              <input
                id="price"
                type="number"
                required
                min={0}
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: parseNumberDraft(e.target.value) }))}
              />
            </div>
            <div className="form-field form-field--narrow">
              <label htmlFor="mrp">MRP (₹)</label>
              <input
                id="mrp"
                type="number"
                min={0}
                value={form.mrp ?? ''}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  mrp: e.target.value === '' ? null : Number(e.target.value),
                }))}
              />
            </div>
            <div className="form-field form-field--narrow">
              <label htmlFor="availableStock">Available Stock</label>
              <input
                id="availableStock"
                type="number"
                required
                min={0}
                step={1}
                value={form.availableStock}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  availableStock: parseNumberDraft(e.target.value),
                }))}
              />
              <span className="form-hint">Maximum quantity customers can purchase.</span>
            </div>
            <div className="form-field form-field--narrow">
              <label htmlFor="spec1">Spec 1</label>
              <input
                id="spec1"
                value={form.spec1 ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, spec1: e.target.value }))}
              />
            </div>
            <div className="form-field form-field--narrow">
              <label htmlFor="spec2">Spec 2</label>
              <input
                id="spec2"
                value={form.spec2 ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, spec2: e.target.value }))}
              />
            </div>
            <div className="form-field form-field--narrow">
              <label htmlFor="sortOrder">Sort order</label>
              <input
                id="sortOrder"
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseNumberDraft(e.target.value) }))}
              />
            </div>
          </div>
          {form.productType === 'Handmade' ? (
            <div className="form-field">
              <label htmlFor="courseId">Linked course</label>
              <select
                id="courseId"
                value={form.courseId ?? ''}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  courseId: e.target.value || null,
                }))}
              >
                <option value="">None</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          ) : null}
          {form.productType === 'Handmade' ? (
            <div className="form-field form-grid--full">
              <label>Recommended Crochet Essentials</label>
              <span className="form-hint">
                Shown under this product in the cart (max 3). Select Resell / Essentials products only.
              </span>
              {essentialsCatalog.length === 0 ? (
                <p className="form-hint" style={{ marginTop: 8 }}>
                  No Crochet Essentials products yet. Create some under Shop products → Crochet Essentials.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  {essentialsCatalog.map((essential) => {
                    const selected = (form.recommendedEssentialIds ?? []).includes(essential.id);
                    const selectedCount = (form.recommendedEssentialIds ?? []).length;
                    const disabled = !selected && selectedCount >= 3;
                    return (
                      <label
                        key={essential.id}
                        style={{
                          display: 'flex',
                          gap: 10,
                          alignItems: 'center',
                          opacity: disabled ? 0.5 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={disabled}
                          onChange={() => {
                            setForm((f) => {
                              const current = f.recommendedEssentialIds ?? [];
                              const next = selected
                                ? current.filter((id) => id !== essential.id)
                                : [...current, essential.id].slice(0, 3);
                              return { ...f, recommendedEssentialIds: next };
                            });
                          }}
                        />
                        <span>
                          {essential.name}
                          <span style={{ color: 'var(--vivi-muted)', marginLeft: 8 }}>
                            {essential.category} · ₹{essential.price}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </form>

      {isEdit && id && (
        <section className="card" style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Product photos</h2>
          <p className="page-header__subtitle" style={{ marginBottom: 8 }}>
            JPG, PNG, or WebP up to 5 MB each. Upload up to {MAX_PHOTOS} photos and choose which one is
            the main image in the shop.
          </p>
          <p
            style={{
              marginBottom: 16,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'var(--vivi-pink-soft, #fff0f5)',
              border: '1px solid var(--vivi-border-soft, #f0d4de)',
              fontSize: 13,
              lineHeight: 1.45,
              color: 'var(--vivi-ink, #221a1e)',
            }}
          >
            <strong>Recommended size: {PRODUCT_IMAGE_EDGE_PX}×{PRODUCT_IMAGE_EDGE_PX} px</strong>
            {' '}(square). Any photo you upload is auto-cropped and saved at this size for Handmade and
            Essentials.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 16,
              marginBottom: 16,
            }}
          >
            {images.map((image) => (
              <div
                key={image.id}
                style={{
                  border: image.isMain
                    ? '2px solid var(--vivi-pink)'
                    : '1px solid var(--vivi-border-soft)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 10,
                  background: '#fff',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                <div style={{ position: 'relative' }}>
                  <img
                    src={image.url}
                    alt={form.name || 'Product'}
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      objectFit: 'cover',
                      borderRadius: 8,
                      display: 'block',
                    }}
                  />
                  {image.isMain && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        background: '#e8215b',
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 999,
                      }}
                    >
                      Main
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  {!image.isMain && (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ width: '100%' }}
                      disabled={busyImageId === image.id || uploading}
                      onClick={() => void handleSetMain(image.id)}
                    >
                      {busyImageId === image.id ? 'Saving…' : 'Set as main'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ width: '100%' }}
                    disabled={busyImageId === image.id || uploading}
                    onClick={() => void handleRemove(image.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => void handleImageSelect(e.target.files)}
          />

          {uploadError && <div className="form-error" style={{ marginBottom: 12 }}>{uploadError}</div>}

          {uploading && uploadProgress && (
            <p style={{ marginBottom: 12, color: 'var(--muted)' }}>
              Uploading… {uploadProgress.percent}% ({formatFileSize(uploadProgress.loaded)} / {formatFileSize(uploadProgress.total)})
            </p>
          )}

          <button
            type="button"
            className="btn btn--ghost"
            disabled={uploading || !canAddMore}
            onClick={() => fileInputRef.current?.click()}
          >
            {canAddMore ? `Add photos (${images.length}/${MAX_PHOTOS})` : `Photo limit reached (${MAX_PHOTOS})`}
          </button>
        </section>
      )}

      {!isEdit && (
        <p className="page-header__subtitle" style={{ marginTop: 16 }}>
          Save the product first, then you can upload photos on the edit screen.
        </p>
      )}
    </>
  );
}
