export type UserRole = 'owner' | 'manager' | 'cashier' | 'printing_staff';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface Product {
  _id: string;
  name: string;
  sku: string;
  category: string;
  sellingPrice: number;
  costPrice: number;
  stock: number;
  reorderLevel?: number;
  supplier?: string;
}

export interface Sale {
  _id: string;
  transactionNumber: string;
  items?: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
  total: number;
  amountPaid: number;
  balance: number;
  createdAt: string;
  status: string;
}

export interface PrintingOrder {
  _id: string;
  orderNumber: string;
  customerName: string;
  serviceName: string;
  total: number;
  amountPaid: number;
  balance: number;
  status: string;
}
