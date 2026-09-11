import { OrderList } from '../components/OrderList';

export function CourseOrdersPage() {
  return (
    <OrderList
      title="Course & video orders"
      subtitle="Online payments only. Access is granted automatically after payment — nothing to ship."
      filter={(order) => !order.hasPhysicalItems}
      showDelivery={false}
      emptyTitle="No course or video orders yet"
      emptyMessage="Course, bundle, and live class checkouts will appear here after customers pay online."
      loadErrorMessage="Failed to load orders."
    />
  );
}
