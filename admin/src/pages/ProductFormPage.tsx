import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  completeProductImageUpload,
  createProduct,
  deleteProduct,
  deleteProductImage,
  getProduct,
  listProductCategories,
  listProducts,
  publishProduct,
  requestProductImageUploadUrl,
  setProductMainImage,
  unpublishProduct,
  updateProduct,
} from '../api/products';
import { listCourses } from '../api/courses';
import { ApiClientError } from '../api/client';
import type { Course, Product, ProductImage, ProductRequest, ProductType, ProductVariantSummary } from '../types';
import { formatFileSize, formatInr, validateImageFile } from '../utils/format';
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
  productCode: '',
  category: '',
  description: '',
  price: '',
  mrp: null,
  spec1: '',
  spec2: '',
  ballWeight: '',
  yarnLength: '',
  crochetHookSize: '',
  colourName: '',
  colourHex: '',
  parentProductId: null,
  variantOptionName: 'Colour',
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
  const parentFromQuery = searchParams.get('parent');

  const [form, setForm] = useState<ProductFormState>(() => ({
    ...emptyForm,
    productType: initialProductType(searchParams),
    parentProductId: parentFromQuery,
    variantOptionName: parentFromQuery ? null : 'Colour',
  }));
  const [categories, setCategories] = useState<string[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [essentialsCatalog, setEssentialsCatalog] = useState<Product[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [variants, setVariants] = useState<ProductVariantSummary[]>([]);
  const [parentListing, setParentListing] = useState<Product | null>(null);
  const [loading, setLoading] = useState(isEdit || Boolean(parentFromQuery));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busyImageId, setBusyImageId] = useState<string | null>(null);
  const [variantActionId, setVariantActionId] = useState<string | null>(null);

  const isVariant = Boolean(form.parentProductId);
  const isEssentialsParent = form.productType === 'Resell' && !isVariant;
  const hasVariants = variants.length > 0;
  /** Parent with colour SKUs: SKU fields live on variants. */
  const skuOnVariants = isEssentialsParent && hasVariants;

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
    if (!parentFromQuery || id) return;
    let cancelled = false;
    async function loadParent() {
      setLoading(true);
      try {
        const parent = await getProduct(parentFromQuery!);
        if (cancelled) return;
        setParentListing(parent);
        setForm((f) => ({
          ...f,
          name: parent.name,
          category: parent.category,
          description: parent.description ?? '',
          ballWeight: parent.ballWeight ?? '',
          yarnLength: parent.yarnLength ?? '',
          crochetHookSize: parent.crochetHookSize ?? '',
          productType: parent.productType ?? 'Resell',
          parentProductId: parent.id,
          variantOptionName: null,
          price: '',
          availableStock: '',
          productCode: '',
          colourName: '',
          colourHex: '',
          sortOrder: parent.variants?.length ?? 0,
        }));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load parent product.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadParent();
    return () => { cancelled = true; };
  }, [parentFromQuery, id]);

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
          productCode: product.productCode ?? '',
          category: product.category,
          description: product.description ?? '',
          price: product.parentProductId ? product.price : (product.variants?.length ? 0 : product.price),
          mrp: product.mrp ?? null,
          spec1: product.spec1 ?? '',
          spec2: product.spec2 ?? '',
          ballWeight: product.ballWeight ?? '',
          yarnLength: product.yarnLength ?? '',
          crochetHookSize: product.crochetHookSize ?? '',
          colourName: product.colourName ?? '',
          colourHex: product.colourHex ?? '',
          parentProductId: product.parentProductId ?? null,
          variantOptionName: product.variantOptionName ?? (product.parentProductId ? null : 'Colour'),
          courseId: product.courseId ?? null,
          sortOrder: product.sortOrder,
          productType: product.productType ?? 'Handmade',
          availableStock: product.parentProductId
            ? (product.availableStock ?? 0)
            : (product.variants?.length ? 0 : (product.availableStock ?? 0)),
          recommendedEssentialIds: (product.recommendedEssentials ?? []).map((e) => e.id),
        });
        setVariants(product.variants ?? []);
        setImages(imagesFromProduct(product));
        if (product.parentProductId) {
          getProduct(product.parentProductId)
            .then((p) => { if (!cancelled) setParentListing(p); })
            .catch(() => { if (!cancelled) setParentListing(null); });
        } else {
          setParentListing(null);
        }
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
    const priceValue = skuOnVariants ? 0 : form.price;
    const stockValue = skuOnVariants ? 0 : form.availableStock;
    if (priceValue === '' || priceValue < 0) {
      setError('Enter a valid price (₹).');
      return;
    }
    if (stockValue === '' || stockValue < 0) {
      setError('Enter available stock (0 or more).');
      return;
    }
    if (isVariant && !form.colourName?.trim()) {
      setError('Enter a colour / option name for this variant.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload: ProductRequest = {
      ...form,
      price: priceValue,
      availableStock: Math.max(0, Math.floor(stockValue)),
      sortOrder: form.sortOrder === '' ? 0 : form.sortOrder,
      description: form.description?.trim() || null,
      productCode: skuOnVariants ? null : (form.productCode?.trim() || null),
      parentProductId: form.parentProductId || null,
      variantOptionName: isEssentialsParent
        ? (form.variantOptionName?.trim() || 'Colour')
        : null,
      spec1: form.spec1?.trim() || null,
      spec2: form.spec2?.trim() || null,
      ballWeight: form.productType === 'Resell' && !isVariant ? (form.ballWeight?.trim() || null) : null,
      yarnLength: form.productType === 'Resell' && !isVariant ? (form.yarnLength?.trim() || null) : null,
      crochetHookSize: form.productType === 'Resell' && !isVariant ? (form.crochetHookSize?.trim() || null) : null,
      colourName: form.productType === 'Resell' ? (form.colourName?.trim() || null) : null,
      colourHex: form.productType === 'Resell' ? (form.colourHex?.trim() || null) : null,
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
        navigate(isVariant && form.parentProductId
          ? `/products/${form.parentProductId}/edit`
          : '/products');
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

  async function reloadVariants() {
    if (!id || isVariant) return;
    const product = await getProduct(id);
    setVariants(product.variants ?? []);
  }

  async function handleVariantPublishToggle(variant: ProductVariantSummary) {
    setVariantActionId(variant.id);
    try {
      if (variant.status === 'Published') await unpublishProduct(variant.id);
      else await publishProduct(variant.id);
      await reloadVariants();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update variant status.');
    } finally {
      setVariantActionId(null);
    }
  }

  async function handleVariantDelete(variant: ProductVariantSummary) {
    if (!await confirmDialog(`Delete variant "${variant.colourName ?? variant.productCode ?? variant.id}"?`)) return;
    setVariantActionId(variant.id);
    try {
      await deleteProduct(variant.id);
      await reloadVariants();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not delete variant.');
    } finally {
      setVariantActionId(null);
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
  const backHref = isVariant && form.parentProductId
    ? `/products/${form.parentProductId}/edit`
    : '/products';

  return (
    <>
      <header className="page-header page-header--compact">
        <div>
          <h1 className="page-header__title">
            {isVariant
              ? (isEdit ? 'Edit variant' : 'New variant')
              : (isEdit ? 'Edit product' : 'New product')}
            {' · '}
            {form.productType === 'Resell' ? 'Crochet Essentials' : 'Handmade Collection'}
          </h1>
          <p className="page-header__subtitle">
            {isVariant
              ? `SKU under ${parentListing?.name ?? 'parent listing'} — customers pick this colour on the product page`
              : isEdit
                ? 'Update shop listing details and photos'
                : 'Products are created as Draft until you publish'}
          </p>
        </div>
        <div className="page-header__actions">
          <Link to={backHref} className="btn btn--ghost">Cancel</Link>
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
              placeholder="e.g. Yarn – Geire"
              value={form.name}
              disabled={isVariant}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          {!skuOnVariants ? (
            <div className="form-field">
              <label htmlFor="productCode">Product code {isVariant ? '' : '(optional)'}</label>
              <input
                id="productCode"
                maxLength={40}
                placeholder="e.g. DIS039"
                value={form.productCode ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, productCode: e.target.value }))}
              />
            </div>
          ) : null}
          <div className={`form-field ${skuOnVariants ? 'span-2' : 'span-2'}`}>
            <label htmlFor="category">Category</label>
            <input
              id="category"
              required
              list="product-categories"
              placeholder="Pick or type a category"
              value={form.category}
              disabled={isVariant}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
            <datalist id="product-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          {isEssentialsParent ? (
            <div className="form-field span-2">
              <label htmlFor="variantOptionName">Variant option label</label>
              <input
                id="variantOptionName"
                maxLength={40}
                placeholder="e.g. Colour"
                value={form.variantOptionName ?? 'Colour'}
                onChange={(e) => setForm((f) => ({ ...f, variantOptionName: e.target.value }))}
              />
            </div>
          ) : null}

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

          {!skuOnVariants ? (
            <>
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
            </>
          ) : (
            <div className="form-field span-6">
              <div className="alert alert--info">
                Price, stock, product code and colour are managed on each variant below.
              </div>
            </div>
          )}
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
          {form.productType === 'Resell' && !isVariant ? (
            <>
              <div className="form-field">
                <label htmlFor="ballWeight">Ball weight</label>
                <input
                  id="ballWeight"
                  maxLength={40}
                  placeholder="e.g. 50 g"
                  value={form.ballWeight ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, ballWeight: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label htmlFor="yarnLength">Yarn length</label>
                <input
                  id="yarnLength"
                  maxLength={40}
                  placeholder="e.g. 120 m"
                  value={form.yarnLength ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, yarnLength: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label htmlFor="crochetHookSize">Crochet hook size</label>
                <input
                  id="crochetHookSize"
                  maxLength={40}
                  placeholder="e.g. 4 mm"
                  value={form.crochetHookSize ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, crochetHookSize: e.target.value }))}
                />
              </div>
            </>
          ) : null}
          {form.productType === 'Resell' && (isVariant || !skuOnVariants) ? (
            <>
              <div className="form-field">
                <label htmlFor="colourName">
                  {form.variantOptionName || parentListing?.variantOptionName || 'Colour'} name
                </label>
                <input
                  id="colourName"
                  required={isVariant}
                  maxLength={40}
                  placeholder="e.g. Cream"
                  value={form.colourName ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, colourName: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label htmlFor="colourHex">Swatch colour</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    id="colourHex"
                    type="color"
                    aria-label="Swatch colour"
                    value={/^#[0-9a-f]{6}$/i.test(form.colourHex ?? '') ? (form.colourHex as string) : '#cccccc'}
                    onChange={(e) => setForm((f) => ({ ...f, colourHex: e.target.value.toUpperCase() }))}
                    style={{ width: 48, padding: 2 }}
                  />
                  <span>{form.colourHex || 'Not set'}</span>
                  {form.colourHex ? (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setForm((f) => ({ ...f, colourHex: '' }))}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
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
            {saving ? 'Saving…' : isEdit ? 'Save changes' : isVariant ? 'Create variant' : 'Create product'}
          </button>
          <Link to={backHref} className="btn btn--ghost">Cancel</Link>
          {!isEdit ? (
            <span className="form-hint form-actions__note">
              Save first, then add photos on the edit screen.
            </span>
          ) : null}
        </div>
      </form>

      {isEdit && id && isEssentialsParent ? (
        <section className="card">
          <div className="card__header">
            <div>
              <h2 className="card__title">
                {form.variantOptionName || 'Colour'} variants
              </h2>
              <p className="card__subtitle">
                Each row is a sellable SKU (own code, price, stock, photo). Shoppers pick one on the product page.
              </p>
            </div>
            <Link to={`/products/new?type=Resell&parent=${id}`} className="btn btn--primary btn--sm">
              + Add variant
            </Link>
          </div>
          {variants.length === 0 ? (
            <p className="form-hint">No variants yet. Add colours such as Red (DIS039), Black (DIS014).</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Option</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {variants.map((variant) => (
                    <tr key={variant.id}>
                      <td>{variant.productCode ?? '—'}</td>
                      <td>
                        <div className="cell-media">
                          {variant.imageUrl
                            ? <img src={variant.imageUrl} alt="" className="thumb-sm" />
                            : variant.colourHex
                              ? <span className="thumb-sm" style={{ background: variant.colourHex, display: 'inline-block' }} />
                              : (
                                <span
                                  className="thumb-sm"
                                  style={{
                                    display: 'inline-grid',
                                    placeItems: 'center',
                                    background: 'var(--vivi-canvas)',
                                    fontWeight: 700,
                                  }}
                                >
                                  {(variant.colourName ?? '?').charAt(0)}
                                </span>
                              )}
                          <span>{variant.colourName ?? '—'}</span>
                        </div>
                      </td>
                      <td>{formatInr(variant.price)}</td>
                      <td>{variant.availableStock <= 0 ? 'OUT OF STOCK' : variant.availableStock}</td>
                      <td>
                        <span className={`badge badge--${variant.status.toLowerCase()}`}>
                          {variant.status}
                        </span>
                      </td>
                      <td>
                        <div className="data-table__actions">
                          <Link to={`/products/${variant.id}/edit`} className="btn btn--ghost btn--sm">Edit</Link>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={variantActionId === variant.id}
                            onClick={() => void handleVariantPublishToggle(variant)}
                          >
                            {variant.status === 'Published' ? 'Unpublish' : 'Publish'}
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            disabled={variantActionId === variant.id}
                            onClick={() => void handleVariantDelete(variant)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

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
