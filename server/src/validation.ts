import { z } from 'zod';

const toTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : value);
const optionalString = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}, z.string().min(1, 'This field is required').optional());

export function getZodErrorMessage(error: z.ZodError) {
  return error.issues.map((issue) => issue.message).join('; ');
}

export const loginSchema = z.object({
  email: z.preprocess(toTrimmedString, z.string().trim().email('Enter a valid email address')),
  password: z.preprocess(toTrimmedString, z.string().trim().min(8, 'Password must be at least 8 characters')),
});

export const customerSchema = z.object({
  name: z.preprocess(toTrimmedString, z.string().min(2, 'Customer name is required')).refine((value) => value.trim().length > 1, 'Customer name is required'),
  phone: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(20, 'Phone cannot exceed 20 characters').regex(/^$|^[+()\-\d\s]{7,20}$/, 'Enter a valid phone number')).optional().or(z.literal('')),
  email: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().email('Enter a valid email address').optional()).or(z.literal('')),
  organization: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(120, 'Organization is too long').optional()).or(z.literal('')),
  address: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(250, 'Address is too long').optional()).or(z.literal('')),
  notes: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(500, 'Notes are too long').optional()).or(z.literal('')),
});

export const productSchema = z.object({
  name: z.preprocess(toTrimmedString, z.string().min(2, 'Product name is required').max(120, 'Product name is too long')),
  sku: z.preprocess(toTrimmedString, z.string().min(3, 'SKU is required').max(60, 'SKU is too long')).transform((value) => value.toUpperCase()),
  barcode: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(80, 'Barcode is too long').optional()).or(z.literal('')),
  category: z.preprocess(toTrimmedString, z.string().min(2, 'Category is required').max(80, 'Category is too long')),
  brand: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(80, 'Brand is too long').optional()).or(z.literal('')),
  description: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(500, 'Description is too long').optional()).or(z.literal('')),
  unit: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().min(1, 'Unit is required').max(30, 'Unit is too long').default('pcs')),
  costPrice: z.coerce.number({ invalid_type_error: 'Cost price must be a number' }).nonnegative('Cost price cannot be negative'),
  sellingPrice: z.coerce.number({ invalid_type_error: 'Selling price must be a number' }).nonnegative('Selling price cannot be negative'),
  stock: z.coerce.number({ invalid_type_error: 'Stock must be a number' }).nonnegative('Stock cannot be negative').int('Stock must be a whole number'),
  reorderLevel: z.coerce.number({ invalid_type_error: 'Reorder level must be a number' }).nonnegative('Reorder level cannot be negative').int('Reorder level must be a whole number').optional().default(5),
  supplier: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(120, 'Supplier is too long').optional()).or(z.literal('')),
  isActive: z.boolean().optional().default(true),
});

export const categorySchema = z.object({
  name: z.preprocess(toTrimmedString, z.string().min(2, 'Category name is required').max(80, 'Category name is too long')),
  description: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(300, 'Description is too long').optional()).or(z.literal('')),
  isActive: z.boolean().optional().default(true),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contactPerson: z.string().trim().max(120).optional().default(''),
  phone: z.string().trim().max(20).regex(/^$|^[+()\-\d\s]{7,20}$/).optional().default(''),
  email: z.union([z.string().trim().email(), z.literal('')]).optional().default(''),
  address: z.string().trim().max(250).optional().default(''),
  notes: z.string().trim().max(500).optional().default(''),
});

export const purchaseSchema = z.object({
  supplierId: z.string().regex(/^[a-f\d]{24}$/i, 'Supplier id is invalid'),
  items: z.array(z.object({
    productId: z.string().regex(/^[a-f\d]{24}$/i, 'Product id is invalid'),
    quantity: z.coerce.number().int().positive(),
    unitCost: z.coerce.number().nonnegative(),
  })).min(1),
  amountPaid: z.coerce.number().nonnegative().optional().default(0),
  idempotencyKey: z.string().min(8).max(100).optional(),
});

export const userSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(200).optional(),
  role: z.enum(['owner', 'manager', 'cashier', 'printing_staff']),
});

export const serviceSchema = z.object({
  name: z.preprocess(toTrimmedString, z.string().min(2, 'Service name is required').max(100, 'Service name is too long')),
  code: z.preprocess(toTrimmedString, z.string().min(2, 'Service code is required').max(40, 'Service code is too long')),
  pricePerPage: z.coerce.number({ invalid_type_error: 'Price per page must be a number' }).nonnegative('Price per page cannot be negative'),
  basePrice: z.coerce.number({ invalid_type_error: 'Base price must be a number' }).nonnegative('Base price cannot be negative'),
  description: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(300, 'Description is too long').optional()).or(z.literal('')),
  isActive: z.boolean().optional().default(true),
});

export const expenseSchema = z.object({
  description: z.preprocess(toTrimmedString, z.string().min(3, 'Description is required').max(200, 'Description is too long')),
  category: z.preprocess(toTrimmedString, z.string().min(2, 'Category is required').max(80, 'Category is too long')),
  amount: z.coerce.number({ invalid_type_error: 'Amount must be a number' }).positive('Amount must be greater than zero'),
  date: z.coerce.date({ invalid_type_error: 'Date is invalid' }).optional(),
  paymentMethod: z.enum(['cash', 'card', 'bank_transfer', 'other']).optional().default('cash'),
  supplier: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(120, 'Supplier is too long').optional()).or(z.literal('')),
  reference: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(120, 'Reference is too long').optional()).or(z.literal('')),
  status: z.enum(['approved', 'pending']).optional().default('approved'),
});

export const settingsSchema = z.object({
  businessName: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().min(2, 'Business name is required').max(120, 'Business name is too long').optional()),
  currency: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().length(3, 'Currency must be a 3-letter ISO code').optional()),
  currencySymbol: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().min(1, 'Currency symbol is required').max(5, 'Currency symbol is too long').optional()),
  lowStockThreshold: z.coerce.number({ invalid_type_error: 'Low stock threshold must be a number' }).nonnegative('Threshold cannot be negative').int('Threshold must be a whole number').optional(),
  taxRate: z.coerce.number({ invalid_type_error: 'Tax rate must be a number' }).nonnegative('Tax rate cannot be negative').max(100, 'Tax rate cannot exceed 100').optional(),
  invoicePrefix: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().min(2, 'Invoice prefix is required').max(12, 'Invoice prefix is too long').optional()),
});

export const dashboardQuerySchema = z.object({
  range: z.enum(['today', 'daily', 'weekly', 'monthly', 'yearly', '7d', '30d', 'month', 'custom']).optional().default('today'),
  from: z.string().datetime({ message: 'Start date is invalid' }).optional(),
  to: z.string().datetime({ message: 'End date is invalid' }).optional(),
}).refine((query) => {
  if (query.range === 'custom' && (!query.from || !query.to)) return false;
  if (query.from && query.to) return new Date(query.from).getTime() < new Date(query.to).getTime();
  return true;
}, { message: 'A valid start and end date are required' });

export const saleItemSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  quantity: z.coerce.number({ invalid_type_error: 'Quantity must be a number' }).int('Quantity must be a whole number').positive('Quantity must be greater than zero'),
  unitPrice: z.coerce.number({ invalid_type_error: 'Unit price must be a number' }).nonnegative('Unit price cannot be negative').optional(),
});

export const saleSchema = z.object({
  items: z.array(saleItemSchema).min(1, 'At least one item is required'),
  customerId: z.preprocess((value) => (value === '' ? undefined : value), z.string().regex(/^[a-f\d]{24}$/i, 'Customer id is invalid').optional()),
  paymentMethod: z.enum(['cash', 'card', 'bank_transfer', 'other']).optional().default('cash'),
  amountPaid: z.coerce.number({ invalid_type_error: 'Amount paid must be a number' }).nonnegative('Amount paid cannot be negative').optional().default(0),
  discount: z.coerce.number({ invalid_type_error: 'Discount must be a number' }).nonnegative('Discount cannot be negative').optional().default(0),
  idempotencyKey: z.string().min(8).max(100).optional(),
});

export const printingOrderSchema = z.object({
  customerName: z.preprocess(toTrimmedString, z.string().min(2, 'Customer name is required').max(100, 'Customer name is too long')),
  customerPhone: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(20, 'Phone is too long').regex(/^$|^[+()\-\d\s]{7,20}$/, 'Enter a valid phone number').optional()).or(z.literal('')),
  serviceId: z.string().regex(/^[a-f\d]{24}$/i, 'Print service id is invalid'),
  pages: z.coerce.number({ invalid_type_error: 'Page count must be a number' }).int('Page count must be a whole number').positive('Page count must be greater than zero').optional().default(1),
  copies: z.coerce.number({ invalid_type_error: 'Copies must be a number' }).int('Copies must be a whole number').positive('Copies must be greater than zero').optional().default(1),
  colorMode: z.enum(['black-white', 'color']).optional().default('black-white'),
  paperSize: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().min(1, 'Paper size is required').max(30, 'Paper size is too long').optional()).or(z.literal('A4')),
  urgency: z.enum(['normal', 'urgent', 'express']).optional().default('normal'),
  instructions: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(500, 'Instructions are too long').optional()).or(z.literal('')),
  amountPaid: z.coerce.number({ invalid_type_error: 'Amount paid must be a number' }).nonnegative('Amount paid cannot be negative').optional().default(0),
});
