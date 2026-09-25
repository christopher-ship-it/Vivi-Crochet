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
import { confirmDialog } from '../components/AppDialog';

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
    if (!await confirmDialog('Remove this photo from the product?')) return;
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
      <header className="page-header page-header--compact">
        <div>
          <h1 className="page-header__title">
            {isEdit ? 'Edit product' : 'New product'}
            {' · '}
            {form.productType === 'Resell' ? 'Crochet Essentials' : 'Handmade Collection'}
          </h1>
          <p className="page-header__subtitle">
            {isEdit ? 'Update shop listing details and photos' : 'Products are created as Draft until you publish'}
          </p>
        </div>
        <div className="page-header__actions">
          <Link to="/products" className="btn btn--ghost">Cancel</Link>
        </div>
      </header>

      <form className="card form-dense" onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}

        <div className="form-grid-6">
          <div className="form-field span-4">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              required
              maxLength={160}
              placeholder="e.g. Sunflower tote bag"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="form-field span-2">
            <label htmlFor="category">Category</label>
            <input
              id="category"
              required
              list="product-categories"
              placeholder="Pick or type a category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
            <datalist id="product-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          {form.productType === 'Handmade' ? (
            <div className="form-field span-6">
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

          <div className="form-field">
            <label htmlFor="price">Price</label>
            <div className="input-affix">
              <span className="input-affix__prefix">₹</span>
              <input
                id="price"
                type="number"
                required
                min={0}
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: parseNumberDraft(e.target.value) }))}
              />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="mrp">MRP</label>
            <div className="input-affix">
              <span className="input-affix__prefix">₹</span>
              <input
                id="mrp"
                type="number"
                min={0}
                placeholder="Strike-through"
                value={form.mrp ?? ''}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  mrp: e.target.value === '' ? null : Number(e.target.value),
                }))}
              />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="availableStock" title="Maximum quantity customers can purchase.">
              Stock
            </label>
            <input
              id="availableStock"
              type="number"
              required
              min={0}
              step={1}
              title="Maximum quantity customers can purchase."
              value={form.availableStock}
              onChange={(e) => setForm((f) => ({
                ...f,
                availableStock: parseNumberDraft(e.target.value),
              }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="spec1">Spec 1</label>
            <input
              id="spec1"
              placeholder="e.g. 30 × 40 cm"
              value={form.spec1 ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, spec1: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="spec2">Spec 2</label>
            <input
              id="spec2"
              placeholder="e.g. 100% cotton"
              value={form.spec2 ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, spec2: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="sortOrder" title="Lower numbers appear first.">Sort order</label>
            <input
              id="sortOrder"
              type="number"
              title="Lower numbers appear first."
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseNumberDraft(e.target.value) }))}
            />
          </div>

          <div className="form-field span-6">
            <div className="form-label-row">
              <label htmlFor="description">Description</label>
              <span className="form-hint">{(form.description ?? '').length}/2000</span>
            </div>
            <textarea
              id="description"
              rows={2}
              maxLength={2000}
              placeholder="Materials, size, care instructions…"
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          {form.productType === 'Handmade' ? (
            <div className="form-field span-6">
              <div className="form-label-row">
                <span className="form-label">Recommended Crochet Essentials</span>
                <span className="form-hint">
                  Shown in the cart · {(form.recommendedEssentialIds ?? []).length}/3 selected
                </span>
              </div>
              {essentialsCatalog.length === 0 ? (
                <div className="alert alert--info">
                  No Crochet Essentials products yet. Create some under Shop products → Crochet Essentials.
                </div>
              ) : (
                <div className="check-list check-list--compact">
                  {essentialsCatalog.map((essential) => {
                    const selected = (form.recommendedEssentialIds ?? []).includes(essential.id);
                    const selectedCount = (form.recommendedEssentialIds ?? []).length;
                    const disabled = !selected && selectedCount >= 3;
                    return (
                      <label key={essential.id} className="choice">
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
                        <span className="cell-clip">{essential.name}</span>
                        <span className="choice__meta">₹{essential.price}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="form-actions form-actions--sticky">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
          </button>
          <Link to="/products" className="btn btn--ghost">Cancel</Link>
          {!isEdit ? (
            <span className="form-hint form-actions__note">
              Save first, then add photos on the edit screen.
            </span>
          ) : null}
        </div>
      </form>

      {isEdit && id && (
        <section className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">Product photos</h2>
              <p className="card__subtitle">
                JPG, PNG, or WebP up to 5 MB each. Upload up to {MAX_PHOTOS} photos and choose which one is
                the main image in the shop.
              </p>
            </div>
            <span className="badge badge--draft">{images.length}/{MAX_PHOTOS}</span>
          </div>
          <div className="alert alert--info alert--spaced">
            <span>
              <strong>Recommended size: {PRODUCT_IMAGE_EDGE_PX}×{PRODUCT_IMAGE_EDGE_PX} px</strong>
              {' '}(square). Any photo you upload is auto-cropped and saved at this size for Handmade and
              Essentials.
            </span>
          </div>

          {images.length > 0 ? (
            <div className="photo-grid">
              {images.map((image) => (
                <div
                  key={image.id}
                  className={`photo-card${image.isMain ? ' photo-card--main' : ''}`}
                >
                  <div className="photo-card__media">
                    <img src={image.url} alt={form.name || 'Product'} />
                    {image.isMain && <span className="photo-card__tag">Main</span>}
                  </div>
                  <div className="photo-card__actions">
                    {!image.isMain && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm btn--block"
                        disabled={busyImageId === image.id || uploading}
                        onClick={() => void handleSetMain(image.id)}
                      >
                        {busyImageId === image.id ? 'Saving…' : 'Set as main'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--danger btn--sm btn--block"
                      disabled={busyImageId === image.id || uploading}
                      onClick={() => void handleRemove(image.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => void handleImageSelect(e.target.files)}
          />

          {uploadError && <div className="form-error">{uploadError}</div>}

          <div className="upload-drop">
            {uploading && uploadProgress ? (
              <div style={{ width: '100%' }}>
                <p className="form-hint" style={{ marginBottom: 8 }}>
                  Uploading… {uploadProgress.percent}% ({formatFileSize(uploadProgress.loaded)} / {formatFileSize(uploadProgress.total)})
                </p>
                <div className="progress-bar">
                  <div className="progress-bar__fill" style={{ width: `${uploadProgress.percent}%` }} />
                </div>
              </div>
            ) : (
              <p className="form-hint">
                {images.length === 0 ? 'No photos yet. ' : ''}Select one or more images to add to the gallery.
              </p>
            )}
            <button
              type="button"
              className="btn btn--primary"
              disabled={uploading || !canAddMore}
              onClick={() => fileInputRef.current?.click()}
            >
              {canAddMore ? `Add photos (${images.length}/${MAX_PHOTOS})` : `Photo limit reached (${MAX_PHOTOS})`}
            </button>
          </div>
        </section>
      )}

    </>
  );
}
