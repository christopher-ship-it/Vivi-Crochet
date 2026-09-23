import { OrderList } from '../components/OrderList';

export function CourseOrdersPage() {
  return (
    <OrderList
      title="Course & video orders"
      subtitle="Online payments only. Access is granted automatically after payment — nothing to ship."
      filter={(order) => {
        // Prefer explicit course flag from API; fall back for older list payloads.
        if (typeof order.hasCourseItems === 'boolean') {
          return order.hasCourseItems && !order.hasPhysicalItems;
        }
        return !order.hasPhysicalItems;
      }}
      showDelivery={false}
      emptyTitle="No course or video orders yet"
      emptyMessage="Course and bundle checkouts will appear here after customers pay online. Live class bookings are tracked under Bookings."
      loadErrorMessage="Failed to load orders."
    />
  );
}
