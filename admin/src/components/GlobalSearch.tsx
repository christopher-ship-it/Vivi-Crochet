import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { listAdminOrders } from '../api/orders';
import { listCourses } from '../api/courses';
import { listProducts } from '../api/products';
import type { AdminOrderListItem, Course, Product } from '../types';
import { formatInr } from '../utils/format';

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS_PER_GROUP = 6;
const DEBOUNCE_MS = 200;

interface SearchData {
  products: Product[];
  courses: Course[];
  orders: AdminOrderListItem[];
}

/**
 * Header search: looks up products, courses, and orders by name / order
 * number / customer. The three lists are fetched once (lazily, on first
 * focus or keystroke) and filtered client-side on every keystroke after
 * that, so typing doesn't hammer the API.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchStarted = useRef(false);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function ensureDataLoaded() {
    if (fetchStarted.current) return;
    fetchStarted.current = true;
    setLoading(true);
    setLoadError(false);
    Promise.all([listProducts(), listCourses(), listAdminOrders()])
      .then(([products, courses, orders]) => {
        setData({ products, courses, orders });
      })
      .catch(() => {
        setLoadError(true);
        fetchStarted.current = false; // allow a retry on the next keystroke/focus
      })
      .finally(() => setLoading(false));
  }

  const q = debouncedQuery.toLowerCase();
  const showPanel = open && debouncedQuery.length >= MIN_QUERY_LENGTH;

  const matchedProducts = useMemo(() => {
    if (!data || !showPanel) return [];
    return data.products
      .filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS_PER_GROUP);
  }, [data, q, showPanel]);

  const matchedCourses = useMemo(() => {
    if (!data || !showPanel) return [];
    return data.courses.filter((c) => c.name.toLowerCase().includes(q)).slice(0, MAX_RESULTS_PER_GROUP);
  }, [data, q, showPanel]);

  const matchedOrders = useMemo(() => {
    if (!data || !showPanel) return [];
    const rawQuery = debouncedQuery.trim();
    return data.orders
      .filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerPhone.includes(rawQuery),
      )
      .slice(0, MAX_RESULTS_PER_GROUP);
  }, [data, q, showPanel, debouncedQuery]);

  const totalMatches = matchedProducts.length + matchedCourses.length + matchedOrders.length;

  function go(path: string) {
    setOpen(false);
    setQuery('');
    navigate(path);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      event.currentTarget.blur();
      return;
    }
    if (event.key !== 'Enter') return;
    const firstProduct = matchedProducts[0];
    const firstCourse = matchedCourses[0];
    const firstOrder = matchedOrders[0];
    if (firstProduct) {
      go(`/products/${firstProduct.id}/edit`);
    } else if (firstCourse) {
      go(`/courses/${firstCourse.id}`);
    } else if (firstOrder) {
      go(`/orders/${firstOrder.id}`);
    }
  }

  return (
    <div className="global-search" ref={containerRef}>
      <input
        type="search"
        className="global-search__input"
        placeholder="Search products, courses, orders…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          ensureDataLoaded();
        }}
        onFocus={() => {
          setOpen(true);
          ensureDataLoaded();
        }}
        onKeyDown={handleKeyDown}
        aria-label="Search products, courses, and orders"
      />

      {showPanel && (
        <div className="global-search__panel" role="listbox">
          {loading && !data && <div className="global-search__status">Searching…</div>}

          {loadError && (
            <div className="global-search__status global-search__status--error">
              Couldn&apos;t load search results. Try again.
            </div>
          )}

          {!loading && data && totalMatches === 0 && !loadError && (
            <div className="global-search__status">No results for &ldquo;{debouncedQuery}&rdquo;</div>
          )}

          {matchedProducts.length > 0 && (
            <div className="global-search__group">
              <div className="global-search__group-title">Products</div>
              {matchedProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="global-search__item"
                  onClick={() => go(`/products/${product.id}/edit`)}
                >
                  <span className="global-search__item-title">{product.name}</span>
                  <span className="global-search__item-meta">
                    {product.category} · {formatInr(product.price)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {matchedCourses.length > 0 && (
            <div className="global-search__group">
              <div className="global-search__group-title">Courses</div>
              {matchedCourses.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  className="global-search__item"
                  onClick={() => go(`/courses/${course.id}`)}
                >
                  <span className="global-search__item-title">{course.name}</span>
                  <span className="global-search__item-meta">
                    {course.status} · {course.videoCount} video{course.videoCount === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {matchedOrders.length > 0 && (
            <div className="global-search__group">
              <div className="global-search__group-title">Orders</div>
              {matchedOrders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className="global-search__item"
                  onClick={() => go(`/orders/${order.id}`)}
                >
                  <span className="global-search__item-title">
                    #{order.orderNumber} · {order.customerName}
                  </span>
                  <span className="global-search__item-meta">
                    {order.status} · {formatInr(order.totalAmount)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
