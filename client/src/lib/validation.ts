import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().trim().min(8, 'Password must be at least 8 characters'),
});

export const customerSchema = z.object({
  name: z.string().trim().min(2, 'Customer name is required').max(120, 'Customer name is too long'),
  phone: z.string().trim().max(20, 'Phone is too long').regex(/^$|^[+()\-\d\s]{7,20}$/, 'Enter a valid phone number').optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email address').optional().or(z.literal('')),
  organization: z.string().trim().max(120, 'Organization is too long').optional().or(z.literal('')),
  address: z.string().trim().max(250, 'Address is too long').optional().or(z.literal('')),
});

export const productSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required').max(120, 'Product name is too long'),
  sku: z.string().trim().min(3, 'SKU is required').max(60, 'SKU is too long'),
  category: z.string().trim().min(2, 'Category is required').max(80, 'Category is too long'),
  sellingPrice: z.coerce.number({ invalid_type_error: 'Selling price must be a number' }).nonnegative('Selling price cannot be negative'),
  costPrice: z.coerce.number({ invalid_type_error: 'Cost price must be a number' }).nonnegative('Cost price cannot be negative'),
  stock: z.coerce.number({ invalid_type_error: 'Stock must be a number' }).int('Stock must be a whole number').nonnegative('Stock cannot be negative'),
});
