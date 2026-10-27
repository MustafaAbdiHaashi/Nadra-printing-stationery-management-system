import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  categorySchema as categoryValidationSchema,
  customerSchema as customerValidationSchema,
  dashboardQuerySchema,
  expenseSchema as expenseValidationSchema,
  getZodErrorMessage,
  loginSchema,
  purchaseSchema as purchaseValidationSchema,
  printingOrderSchema as printingOrderValidationSchema,
  productSchema as productValidationSchema,
  saleSchema as saleValidationSchema,
  serviceSchema as serviceValidationSchema,
  settingsSchema as settingsValidationSchema,
  supplierSchema as supplierValidationSchema,
  userSchema as userValidationSchema,
} from './validation.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET ?? '';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!JWT_SECRET) {
  throw new Error('Missing JWT_SECRET. Set JWT_SECRET in server/.env before starting the server.');
}

const ROLE_ORDER = ['owner', 'manager', 'cashier', 'printing_staff'] as const;
const PAYMENT_TYPES = ['cash', 'card', 'bank_transfer', 'other'] as const;
const ORDER_STATUSES = ['Received', 'Awaiting payment', 'Queued', 'In progress', 'Ready for collection', 'Completed', 'Cancelled'] as const;

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

interface IUserDocument extends mongoose.Document {
  name: string;
  email: string;
  password: string;
  role: (typeof ROLE_ORDER)[number];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: (typeof ROLE_ORDER)[number];
    name: string;
  };
}

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, unique: true, trim: true },
    barcode: { type: String, default: '', trim: true },
    category: { type: String, default: 'General' },
    brand: { type: String, default: '' },
    description: { type: String, default: '' },
    unit: { type: String, default: 'pcs' },
    costPrice: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 5, min: 0 },
    supplier: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    archiveReason: { type: String, default: '' },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    archiveReason: { type: String, default: '' },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    organization: { type: String, default: '' },
    address: { type: String, default: '' },
    notes: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    archiveReason: { type: String, default: '' },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ROLE_ORDER, default: 'cashier' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const saleItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    sku: { type: String, default: '' },
  },
  { _id: false },
);

const saleSchema = new mongoose.Schema(
  {
    transactionNumber: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [saleItemSchema],
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    paymentMethod: { type: String, enum: PAYMENT_TYPES, default: 'cash' },
    status: { type: String, default: 'completed' },
    notes: { type: String, default: '' },
    idempotencyKey: { type: String, default: undefined, unique: true, sparse: true },
    voidedAt: { type: Date, default: null },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    voidReason: { type: String, default: '' },
  },
  { timestamps: true },
);

const paymentSchema = new mongoose.Schema(
  {
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: PAYMENT_TYPES, required: true },
    status: { type: String, enum: ['received', 'pending', 'cancelled', 'reversed'], default: 'received' },
    reference: { type: String, default: '' },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reversedAt: { type: Date, default: null },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reversalReason: { type: String, default: '' },
  },
  { timestamps: true },
);

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactPerson: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    notes: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    archiveReason: { type: String, default: '' },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const purchaseSchema = new mongoose.Schema(
  {
    purchaseNumber: { type: String, required: true, unique: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        unitCost: { type: Number, required: true, min: 0 },
        total: { type: Number, required: true, min: 0 },
      },
    ],
    subtotal: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    status: { type: String, default: 'received' },
    idempotencyKey: { type: String, default: undefined, unique: true, sparse: true },
    receivedAt: { type: Date, default: null },
    reversedAt: { type: Date, default: null },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reversalReason: { type: String, default: '' },
    payments: [
      {
        amount: { type: Number, required: true, min: 0 },
        method: { type: String, enum: PAYMENT_TYPES, required: true },
        reference: { type: String, default: '' },
        status: { type: String, enum: ['received', 'reversed'], default: 'received' },
        receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        receivedAt: { type: Date, default: Date.now },
      },
    ],
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

const stockMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true },
    type: { type: String, enum: ['in', 'out', 'adjustment', 'sale', 'purchase'], required: true },
    reason: { type: String, default: '' },
    reference: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

const printingServiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    pricePerPage: { type: Number, default: 0 },
    basePrice: { type: Number, default: 0 },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    archiveReason: { type: String, default: '' },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const printingOrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String, default: '' },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'PrintingService', required: true },
    serviceName: { type: String, required: true },
    pages: { type: Number, default: 1, min: 1 },
    copies: { type: Number, default: 1, min: 1 },
    paperSize: { type: String, default: 'A4' },
    colorMode: { type: String, enum: ['black-white', 'color'], default: 'black-white' },
    duplex: { type: String, enum: ['single', 'double'], default: 'single' },
    paperType: { type: String, default: 'Plain' },
    instructions: { type: String, default: '' },
    urgency: { type: String, enum: ['normal', 'urgent', 'express'], default: 'normal' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ORDER_STATUSES, default: 'Received' },
    pricePerPage: { type: Number, default: 0 },
    serviceCharge: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancellationReason: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    payments: [
      {
        amount: { type: Number, required: true, min: 0 },
        method: { type: String, enum: PAYMENT_TYPES, required: true },
        reference: { type: String, default: '' },
        receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        receivedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

const expenseSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    category: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, default: Date.now },
    paymentMethod: { type: String, enum: PAYMENT_TYPES, default: 'cash' },
    supplier: { type: String, default: '' },
    reference: { type: String, default: '' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['approved', 'pending', 'void'], default: 'approved' },
    voidedAt: { type: Date, default: null },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    voidReason: { type: String, default: '' },
  },
  { timestamps: true },
);

const businessSettingsSchema = new mongoose.Schema(
  {
    businessName: { type: String, default: 'Nadra Printing & Stationery' },
    logoUrl: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    address: { type: String, default: '' },
    currency: { type: String, default: 'USD' },
    currencySymbol: { type: String, default: '$' },
    invoicePrefix: { type: String, default: 'INV' },
    lowStockThreshold: { type: Number, default: 10 },
    taxRate: { type: Number, default: 0 },
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
  },
  { timestamps: true },
);

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, default: '' },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

const User = (mongoose.models.User as mongoose.Model<IUserDocument> | undefined) ?? mongoose.model<IUserDocument>('User', userSchema);
const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);
const Customer = mongoose.models.Customer || mongoose.model('Customer', customerSchema);
const Sale = mongoose.models.Sale || mongoose.model('Sale', saleSchema);
const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
const Supplier = mongoose.models.Supplier || mongoose.model('Supplier', supplierSchema);
const Purchase = mongoose.models.Purchase || mongoose.model('Purchase', purchaseSchema);
const StockMovement = mongoose.models.StockMovement || mongoose.model('StockMovement', stockMovementSchema);
const PrintingService = mongoose.models.PrintingService || mongoose.model('PrintingService', printingServiceSchema);
const PrintingOrder = mongoose.models.PrintingOrder || mongoose.model('PrintingOrder', printingOrderSchema);
const Expense = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
const BusinessSettings = mongoose.models.BusinessSettings || mongoose.model('BusinessSettings', businessSettingsSchema);
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

function validateMongoConfig(uri?: string) {
  const value = (uri || '').trim();
  if (!value) {
    throw new Error('Missing MONGODB_URI. Add MONGODB_URI=mongodb://localhost:27017/nadra_management to server/.env');
  }

  if (!/^mongodb(s|):\/\//.test(value)) {
    throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  }

  return value;
}

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return;

  const mongoUri = validateMongoConfig(MONGODB_URI);
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log(`Connected to MongoDB: ${new URL(mongoUri).hostname}:${new URL(mongoUri).port || 27017}/${new URL(mongoUri).pathname.replace('/', '')}`);
  } catch (error) {
    console.error('MongoDB connection failed. Ensure MongoDB is running locally and MONGODB_URI is correct.');
    throw error;
  }
}

function setupGracefulShutdown(server: import('http').Server) {
  const shutdown = async () => {
    console.log('Shutting down server...');
    await mongoose.disconnect();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function signToken(user: { id: string; email: string; role: string; name: string }) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}

function setAuthCookie(res: Response, token: string) {
  res.cookie('nadra_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

async function ensureDefaults() {
  const userCount = await User.countDocuments();
  if (userCount === 0) {
    const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;
    if (!initialAdminPassword || initialAdminPassword.length < 10) {
      throw new Error('INITIAL_ADMIN_PASSWORD must be set to at least 10 characters before creating the first admin user.');
    }

    const passwordHash = await bcrypt.hash(initialAdminPassword, 10);
    await User.create({
      name: 'Nadra Admin',
      email: 'admin@nadra.local',
      password: passwordHash,
      role: 'owner',
      isActive: true,
    });
  }

  const settingsCount = await BusinessSettings.countDocuments();
  if (settingsCount === 0) {
    await BusinessSettings.create({
      businessName: 'Nadra Printing & Stationery',
      currency: 'USD',
      currencySymbol: '$',
      invoicePrefix: 'INV',
      lowStockThreshold: 10,
      theme: 'light',
    });
  }

  const categoryCount = await Category.countDocuments();
  if (categoryCount === 0) {
    await Category.create([
      { name: 'Stationery', slug: 'stationery', description: 'Supplies' },
      { name: 'Printing', slug: 'printing', description: 'Printing related products' },
      { name: 'School Essentials', slug: 'school-essentials', description: 'School items' },
    ]);
  }

  const serviceCount = await PrintingService.countDocuments();
  if (serviceCount === 0) {
    await PrintingService.create([
      { name: 'Black & White Printing', code: 'BWP', pricePerPage: 1.5, basePrice: 5 },
      { name: 'Color Printing', code: 'COLOR', pricePerPage: 3, basePrice: 8 },
      { name: 'Photocopy', code: 'COPY', pricePerPage: 1.2, basePrice: 3 },
    ]);
  }
}

function sanitizeUser(user: IUserDocument | Record<string, unknown> | null) {
  if (!user) return null;
  const result = 'toObject' in user && typeof user.toObject === 'function' ? user.toObject() : user;
  const { password, ...safeUser } = result as Record<string, unknown>;
  return safeUser;
}

async function getCurrentUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.nadra_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  let payload: { id: string; email: string; role: string; name: string };
  try {
    payload = jwt.verify(token, JWT_SECRET) as typeof payload;
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
    return;
  }

  const user = await User.findOne({ _id: payload.id }).lean();
  if (!user || !user.isActive) {
    res.status(401).json({ message: 'User is not active' });
    return;
  }
  req.user = { id: user._id.toString(), email: user.email, role: user.role, name: user.name };
  next();
}

function requireRoles(...roles: Array<(typeof ROLE_ORDER)[number]>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: 'You do not have permission to perform this action' });
      return;
    }
    next();
  };
}

async function addAudit(action: string, entityType: string, entityId: string, userId: string, details: Record<string, unknown>) {
  await AuditLog.create({
    action,
    entityType,
    entityId,
    performedBy: userId,
    details,
  });
}

type DashboardSaleRecord = {
  _id: unknown;
  total: number;
  items: Array<{ productId: unknown; name: string; sku?: string; quantity: number; costPrice: number; total: number }>;
  createdAt: Date;
  customer?: unknown;
};
type DashboardExpenseRecord = { amount: number; date: Date };

function getFinancialTotals(sales: DashboardSaleRecord[], expenses: DashboardExpenseRecord[]) {
  const salesTotal = sales.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  const grossProfit = sales.reduce((sum, sale) => {
    const itemCost = (sale.items || []).reduce((acc, item) => acc + (Number(item.costPrice || 0) * Number(item.quantity || 0)), 0);
    return sum + (Number(sale.total) - itemCost);
  }, 0);
  return { salesTotal, expenseTotal, grossProfit, netProfit: grossProfit - expenseTotal };
}

function getBucketStart(date: Date, interval: 'hour' | 'day' | 'month') {
  const result = new Date(date);
  if (interval === 'hour') result.setMinutes(0, 0, 0);
  else if (interval === 'day') result.setHours(0, 0, 0, 0);
  else result.setDate(1), result.setHours(0, 0, 0, 0);
  return result;
}

function getBucketKey(date: Date, interval: 'hour' | 'day' | 'month') {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  if (interval === 'hour') return `${year}-${month}-${day}T${String(date.getHours()).padStart(2, '0')}`;
  if (interval === 'month') return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

async function computeDashboard(dateStart: Date, dateEnd: Date, interval: 'hour' | 'day' | 'month' = 'day') {
  const [sales, expenses, orders, activeProducts] = await Promise.all([
    Sale.find({ createdAt: { $gte: dateStart, $lt: dateEnd }, status: { $ne: 'voided' } })
      .select('total items.productId items.name items.sku items.quantity items.costPrice items.total createdAt')
      .lean<DashboardSaleRecord[]>(),
    Expense.find({ date: { $gte: dateStart, $lt: dateEnd }, status: { $ne: 'void' } }).select('amount date').lean<DashboardExpenseRecord[]>(),
    PrintingOrder.find({ createdAt: { $gte: dateStart, $lt: dateEnd } })
      .select('orderNumber customerName serviceName total status createdAt').sort({ createdAt: -1 }).lean(),
    Product.find({ isActive: true }).select('name sku category stock reorderLevel').lean(),
  ]);
  const settings = await BusinessSettings.findOne().select('lowStockThreshold').lean();
  const configuredThreshold = settings && !Array.isArray(settings) && 'lowStockThreshold' in settings
    && typeof settings.lowStockThreshold === 'number' ? settings.lowStockThreshold : 10;
  const totals = getFinancialTotals(sales, expenses);
  const lowStockProducts = activeProducts
    .filter((product) => product.stock <= (product.reorderLevel ?? configuredThreshold))
    .map((product) => ({ ...product, reorderLevel: product.reorderLevel ?? configuredThreshold }));
  const bucketByKey = new Map<string, { sales: number; expenses: number; transactions: number; products: number }>();
  const chartBuckets: Array<{ key: string; label: string; sales: number; expenses: number; transactions: number }> = [];
  let cursor = getBucketStart(dateStart, interval);
  while (cursor < dateEnd) {
    const key = getBucketKey(cursor, interval);
    bucketByKey.set(key, { sales: 0, expenses: 0, transactions: 0, products: 0 });
    chartBuckets.push({
      key,
      label: interval === 'hour'
        ? cursor.toLocaleTimeString([], { hour: 'numeric' })
        : interval === 'month'
          ? cursor.toLocaleDateString([], { month: 'short' })
          : cursor.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      sales: 0,
      expenses: 0,
      transactions: 0,
    });
    if (interval === 'hour') cursor.setHours(cursor.getHours() + 1);
    else if (interval === 'day') cursor.setDate(cursor.getDate() + 1);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  for (const sale of sales) {
    const bucket = bucketByKey.get(getBucketKey(new Date(sale.createdAt), interval));
    if (!bucket) continue;
    bucket.sales += Number(sale.total) || 0;
    bucket.transactions += 1;
    for (const item of sale.items || []) bucket.products += Number(item.quantity) || 0;
  }
  for (const expense of expenses) {
    const bucket = bucketByKey.get(getBucketKey(new Date(expense.date), interval));
    if (bucket) bucket.expenses += Number(expense.amount) || 0;
  }
  for (const bucket of chartBuckets) {
    const values = bucketByKey.get(bucket.key);
    if (values) Object.assign(bucket, values);
  }
  const pendingOrders = orders.filter((order) => order.status !== 'Completed' && order.status !== 'Cancelled').length;

  return {
    ...totals,
    salesCount: sales.length,
    pendingOrders,
    completedOrdersToday: orders.filter((order) => order.status === 'Completed').length,
    productCount: activeProducts.length,
    lowStockCount: lowStockProducts.length,
    lowStockProducts: lowStockProducts.slice(0, 8),
    recentSales: await Sale.find({ createdAt: { $gte: dateStart, $lt: dateEnd }, status: { $ne: 'voided' } })
      .sort({ createdAt: -1 }).limit(5).populate('customer', 'name').lean(),
    recentOrders: orders.slice(0, 5),
    topProducts: [...sales.reduce((products, sale) => {
      for (const item of sale.items || []) {
        const id = String(item.productId);
        const current = products.get(id) || { _id: id, name: item.name, sku: item.sku || '', quantity: 0, revenue: 0 };
        current.quantity += Number(item.quantity) || 0;
        current.revenue += Number(item.total) || 0;
        products.set(id, current);
      }
      return products;
    }, new Map<string, { _id: string; name: string; sku: string; quantity: number; revenue: number }>()).values()]
      .sort((left, right) => right.quantity - left.quantity).slice(0, 5),
    chartBuckets,
  };
}

app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'Nadra API' });
});

app.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ message: 'Invalid record id' });
    return;
  }
  next();
});

app.get('/api/v1/users', getCurrentUser, requireRoles('owner'), async (_req: Request, res: Response) => {
  const items = await User.find().select('-password').sort({ createdAt: -1 }).lean();
  res.json({ items });
});

app.post('/api/v1/users', getCurrentUser, requireRoles('owner'), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = userValidationSchema.safeParse(req.body || {});
  if (!parsed.success || !parsed.data.password || parsed.data.password.length < 10) {
    res.status(400).json({ message: parsed.success ? 'A password of at least 10 characters is required' : getZodErrorMessage(parsed.error) });
    return;
  }
  const { password, ...fields } = parsed.data;
  const user = await User.create({ ...fields, password: await bcrypt.hash(password, 10), isActive: true });
  await addAudit('user_created', 'user', String(user._id), req.user!.id, { email: user.email, role: user.role });
  res.status(201).json({ user: sanitizeUser(user) });
});

app.put('/api/v1/users/:id', getCurrentUser, requireRoles('owner'), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = userValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }
  const user = await User.findOne({ _id: req.params.id, isActive: true });
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  const { password, ...fields } = parsed.data;
  if (user.role === 'owner' && fields.role !== 'owner' && await User.countDocuments({ role: 'owner', isActive: true }) <= 1) {
    res.status(409).json({ message: 'The last active owner cannot be demoted' });
    return;
  }
  Object.assign(user, fields);
  if (password) user.password = await bcrypt.hash(password, 10);
  await user.save();
  await addAudit('user_updated', 'user', String(user._id), req.user!.id, { email: user.email, role: user.role });
  res.json({ user: sanitizeUser(user) });
});

app.delete('/api/v1/users/:id', getCurrentUser, requireRoles('owner'), async (req: AuthenticatedRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) {
    res.status(400).json({ message: 'A deactivation reason between 3 and 500 characters is required' });
    return;
  }
  if (req.params.id === req.user!.id) {
    res.status(409).json({ message: 'You cannot deactivate your own account' });
    return;
  }
  const user = await User.findOne({ _id: req.params.id, isActive: true });
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  if (user.role === 'owner' && await User.countDocuments({ role: 'owner', isActive: true }) <= 1) {
    res.status(409).json({ message: 'The last active owner cannot be deactivated' });
    return;
  }
  user.isActive = false;
  await user.save();
  await addAudit('user_deactivated', 'user', String(user._id), req.user!.id, { reason });
  res.json({ user: sanitizeUser(user) });
});

app.post('/api/v1/auth/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }

  const { email, password } = parsed.data;
  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (!user || !user.isActive) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(String(password), user.password);
  if (!valid) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }

  const safeUser = sanitizeUser(user) as { _id?: string; id?: string; name: string; email: string; role: string };
  const token = signToken({ id: safeUser._id?.toString() || '', email: user.email, role: user.role, name: user.name });
  setAuthCookie(res, token);
  res.json({ user: { id: user._id.toString(), name: user.name, email: user.email, role: user.role }, token });
});

app.post('/api/v1/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('nadra_token');
  res.json({ message: 'Successfully logged out' });
});

app.get('/api/v1/auth/me', getCurrentUser, async (req: AuthenticatedRequest, res: Response) => {
  const user = await User.findById(req.user!.id).lean();
  res.json({ user: sanitizeUser(user) });
});

app.patch('/api/v1/auth/change-password', getCurrentUser, async (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ message: 'Current and new password are required' });
    return;
  }

  const user = await User.findById(req.user!.id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  const valid = await bcrypt.compare(String(currentPassword), user.password);
  if (!valid) {
    res.status(400).json({ message: 'Current password is incorrect' });
    return;
  }

  user.password = await bcrypt.hash(String(newPassword), 10);
  await user.save();
  await addAudit('password_changed', 'user', String(user._id), req.user!.id, { email: user.email });
  res.json({ message: 'Password updated successfully' });
});

app.get('/api/v1/dashboard', getCurrentUser, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = dashboardQuerySchema.safeParse(req.query || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }

  const range = parsed.data.range;
  const now = new Date();
  let start: Date;
  let end: Date;
  if (parsed.data.from && parsed.data.to) {
    start = new Date(parsed.data.from);
    end = new Date(parsed.data.to);
  } else if (range === '7d') {
    end = now;
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === '30d') {
    end = now;
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (range === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (range === 'today' || range === 'daily') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else {
    res.status(400).json({ message: 'A start and end date are required for this range' });
    return;
  }
  const interval = range === 'today' || range === 'daily'
    ? 'hour'
    : range === 'yearly' || (range === 'custom' && end.getTime() - start.getTime() > 62 * 24 * 60 * 60 * 1000)
      ? 'month'
      : 'day';
  const period = await computeDashboard(start, end, interval);
  const duration = end.getTime() - start.getTime();
  const previousStart = range === 'monthly' || range === 'month'
    ? new Date(start.getFullYear(), start.getMonth() - 1, 1)
    : range === 'yearly'
      ? new Date(start.getFullYear() - 1, start.getMonth(), start.getDate())
      : new Date(start.getTime() - duration);
  const previousEnd = range === 'monthly' || range === 'month' || range === 'yearly' ? start : new Date(start);
  const [previousSales, previousExpenses] = await Promise.all([
    Sale.find({ createdAt: { $gte: previousStart, $lt: previousEnd }, status: { $ne: 'voided' } })
      .select('total items.costPrice items.quantity').lean<DashboardSaleRecord[]>(),
    Expense.find({ date: { $gte: previousStart, $lt: previousEnd }, status: { $ne: 'void' } }).select('amount date').lean<DashboardExpenseRecord[]>(),
  ]);
  const previousTotals = getFinancialTotals(previousSales, previousExpenses);
  res.json({
    range,
    from: start.toISOString(),
    to: end.toISOString(),
    previousPeriod: { ...previousTotals, salesCount: previousSales.length },
    ...period,
  });
});

app.get('/api/v1/products', getCurrentUser, async (req: Request, res: Response) => {
  const search = String(req.query.search || '').trim();
  const filter: Record<string, unknown> = { isActive: true };
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (search) filter.$or = [
    { name: { $regex: escapedSearch, $options: 'i' } },
    { sku: { $regex: escapedSearch, $options: 'i' } },
    { barcode: { $regex: escapedSearch, $options: 'i' } },
  ];

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Product.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }).lean(),
    Product.countDocuments(filter),
  ]);

  res.json({ items, page, limit, total });
});

app.post('/api/v1/products', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = productValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }

  const { name, sku, barcode, category, sellingPrice, costPrice, stock, reorderLevel, supplier } = parsed.data;
  const duplicateSku = await Product.findOne({ sku: { $regex: `^${sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
  if (duplicateSku) {
    res.status(409).json({ message: 'A product with this SKU already exists' });
    return;
  }
  if (barcode && await Product.findOne({ barcode: { $regex: `^${barcode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } })) {
    res.status(409).json({ message: 'A product with this barcode already exists' });
    return;
  }
  const categoryExists = await Category.findOne({ name: { $regex: `^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, isActive: true });
  if (!categoryExists) {
    res.status(400).json({ message: `Category "${category}" does not exist` });
    return;
  }

  const product = await Product.create({
    name,
    sku,
    barcode: barcode || '',
    category,
    sellingPrice,
    costPrice,
    stock,
    reorderLevel,
    supplier: supplier || '',
  });

  await addAudit('product_created', 'product', String(product._id), req.user!.id, { name: product.name, sku: product.sku });
  res.status(201).json({ product });
});

app.put('/api/v1/products/:id', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = productValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }

  const product = await Product.findOne({ _id: req.params.id, isActive: true });
  if (!product) {
    res.status(404).json({ message: 'Product not found' });
    return;
  }

  const { name, sku, barcode, category, sellingPrice, costPrice, stock, reorderLevel, supplier } = parsed.data;
  const duplicateSku = await Product.findOne({ sku: { $regex: `^${sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, _id: { $ne: product._id } });
  if (duplicateSku) {
    res.status(409).json({ message: 'A product with this SKU already exists' });
    return;
  }
  if (barcode && await Product.findOne({ barcode: { $regex: `^${barcode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, _id: { $ne: product._id } })) {
    res.status(409).json({ message: 'A product with this barcode already exists' });
    return;
  }
  const categoryExists = await Category.findOne({ name: { $regex: `^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, isActive: true });
  if (!categoryExists) {
    res.status(400).json({ message: `Category "${category}" does not exist` });
    return;
  }

  Object.assign(product, { name, sku, barcode: barcode ?? product.barcode, category, sellingPrice, costPrice, stock, reorderLevel, supplier: supplier || '' });
  await product.save();
  await addAudit('product_updated', 'product', String(product._id), req.user!.id, { name, sku });
  res.json({ product });
});

app.delete('/api/v1/products/:id', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) {
    res.status(400).json({ message: 'An archive reason between 3 and 500 characters is required' });
    return;
  }
  const product = await Product.findOne({ _id: req.params.id, isActive: true });
  if (!product) {
    res.status(404).json({ message: 'Product not found' });
    return;
  }

  product.isActive = false;
  product.archivedAt = new Date();
  product.archivedBy = new mongoose.Types.ObjectId(req.user!.id);
  product.archiveReason = reason;
  await product.save();
  await addAudit('product_archived', 'product', String(product._id), req.user!.id, { reason });
  res.json({ product });
});

app.get('/api/v1/categories', getCurrentUser, async (_req: Request, res: Response) => {
  const items = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
  res.json({ items });
});

app.post('/api/v1/categories', getCurrentUser, requireRoles('owner', 'manager'), async (req: Request, res: Response) => {
  const parsed = categoryValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }

  const { name, description } = parsed.data;
  const existing = await Category.findOne({ name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
  if (existing) {
    res.status(409).json({ message: 'Category with this name already exists' });
    return;
  }

  const slug = String(name).toLowerCase().replace(/\s+/g, '-');
  const category = await Category.create({ name, slug, description: description || '' });
  res.status(201).json({ category });
});

app.put('/api/v1/categories/:id', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = categoryValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }
  const category = await Category.findOne({ _id: req.params.id, isActive: true });
  if (!category) {
    res.status(404).json({ message: 'Category not found' });
    return;
  }
  const { name, description } = parsed.data;
  const duplicate = await Category.findOne({ _id: { $ne: category._id }, name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
  if (duplicate) {
    res.status(409).json({ message: 'Category with this name already exists' });
    return;
  }
  category.name = name;
  category.slug = name.toLowerCase().replace(/\s+/g, '-');
  category.description = description || '';
  await category.save();
  await addAudit('category_updated', 'category', String(category._id), req.user!.id, { name });
  res.json({ category });
});

app.delete('/api/v1/categories/:id', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) {
    res.status(400).json({ message: 'An archive reason between 3 and 500 characters is required' });
    return;
  }
  const category = await Category.findOne({ _id: req.params.id, isActive: true });
  if (!category) {
    res.status(404).json({ message: 'Category not found' });
    return;
  }
  if (await Product.exists({ category: category.name, isActive: true })) {
    res.status(409).json({ message: 'Move or archive active products before archiving this category' });
    return;
  }
  category.isActive = false;
  category.archiveReason = reason;
  category.archivedAt = new Date();
  category.archivedBy = new mongoose.Types.ObjectId(req.user!.id);
  await category.save();
  await addAudit('category_archived', 'category', String(category._id), req.user!.id, { reason });
  res.json({ category });
});

app.get('/api/v1/customers', getCurrentUser, async (req: Request, res: Response) => {
  const search = String(req.query.search || '').trim();
  const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const query = search
    ? { isActive: true, $or: [{ name: { $regex: escapedSearch, $options: 'i' } }, { phone: { $regex: escapedSearch, $options: 'i' } }] }
    : { isActive: true };
  const items = await Customer.find(query).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

app.post('/api/v1/customers', getCurrentUser, requireRoles('owner', 'manager', 'cashier'), async (req: Request, res: Response) => {
  const parsed = customerValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }

  const { name, phone, email, organization, address, notes } = parsed.data;

  if (phone || email) {
    const duplicateConditions: Record<string, unknown>[] = [];
    if (phone) duplicateConditions.push({ phone: { $regex: `^${phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    if (email) duplicateConditions.push({ email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    const duplicate = await Customer.findOne({
      isActive: true,
      $or: duplicateConditions,
    });

    if (duplicate) {
      res.status(409).json({ message: 'A customer with the same phone or email already exists' });
      return;
    }
  }

  const customer = await Customer.create({ name, phone: phone || '', email: email || '', organization: organization || '', address: address || '', notes: notes || '' });
  res.status(201).json({ customer });
});

app.put('/api/v1/customers/:id', getCurrentUser, requireRoles('owner', 'manager', 'cashier'), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = customerValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }
  const customer = await Customer.findOne({ _id: req.params.id, isActive: true });
  if (!customer) {
    res.status(404).json({ message: 'Customer not found' });
    return;
  }
  const { name, phone, email, organization, address, notes } = parsed.data;
  const duplicateConditions: Record<string, unknown>[] = [];
  if (phone) duplicateConditions.push({ phone: { $regex: `^${phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
  if (email) duplicateConditions.push({ email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
  if (duplicateConditions.length && await Customer.findOne({ _id: { $ne: customer._id }, isActive: true, $or: duplicateConditions })) {
    res.status(409).json({ message: 'A customer with the same phone or email already exists' });
    return;
  }
  Object.assign(customer, { name, phone: phone || '', email: email || '', organization: organization || '', address: address || '', notes: notes || '' });
  await customer.save();
  await addAudit('customer_updated', 'customer', String(customer._id), req.user!.id, { name });
  res.json({ customer });
});

app.delete('/api/v1/customers/:id', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) {
    res.status(400).json({ message: 'An archive reason between 3 and 500 characters is required' });
    return;
  }
  const customer = await Customer.findOne({ _id: req.params.id, isActive: true });
  if (!customer) {
    res.status(404).json({ message: 'Customer not found' });
    return;
  }
  customer.isActive = false;
  customer.archivedAt = new Date();
  customer.archivedBy = new mongoose.Types.ObjectId(req.user!.id);
  customer.archiveReason = reason;
  await customer.save();
  await addAudit('customer_archived', 'customer', String(customer._id), req.user!.id, { reason });
  res.json({ customer });
});

app.get('/api/v1/suppliers', getCurrentUser, requireRoles('owner', 'manager'), async (_req: Request, res: Response) => {
  const items = await Supplier.find({ isActive: true }).sort({ name: 1 }).lean();
  res.json({ items });
});

app.post('/api/v1/suppliers', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = supplierValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }
  const supplier = await Supplier.create(parsed.data);
  await addAudit('supplier_created', 'supplier', String(supplier._id), req.user!.id, { name: supplier.name });
  res.status(201).json({ supplier });
});

app.put('/api/v1/suppliers/:id', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = supplierValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }
  const supplier = await Supplier.findOne({ _id: req.params.id, isActive: true });
  if (!supplier) {
    res.status(404).json({ message: 'Supplier not found' });
    return;
  }
  Object.assign(supplier, parsed.data);
  await supplier.save();
  await addAudit('supplier_updated', 'supplier', String(supplier._id), req.user!.id, { name: supplier.name });
  res.json({ supplier });
});

app.delete('/api/v1/suppliers/:id', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) {
    res.status(400).json({ message: 'An archive reason between 3 and 500 characters is required' });
    return;
  }
  const supplier = await Supplier.findOne({ _id: req.params.id, isActive: true });
  if (!supplier) {
    res.status(404).json({ message: 'Supplier not found' });
    return;
  }
  supplier.isActive = false;
  supplier.archiveReason = reason;
  supplier.archivedAt = new Date();
  supplier.archivedBy = new mongoose.Types.ObjectId(req.user!.id);
  await supplier.save();
  await addAudit('supplier_archived', 'supplier', String(supplier._id), req.user!.id, { reason });
  res.json({ supplier });
});

app.get('/api/v1/purchases', getCurrentUser, requireRoles('owner', 'manager'), async (_req: Request, res: Response) => {
  const items = await Purchase.find().populate('supplier').sort({ createdAt: -1 }).lean();
  res.json({ items });
});

app.post('/api/v1/purchases', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = purchaseValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }
  const { supplierId, items, amountPaid, idempotencyKey } = parsed.data;
  if (idempotencyKey) {
    const prior = await Purchase.findOne({ idempotencyKey });
    if (prior) {
      res.json({ purchase: prior, duplicate: true });
      return;
    }
  }
  const supplier = await Supplier.findOne({ _id: supplierId, isActive: true });
  if (!supplier) {
    res.status(404).json({ message: 'Supplier not found' });
    return;
  }
  const purchaseItems: Array<{ productId: mongoose.Types.ObjectId; name: string; quantity: number; unitCost: number; total: number }> = [];
  for (const item of items) {
    const product = await Product.findOne({ _id: item.productId, isActive: true });
    if (!product) {
      res.status(404).json({ message: `Product ${item.productId} not found` });
      return;
    }
    purchaseItems.push({
      productId: product._id,
      name: product.name,
      quantity: item.quantity,
      unitCost: item.unitCost,
      total: item.quantity * item.unitCost,
    });
  }
  const total = purchaseItems.reduce((sum, item) => sum + item.total, 0);
  if (amountPaid > total) {
    res.status(400).json({ message: 'Payment cannot exceed the purchase total' });
    return;
  }
  const purchaseNumber = `PUR-${randomUUID()}`;
  const purchase = await Purchase.create({
    purchaseNumber,
    idempotencyKey,
    supplier: supplier._id,
    items: purchaseItems,
    subtotal: total,
    total,
    amountPaid,
    balance: total - amountPaid,
    status: 'receiving',
    receivedAt: null,
    recordedBy: req.user!.id,
    payments: amountPaid > 0 ? [{ amount: amountPaid, method: 'cash', reference: purchaseNumber, receivedBy: req.user!.id }] : [],
  });
  const received: typeof purchaseItems = [];
  for (const item of purchaseItems) {
    const result = await Product.updateOne(
      { _id: item.productId, isActive: true, stock: { $gte: 0 } },
      [{
        $set: {
          costPrice: {
            $cond: [
              { $gt: [{ $add: ['$stock', item.quantity] }, 0] },
              { $divide: [{ $add: [{ $multiply: ['$costPrice', '$stock'] }, item.total] }, { $add: ['$stock', item.quantity] }] },
              item.unitCost,
            ],
          },
          stock: { $add: ['$stock', item.quantity] },
        },
      }],
    );
    if (result.modifiedCount !== 1) {
      await Promise.all(received.map((done) => Product.updateOne({ _id: done.productId }, { $inc: { stock: -done.quantity } })));
      purchase.status = 'failed';
      await purchase.save();
      res.status(409).json({ message: 'A product changed while receiving this purchase; verify stock and try again' });
      return;
    }
    received.push(item);
    await StockMovement.create({
      product: item.productId,
      quantity: item.quantity,
      type: 'purchase',
      reason: 'Purchase received',
      reference: purchaseNumber,
      createdBy: req.user!.id,
    });
  }
  purchase.status = 'received';
  purchase.receivedAt = new Date();
  await purchase.save();
  await addAudit('purchase_received', 'purchase', String(purchase._id), req.user!.id, { purchaseNumber, total });
  res.status(201).json({ purchase });
});

app.post('/api/v1/purchases/:id/payments', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const amount = Number(req.body?.amount);
  const method = req.body?.method || 'cash';
  if (!Number.isFinite(amount) || amount <= 0 || typeof method !== 'string' || !PAYMENT_TYPES.includes(method as (typeof PAYMENT_TYPES)[number])) {
    res.status(400).json({ message: 'A positive payment amount and valid payment method are required' });
    return;
  }
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase || purchase.status !== 'received') {
    res.status(purchase ? 409 : 404).json({ message: purchase ? 'Purchase is not received' : 'Purchase not found' });
    return;
  }
  const updated = await Purchase.findOneAndUpdate(
    { _id: purchase._id, status: 'received', balance: { $gte: amount } },
    { $inc: { amountPaid: amount, balance: -amount }, $push: { payments: { amount, method, receivedBy: req.user!.id } } },
    { new: true },
  );
  if (!updated) {
    res.status(409).json({ message: 'Purchase balance changed; refresh and try again' });
    return;
  }
  await addAudit('purchase_payment_received', 'purchase', String(updated._id), req.user!.id, { amount, method });
  res.status(201).json({ purchase: updated });
});

app.post('/api/v1/purchases/:id/reverse', getCurrentUser, requireRoles('owner'), async (req: AuthenticatedRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) {
    res.status(400).json({ message: 'A reversal reason between 3 and 500 characters is required' });
    return;
  }
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) {
    res.status(404).json({ message: 'Purchase not found' });
    return;
  }
  if (purchase.status !== 'received') {
    res.status(409).json({ message: 'Only received purchases can be reversed' });
    return;
  }
  const reversingPurchase = await Purchase.findOneAndUpdate(
    { _id: purchase._id, status: 'received' },
    { $set: { status: 'reversing' } },
    { new: true },
  );
  if (!reversingPurchase) {
    res.status(409).json({ message: 'Purchase status changed; refresh and try again' });
    return;
  }
  const stockReversed: Array<{ productId: mongoose.Types.ObjectId; quantity: number }> = [];
  for (const item of reversingPurchase.items as Array<{ productId: mongoose.Types.ObjectId; quantity: number; name: string }>) {
    const result = await Product.updateOne({ _id: item.productId, stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity } });
    if (result.modifiedCount !== 1) {
      await Promise.all(stockReversed.map((reversed) => Product.updateOne({ _id: reversed.productId }, { $inc: { stock: reversed.quantity } })));
      await Purchase.updateOne({ _id: reversingPurchase._id, status: 'reversing' }, { $set: { status: 'received' } });
      res.status(409).json({ message: `Cannot reverse purchase: stock for ${item.name} has already been used` });
      return;
    }
    stockReversed.push({ productId: item.productId, quantity: item.quantity });
  }
  await Promise.all((reversingPurchase.items as Array<{ productId: mongoose.Types.ObjectId; quantity: number }>).map((item) => StockMovement.create({
    product: item.productId,
    quantity: -item.quantity,
    type: 'adjustment',
    reason: `Purchase reversed: ${reason}`,
    reference: purchase.purchaseNumber,
    createdBy: req.user!.id,
  })));
  const completedReversal = await Purchase.findOneAndUpdate(
    { _id: reversingPurchase._id, status: 'reversing' },
    { $set: { status: 'reversed', reversedAt: new Date(), reversedBy: req.user!.id, reversalReason: reason, 'payments.$[payment].status': 'reversed' } },
    { new: true, arrayFilters: [{ 'payment.status': 'received' }] },
  );
  if (!completedReversal) {
    await Promise.all(stockReversed.map((reversed) => Product.updateOne({ _id: reversed.productId }, { $inc: { stock: reversed.quantity } })));
    await Purchase.updateOne({ _id: reversingPurchase._id, status: 'reversing' }, { $set: { status: 'received' } });
    res.status(409).json({ message: 'Purchase changed while reversing; stock adjustment was rolled back' });
    return;
  }
  await addAudit('purchase_reversed', 'purchase', String(completedReversal._id), req.user!.id, { reason });
  res.json({ purchase: completedReversal });
});

app.get('/api/v1/printing-services', getCurrentUser, async (_req: Request, res: Response) => {
  const items = await PrintingService.find({ isActive: true }).sort({ name: 1 }).lean();
  res.json({ items });
});

app.post('/api/v1/printing-services', getCurrentUser, requireRoles('owner', 'manager'), async (req: Request, res: Response) => {
  const parsed = serviceValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }

  const service = await PrintingService.create(parsed.data);
  res.status(201).json({ service });
});

app.put('/api/v1/printing-services/:id', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = serviceValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }
  const service = await PrintingService.findOne({ _id: req.params.id, isActive: true });
  if (!service) {
    res.status(404).json({ message: 'Printing service not found' });
    return;
  }
  const duplicate = await PrintingService.findOne({ _id: { $ne: service._id }, code: parsed.data.code });
  if (duplicate) {
    res.status(409).json({ message: 'Printing service code already exists' });
    return;
  }
  Object.assign(service, parsed.data);
  await service.save();
  await addAudit('printing_service_updated', 'printing_service', String(service._id), req.user!.id, { code: service.code });
  res.json({ service });
});

app.delete('/api/v1/printing-services/:id', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) {
    res.status(400).json({ message: 'An archive reason between 3 and 500 characters is required' });
    return;
  }
  const service = await PrintingService.findOne({ _id: req.params.id, isActive: true });
  if (!service) {
    res.status(404).json({ message: 'Printing service not found' });
    return;
  }
  service.isActive = false;
  service.archiveReason = reason;
  service.archivedAt = new Date();
  service.archivedBy = new mongoose.Types.ObjectId(req.user!.id);
  await service.save();
  await addAudit('printing_service_archived', 'printing_service', String(service._id), req.user!.id, { reason });
  res.json({ service });
});

app.get('/api/v1/printing-orders', getCurrentUser, async (req: Request, res: Response) => {
  const status = String(req.query.status || '');
  const filter = status ? { status } : {};
  const items = await PrintingOrder.find(filter).sort({ createdAt: -1 }).lean();
  res.json({ items });
});

app.post('/api/v1/printing-orders', getCurrentUser, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = printingOrderValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }

  const { customerName, customerPhone, serviceId, pages, copies, colorMode, paperSize, instructions, urgency, amountPaid } = parsed.data;

  const service = await PrintingService.findById(serviceId);
  if (!service) {
    res.status(404).json({ message: 'Printing service not found' });
    return;
  }

  const pageCount = Number(pages || 1);
  const copyCount = Number(copies || 1);
  const pricePerPage = Number(service.pricePerPage || 0);
  const serviceCharge = Number(service.basePrice || 0);
  const subtotal = pageCount * copyCount * pricePerPage + serviceCharge;
  const total = Math.max(0, subtotal);
  const paid = Number(amountPaid || 0);
  if (paid > total) {
    res.status(400).json({ message: 'Payment cannot exceed the printing order total' });
    return;
  }
  const order = await PrintingOrder.create({
    orderNumber: `PO-${randomUUID()}`,
    customerName,
    customerPhone: customerPhone || '',
    service: service._id,
    serviceName: service.name,
    pages: pageCount,
    copies: copyCount,
    paperSize: paperSize || 'A4',
    colorMode: colorMode || 'black-white',
    urgency: urgency || 'normal',
    instructions: instructions || '',
    pricePerPage,
    serviceCharge,
    total,
    amountPaid: paid,
    balance: total - paid,
    createdBy: req.user!.id,
    status: 'Received',
    payments: paid > 0 ? [{ amount: paid, method: 'cash', receivedBy: req.user!.id, reference: 'Initial payment' }] : [],
  });

  await addAudit('printing_order_created', 'printing_order', String(order._id), req.user!.id, { orderNumber: order.orderNumber });
  res.status(201).json({ order });
});

app.patch('/api/v1/printing-orders/:id/status', getCurrentUser, requireRoles('owner', 'manager', 'printing_staff'), async (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body || {};
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const order = await PrintingOrder.findById(req.params.id);
  if (!order) {
    res.status(404).json({ message: 'Printing order not found' });
    return;
  }
  if (typeof status !== 'string' || !ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
    res.status(400).json({ message: 'Invalid status' });
    return;
  }
  const allowedTransitions: Record<string, string[]> = {
    Received: ['Awaiting payment', 'Queued', 'Cancelled'],
    'Awaiting payment': ['Queued', 'Cancelled'],
    Queued: ['In progress', 'Cancelled'],
    'In progress': ['Ready for collection', 'Cancelled'],
    'Ready for collection': ['In progress', 'Completed', 'Cancelled'],
    Completed: [],
    Cancelled: [],
  };
  if (!allowedTransitions[order.status]?.includes(status)) {
    res.status(409).json({ message: `Cannot change printing order from ${order.status} to ${status}` });
    return;
  }
  if (status === 'Cancelled' && (reason.length < 3 || reason.length > 500)) {
    res.status(400).json({ message: 'A cancellation reason between 3 and 500 characters is required' });
    return;
  }
  if (status === 'Cancelled' && !['owner', 'manager'].includes(req.user!.role)) {
    res.status(403).json({ message: 'Only an owner or manager can cancel a printing order' });
    return;
  }
  if (status === 'Completed' && order.balance > 0) {
    res.status(409).json({ message: 'Printing order must be fully paid before completion' });
    return;
  }

  order.status = status;
  if (status === 'Cancelled') {
    order.cancelledAt = new Date();
    order.cancelledBy = new mongoose.Types.ObjectId(req.user!.id);
    order.cancellationReason = reason;
  }
  await order.save();
  await addAudit('printing_order_status_updated', 'printing_order', String(order._id), req.user!.id, { status, ...(reason ? { reason } : {}) });
  res.json({ order });
});

app.post('/api/v1/printing-orders/:id/payments', getCurrentUser, requireRoles('owner', 'manager', 'cashier'), async (req: AuthenticatedRequest, res: Response) => {
  const amount = Number(req.body?.amount);
  const method = req.body?.method || 'cash';
  const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : '';
  if (!Number.isFinite(amount) || amount <= 0 || typeof method !== 'string' || !PAYMENT_TYPES.includes(method as (typeof PAYMENT_TYPES)[number])) {
    res.status(400).json({ message: 'A positive payment amount and valid payment method are required' });
    return;
  }
  const order = await PrintingOrder.findById(req.params.id);
  if (!order) {
    res.status(404).json({ message: 'Printing order not found' });
    return;
  }
  if (order.status === 'Completed' || order.status === 'Cancelled' || amount > order.balance) {
    const message = order.status === 'Completed' || order.status === 'Cancelled'
      ? `Cannot record payments for a ${order.status.toLowerCase()} order`
      : 'Payment cannot exceed the outstanding balance';
    res.status(order.status === 'Completed' || order.status === 'Cancelled' ? 409 : 400).json({ message });
    return;
  }
  const updatedOrder = await PrintingOrder.findOneAndUpdate(
    { _id: order._id, status: { $nin: ['Completed', 'Cancelled'] }, balance: { $gte: amount } },
    {
      $inc: { amountPaid: amount, balance: -amount },
      $push: { payments: { amount, method, reference, receivedBy: req.user!.id, receivedAt: new Date() } },
    },
    { new: true },
  );
  if (!updatedOrder) {
    res.status(409).json({ message: 'Order balance or status changed; refresh and try again' });
    return;
  }
  await addAudit('printing_order_payment_received', 'printing_order', String(updatedOrder._id), req.user!.id, { amount, method, reference });
  res.status(201).json({ order: updatedOrder });
});

app.get('/api/v1/expenses', getCurrentUser, async (_req: Request, res: Response) => {
  const items = await Expense.find().sort({ date: -1 }).lean();
  res.json({ items });
});

app.post('/api/v1/expenses', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = expenseValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }

  const { description, category, amount, paymentMethod, supplier, reference, date, status } = parsed.data;

  const expense = await Expense.create({
    description,
    category,
    amount,
    date,
    paymentMethod,
    supplier: supplier || '',
    reference: reference || '',
    status,
    recordedBy: req.user!.id,
  });

  res.status(201).json({ expense });
});

app.put('/api/v1/expenses/:id', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = expenseValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }
  const expense = await Expense.findById(req.params.id);
  if (!expense) {
    res.status(404).json({ message: 'Expense not found' });
    return;
  }
  if (expense.status !== 'pending') {
    res.status(409).json({ message: 'Approved expenses cannot be edited; void the expense with an audit reason instead' });
    return;
  }
  Object.assign(expense, parsed.data);
  await expense.save();
  await addAudit('expense_updated', 'expense', String(expense._id), req.user!.id, { description: expense.description });
  res.json({ expense });
});

app.post('/api/v1/expenses/:id/void', getCurrentUser, requireRoles('owner'), async (req: AuthenticatedRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) {
    res.status(400).json({ message: 'A void reason between 3 and 500 characters is required' });
    return;
  }
  const expense = await Expense.findById(req.params.id);
  if (!expense) {
    res.status(404).json({ message: 'Expense not found' });
    return;
  }
  if (expense.status === 'void') {
    res.status(409).json({ message: 'Expense has already been voided' });
    return;
  }
  const voidedExpense = await Expense.findOneAndUpdate(
    { _id: expense._id, status: { $ne: 'void' } },
    { $set: { status: 'void', voidedAt: new Date(), voidedBy: req.user!.id, voidReason: reason } },
    { new: true },
  );
  if (!voidedExpense) {
    res.status(409).json({ message: 'Expense has already changed; refresh and try again' });
    return;
  }
  await addAudit('expense_voided', 'expense', String(voidedExpense._id), req.user!.id, { reason });
  res.json({ expense: voidedExpense });
});

app.get('/api/v1/settings', getCurrentUser, async (_req: Request, res: Response) => {
  const settings = await BusinessSettings.findOne().sort({ createdAt: -1 }).lean();
  res.json({ settings: settings || {} });
});

app.put('/api/v1/settings', getCurrentUser, requireRoles('owner'), async (req: Request, res: Response) => {
  const parsed = settingsValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }

  const settings = await BusinessSettings.findOne();
  const payload = parsed.data;
  if (settings) {
    Object.assign(settings, payload);
    await settings.save();
    res.json({ settings });
    return;
  }

  const created = await BusinessSettings.create(payload);
  res.json({ settings: created });
});

app.get('/api/v1/sales', getCurrentUser, async (_req: Request, res: Response) => {
  const items = await Sale.find().populate('customer').populate('user').sort({ createdAt: -1 }).lean();
  res.json({ items });
});

app.get('/api/v1/payments', getCurrentUser, requireRoles('owner', 'manager'), async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = {};
  if (typeof req.query.saleId === 'string') {
    if (!mongoose.isValidObjectId(req.query.saleId)) {
      res.status(400).json({ message: 'Invalid sale id' });
      return;
    }
    filter.saleId = req.query.saleId;
  }
  const items = await Payment.find(filter).populate('receivedBy', 'name email').sort({ createdAt: -1 }).limit(500).lean();
  res.json({ items });
});

app.post('/api/v1/sales', getCurrentUser, requireRoles('owner', 'manager', 'cashier'), async (req: AuthenticatedRequest, res: Response) => {
  const parsed = saleValidationSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ message: getZodErrorMessage(parsed.error) });
    return;
  }

  const { items, customerId, paymentMethod, amountPaid, discount, idempotencyKey } = parsed.data;
  if (idempotencyKey) {
    const previousSale = await Sale.findOne({ idempotencyKey });
    if (previousSale) {
      res.json({ sale: previousSale, duplicate: true });
      return;
    }
  }
  if (customerId && !await Customer.exists({ _id: customerId, isActive: true })) {
    res.status(404).json({ message: 'Customer not found' });
    return;
  }

  const saleItems: Array<Record<string, unknown>> = [];
  const productsToDeduct: Array<{ _id: mongoose.Types.ObjectId; quantity: number }> = [];
  let subtotal = 0;

  for (const item of items) {
    const product = await Product.findOne({ _id: item.productId, isActive: true });
    if (!product || !product.isActive) {
      res.status(404).json({ message: `Product ${item.productId} not found` });
      return;
    }
    if (Number(item.quantity) > Number(product.stock)) {
      res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      return;
    }

    const unitPrice = Number(product.sellingPrice);
    const quantity = Number(item.quantity);
    const itemTotal = unitPrice * quantity;
    subtotal += itemTotal;

    saleItems.push({
      productId: product._id,
      name: product.name,
      quantity,
      unitPrice,
      costPrice: Number(product.costPrice || 0),
      total: itemTotal,
      sku: product.sku,
    });

    productsToDeduct.push({ _id: product._id, quantity });
  }

  const discountValue = Number(discount || 0);
  if (discountValue > subtotal) {
    res.status(400).json({ message: 'Discount cannot exceed the sale subtotal' });
    return;
  }
  const finalTotal = subtotal - discountValue;
  const paymentAmount = Number(amountPaid || 0);
  if (paymentAmount > finalTotal) {
    res.status(400).json({ message: 'Payment cannot exceed the sale total' });
    return;
  }
  const balance = finalTotal - paymentAmount;
  const reserved: typeof productsToDeduct = [];
  for (const product of productsToDeduct) {
    const result = await Product.updateOne(
      { _id: product._id, isActive: true, stock: { $gte: product.quantity } },
      { $inc: { stock: -product.quantity } },
    );
    if (result.modifiedCount !== 1) {
      await Promise.all(reserved.map(({ _id, quantity }) => Product.updateOne({ _id }, { $inc: { stock: quantity } })));
      res.status(409).json({ message: 'Stock changed while completing the sale; refresh and try again' });
      return;
    }
    reserved.push(product);
  }

  const sale = await Sale.create({
    transactionNumber: `INV-${randomUUID()}`,
    idempotencyKey,
    customer: customerId || null,
    user: req.user!.id,
    items: saleItems,
    subtotal,
    discount: discountValue,
    total: finalTotal,
    amountPaid: paymentAmount,
    balance,
    paymentMethod: paymentMethod || 'cash',
    status: paymentAmount >= finalTotal ? 'completed' : 'partial',
  });

  if (paymentAmount > 0) {
    await Payment.create({
      saleId: sale._id,
      customerId: customerId || null,
      amount: paymentAmount,
      method: paymentMethod || 'cash',
      status: 'received',
      reference: sale.transactionNumber,
      receivedBy: req.user!.id,
    });
  }

  await Promise.all(productsToDeduct.map(({ _id, quantity }) => StockMovement.create({
    product: _id,
    quantity: -quantity,
    type: 'sale',
    reason: 'POS sale',
    reference: sale.transactionNumber,
    createdBy: req.user!.id,
  })));
  await addAudit('sale_created', 'sale', String(sale._id), req.user!.id, { transactionNumber: sale.transactionNumber, total: finalTotal });

  res.status(201).json({ sale });
});

app.get('/api/v1/sales/:id', getCurrentUser, async (req: Request, res: Response) => {
  const sale = await Sale.findById(req.params.id).populate('customer').populate('user').lean();
  if (!sale) {
    res.status(404).json({ message: 'Sale not found' });
    return;
  }
  res.json({ sale });
});

app.post('/api/v1/sales/:id/payments', getCurrentUser, requireRoles('owner', 'manager', 'cashier'), async (req: AuthenticatedRequest, res: Response) => {
  const amount = Number(req.body?.amount);
  const method = req.body?.method;
  const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : '';
  if (!Number.isFinite(amount) || amount <= 0 || typeof method !== 'string' || !PAYMENT_TYPES.includes(method as (typeof PAYMENT_TYPES)[number])) {
    res.status(400).json({ message: 'A positive payment amount and valid payment method are required' });
    return;
  }
  const sale = await Sale.findById(req.params.id);
  if (!sale) {
    res.status(404).json({ message: 'Sale not found' });
    return;
  }
  if (sale.status === 'voided' || amount > sale.balance) {
    res.status(sale.status === 'voided' ? 409 : 400).json({ message: sale.status === 'voided' ? 'Cannot record a payment for a voided sale' : 'Payment cannot exceed the outstanding balance' });
    return;
  }
  const updatedSale = await Sale.findOneAndUpdate(
    { _id: sale._id, status: { $ne: 'voided' }, balance: { $gte: amount } },
    [{
      $set: {
        amountPaid: { $add: [{ $ifNull: ['$amountPaid', 0] }, amount] },
        balance: { $subtract: ['$balance', amount] },
        status: { $cond: [{ $eq: [{ $subtract: ['$balance', amount] }, 0] }, 'completed', 'partial'] },
      },
    }],
    { new: true },
  );
  if (!updatedSale) {
    res.status(409).json({ message: 'Sale balance changed; refresh and try again' });
    return;
  }
  await Payment.create({
    saleId: updatedSale._id,
    customerId: updatedSale.customer,
    amount,
    method: method as (typeof PAYMENT_TYPES)[number],
    status: 'received',
    reference: reference || updatedSale.transactionNumber,
    receivedBy: req.user!.id,
  });
  await addAudit('sale_payment_received', 'sale', String(updatedSale._id), req.user!.id, { amount, method, reference });
  res.status(201).json({ sale: updatedSale });
});

app.post('/api/v1/payments/:id/reverse', getCurrentUser, requireRoles('owner'), async (req: AuthenticatedRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) {
    res.status(400).json({ message: 'A reversal reason between 3 and 500 characters is required' });
    return;
  }
  const payment = await Payment.findOne({ _id: req.params.id, status: 'received' });
  if (!payment) {
    res.status(404).json({ message: 'Received payment not found' });
    return;
  }
  const sale = await Sale.findOne({ _id: payment.saleId, status: { $ne: 'voided' }, amountPaid: { $gte: payment.amount } });
  if (!sale) {
    res.status(409).json({ message: 'Payment cannot be reversed for this sale' });
    return;
  }
  const reversedPayment = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'received' },
    { $set: { status: 'reversed', reversedAt: new Date(), reversedBy: req.user!.id, reversalReason: reason } },
    { new: true },
  );
  if (!reversedPayment) {
    res.status(409).json({ message: 'Payment has already changed; refresh and try again' });
    return;
  }
  const updatedSale = await Sale.findOneAndUpdate(
    { _id: sale._id, status: { $ne: 'voided' }, amountPaid: { $gte: payment.amount } },
    [{
      $set: {
        amountPaid: { $subtract: ['$amountPaid', payment.amount] },
        balance: { $add: ['$balance', payment.amount] },
        status: { $cond: [{ $eq: [{ $subtract: ['$amountPaid', payment.amount] }, 0] }, 'unpaid', 'partial'] },
      },
    }],
    { new: true },
  );
  if (!updatedSale) {
    await Payment.updateOne({ _id: payment._id, status: 'reversed' }, { $set: { status: 'received', reversedAt: null, reversedBy: null, reversalReason: '' } });
    res.status(409).json({ message: 'Sale balance changed; refresh and try again' });
    return;
  }
  await addAudit('payment_reversed', 'payment', String(payment._id), req.user!.id, { saleId: String(sale._id), amount: payment.amount, reason });
  res.json({ payment: reversedPayment, sale: updatedSale });
});

app.post('/api/v1/sales/:id/void', getCurrentUser, requireRoles('owner', 'manager'), async (req: AuthenticatedRequest, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) {
    res.status(400).json({ message: 'A void reason between 3 and 500 characters is required' });
    return;
  }
  const sale = await Sale.findById(req.params.id);
  if (!sale) {
    res.status(404).json({ message: 'Sale not found' });
    return;
  }
  if (sale.status === 'voided') {
    res.status(409).json({ message: 'Sale has already been voided' });
    return;
  }

  const voidedSale = await Sale.findOneAndUpdate(
    { _id: sale._id, status: sale.status, voidedAt: null },
    { $set: { status: 'voided', voidedAt: new Date(), voidedBy: req.user!.id, voidReason: reason } },
    { new: true },
  );
  if (!voidedSale) {
    res.status(409).json({ message: 'Sale has already changed; refresh and try again' });
    return;
  }
  for (const item of voidedSale.items) {
    await Product.updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } });
    await StockMovement.create({
      product: item.productId,
      quantity: item.quantity,
      type: 'adjustment',
      reason: `Sale voided: ${reason}`,
      reference: voidedSale.transactionNumber,
      createdBy: req.user!.id,
    });
  }
  await Payment.updateMany({ saleId: voidedSale._id, status: 'received' }, { $set: { status: 'reversed' } });
  await addAudit('sale_voided', 'sale', String(voidedSale._id), req.user!.id, { reason });
  res.json({ sale: voidedSale });
});

app.get('/api/v1/audit-logs', getCurrentUser, requireRoles('owner', 'manager'), async (_req: Request, res: Response) => {
  const logs = await AuditLog.find().populate('performedBy').sort({ createdAt: -1 }).limit(100).lean();
  res.json({ items: logs });
});

app.use((err: Error & { code?: number; name?: string }, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (err.name === 'CastError') {
    res.status(400).json({ message: 'Invalid record id' });
    return;
  }
  if (err.name === 'ValidationError') {
    res.status(400).json({ message: err.message });
    return;
  }
  if (err.code === 11000) {
    res.status(409).json({ message: 'A record with this unique value already exists' });
    return;
  }
  res.status(500).json({ message: err.message || 'Something went wrong' });
});

const startServer = async () => {
  await connectDatabase();
  await ensureDefaults();

  return new Promise<import('http').Server>((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`Nadra API listening on http://localhost:${PORT}`);
      resolve(server);
    });
  });
};

if (process.env.NODE_ENV !== 'test' && process.env.VITEST === undefined) {
  startServer().catch((error) => {
    console.error('Failed to start Nadra server:', error);
    process.exit(1);
  });
}

export { app, startServer };
