import { OrderList } from '../components/OrderList';

export function OrdersPage() {
  return (
    <OrderList
      title="Product orders"
      subtitle="Online payments only. Delivery dates can be adjusted per order."
      filter={(order) => order.hasPhysicalItems}
      showDelivery
      emptyTitle="No product orders yet"
      emptyMessage="Shop checkouts with a physical item will appear here after customers pay online."
      loadErrorMessage="Failed to load orders."
    />
  );
}
