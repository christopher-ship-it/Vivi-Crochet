export type CheckoutAddressDraft = {
  fullName: string;
  phone: string;
  address1: string;
  address2: string;
  landmark: string;
  city: string;
  state: string;
  pinCode: string;
  saveAddress: boolean;
};

let editInitial: Partial<CheckoutAddressDraft> | null = null;
let committed: CheckoutAddressDraft | null = null;

export function beginCheckoutAddressEdit(initial?: Partial<CheckoutAddressDraft>) {
  editInitial = initial ?? null;
  committed = null;
}

export function readCheckoutAddressEditInitial(): Partial<CheckoutAddressDraft> | null {
  const value = editInitial;
  editInitial = null;
  return value;
}

export function commitCheckoutAddress(draft: CheckoutAddressDraft) {
  committed = draft;
}

export function consumeCheckoutAddress(): CheckoutAddressDraft | null {
  const value = committed;
  committed = null;
  return value;
}
