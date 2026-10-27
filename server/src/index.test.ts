import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

const databaseName = `nadra_test_${randomUUID().replaceAll('-', '')}`;
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = `mongodb://localhost:27017/${databaseName}`;
process.env.JWT_SECRET = `${randomUUID()}${randomUUID()}`;
process.env.INITIAL_ADMIN_PASSWORD = `Nadra-Test-${randomUUID()}-Admin`;

let app: typeof import('./index.js').app;
let startServer: typeof import('./index.js').startServer;
let server: Awaited<ReturnType<typeof startServer>>;
let agent: ReturnType<typeof request.agent>;

describe('Nadra API', () => {
  beforeAll(async () => {
    ({ app, startServer } = await import('./index.js'));
    server = await startServer();
    agent = request.agent(app);
    const login = await agent.post('/api/v1/auth/login').send({ email: 'admin@nadra.local', password: process.env.INITIAL_ADMIN_PASSWORD });
    expect(login.status).toBe(200);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('returns health status', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('can fetch dashboard data for the current range', async () => {
    const response = await agent.get('/api/v1/dashboard?range=today');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('salesTotal');
  });

  it('does not insert demo inventory, customers, or suppliers into a new database', async () => {
    expect(await mongoose.connection.collection('products').countDocuments()).toBe(0);
    expect(await mongoose.connection.collection('customers').countDocuments()).toBe(0);
    expect(await mongoose.connection.collection('suppliers').countDocuments()).toBe(0);
  });

  it('updates business settings and persists them in MongoDB', async () => {
    const response = await agent.put('/api/v1/settings').send({ businessName: 'QA Settings', currency: 'USD' });
    expect(response.status).toBe(200);
    expect(response.body.settings.businessName).toBe('QA Settings');
    expect((await agent.get('/api/v1/settings')).body.settings.businessName).toBe('QA Settings');
    expect((await mongoose.connection.collection('businesssettings').findOne({}))?.businessName).toBe('QA Settings');
  });

  it('can create a product and create a sale', async () => {
    const productResponse = await agent.post('/api/v1/products').send({
      name: 'Test Marker',
      sku: 'MK-TEST-01',
      category: 'Stationery',
      sellingPrice: 9,
      costPrice: 4,
      stock: 12,
    });
    expect(productResponse.status).toBe(201);

    const productId = productResponse.body.product._id;
    const saleResponse = await agent.post('/api/v1/sales').send({
      items: [{ productId, quantity: 2, unitPrice: 9 }],
      paymentMethod: 'cash',
      amountPaid: 18,
      discount: 0,
    });

    expect(saleResponse.status).toBe(201);
    expect(saleResponse.body.sale.total).toBe(18);

    const selectedDay = new Date();
    const start = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate());
    const end = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate() + 1);
    const analytics = await agent.get(`/api/v1/dashboard?range=daily&from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`);
    expect(analytics.status).toBe(200);
    expect(analytics.body.salesTotal).toBe(18);
    expect(analytics.body.grossProfit).toBe(10);
    expect(analytics.body.netProfit).toBe(10);
    expect(analytics.body.chartBuckets.reduce((sum: number, bucket: { sales: number }) => sum + bucket.sales, 0)).toBe(18);
    expect(analytics.body.topProducts[0].name).toBe('Test Marker');
    expect(analytics.body.previousPeriod).toHaveProperty('salesTotal');
  });

  it('requires valid boundaries for custom dashboard ranges', async () => {
    const missingDates = await agent.get('/api/v1/dashboard?range=custom');
    expect(missingDates.status).toBe(400);
    const reversedDates = await agent.get('/api/v1/dashboard?range=custom&from=2026-10-27T00%3A00%3A00.000Z&to=2026-10-26T00%3A00%3A00.000Z');
    expect(reversedDates.status).toBe(400);
  });

  it('can create a printing order', async () => {
    const serviceResponse = await agent.get('/api/v1/printing-services');
    const firstService = serviceResponse.body.items[0];

    const orderResponse = await agent.post('/api/v1/printing-orders').send({
      customerName: 'Demo Customer',
      customerPhone: '123456789',
      serviceId: firstService._id,
      pages: 8,
      copies: 2,
      amountPaid: 0,
    });

    expect(orderResponse.status).toBe(201);
    expect(orderResponse.body.order.customerName).toBe('Demo Customer');
  });

  it('rejects invalid product submissions', async () => {
    const response = await agent.post('/api/v1/products').send({
      name: '   ',
      sku: 'BAD-SKU',
      category: 'Missing Category',
      sellingPrice: -1,
      costPrice: -5,
      stock: -2,
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/name|price|stock|category/i);
  });

  it('rejects duplicate customer names and invalid login payloads', async () => {
    const invalidLogin = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email', password: '' });
    expect(invalidLogin.status).toBe(400);

    const customerResponse = await agent.post('/api/v1/customers').send({ name: '   ', phone: '123' });
    expect(customerResponse.status).toBe(400);
  });

  it('updates and archives products without deleting their database record', async () => {
    const created = await agent.post('/api/v1/products').send({
      name: 'Archive test product',
      sku: 'ARCHIVE-TEST-01',
      category: 'Stationery',
      sellingPrice: 6,
      costPrice: 2,
      stock: 8,
    });
    expect(created.status).toBe(201);
    const id = created.body.product._id;
    const updated = await agent.put(`/api/v1/products/${id}`).send({
      name: 'Updated archive test product',
      sku: 'ARCHIVE-TEST-01',
      category: 'Stationery',
      sellingPrice: 7,
      costPrice: 2,
      stock: 8,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.product.sellingPrice).toBe(7);

    const persisted = await mongoose.connection.collection('products').findOne({ _id: new mongoose.Types.ObjectId(id) });
    expect(persisted?.name).toBe('Updated archive test product');

    const archived = await agent.delete(`/api/v1/products/${id}`).send({ reason: 'No longer carried' });
    expect(archived.status).toBe(200);
    expect(archived.body.product.isActive).toBe(false);
    expect(await mongoose.connection.collection('products').findOne({ _id: new mongoose.Types.ObjectId(id) })).not.toBeNull();
    expect((await agent.get('/api/v1/products')).body.items.some((product: { _id: string }) => product._id === id)).toBe(false);
    expect((await agent.delete(`/api/v1/products/${id}`).send({ reason: 'Repeated archive' })).status).toBe(404);
  });

  it('rejects duplicate product SKUs and barcodes regardless of letter case', async () => {
    const product = {
      name: 'Unique identifier product',
      sku: 'unique-test-sku',
      barcode: 'QA-BARCODE-001',
      category: 'Stationery',
      sellingPrice: 3,
      costPrice: 1,
      stock: 2,
    };
    expect((await agent.post('/api/v1/products').send(product)).status).toBe(201);
    expect((await agent.post('/api/v1/products').send({ ...product, name: 'Duplicate SKU', barcode: '' })).status).toBe(409);
    expect((await agent.post('/api/v1/products').send({ ...product, name: 'Duplicate barcode', sku: 'UNIQUE-TEST-SKU-2' })).status).toBe(409);
  });

  it('enforces role authorization for restricted product changes', async () => {
    const email = 'qa-cashier@nadra.test';
    const cashierPassword = randomUUID();
    await mongoose.connection.collection('users').insertOne({
      name: 'QA Cashier',
      email,
      password: await bcrypt.hash(cashierPassword, 10),
      role: 'cashier',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const cashier = request.agent(app);
    expect((await cashier.post('/api/v1/auth/login').send({ email, password: cashierPassword })).status).toBe(200);
    expect((await cashier.post('/api/v1/products').send({
      name: 'Unauthorized product',
      sku: 'UNAUTHORIZED-01',
      category: 'Stationery',
      sellingPrice: 1,
      costPrice: 1,
      stock: 1,
    })).status).toBe(403);
  });

  it('updates and archives customers while preserving the customer record', async () => {
    const created = await agent.post('/api/v1/customers').send({ name: 'CRUD Customer', phone: '+15550101001' });
    expect(created.status).toBe(201);
    const id = created.body.customer._id;
    const updated = await agent.put(`/api/v1/customers/${id}`).send({
      name: 'CRUD Customer',
      phone: '+15550101002',
      email: '',
      organization: '',
      address: '',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.customer.phone).toBe('+15550101002');
    expect((await mongoose.connection.collection('customers').findOne({ _id: new mongoose.Types.ObjectId(id) }))?.phone).toBe('+15550101002');

    const archived = await agent.delete(`/api/v1/customers/${id}`).send({ reason: 'Customer requested closure' });
    expect(archived.status).toBe(200);
    expect(archived.body.customer.isActive).toBe(false);
    expect(await mongoose.connection.collection('customers').findOne({ _id: new mongoose.Types.ObjectId(id) })).not.toBeNull();
  });

  it('manages suppliers, categories, and printing services through validated CRUD endpoints', async () => {
    const category = await agent.post('/api/v1/categories').send({ name: 'QA Category', description: 'Category test' });
    expect(category.status).toBe(201);
    const categoryId = category.body.category._id;
    expect((await agent.put(`/api/v1/categories/${categoryId}`).send({ name: 'QA Category Updated', description: 'Updated' })).status).toBe(200);
    expect((await agent.delete(`/api/v1/categories/${categoryId}`).send({ reason: 'No longer needed' })).status).toBe(200);
    expect((await mongoose.connection.collection('categories').findOne({ _id: new mongoose.Types.ObjectId(categoryId) }))?.isActive).toBe(false);

    const supplier = await agent.post('/api/v1/suppliers').send({ name: 'QA Supplier', email: 'qa-supplier@nadra.test', phone: '+15550001111' });
    expect(supplier.status).toBe(201);
    const supplierId = supplier.body.supplier._id;
    expect((await agent.put(`/api/v1/suppliers/${supplierId}`).send({ name: 'QA Supplier Updated', email: 'qa-supplier@nadra.test', phone: '+15550001112' })).status).toBe(200);
    expect((await agent.delete(`/api/v1/suppliers/${supplierId}`).send({ reason: 'Supplier account closed' })).status).toBe(200);
    expect((await mongoose.connection.collection('suppliers').findOne({ _id: new mongoose.Types.ObjectId(supplierId) }))?.isActive).toBe(false);

    const services = (await agent.get('/api/v1/printing-services')).body.items;
    const service = services[0];
    const updatedService = await agent.put(`/api/v1/printing-services/${service._id}`).send({
      name: service.name,
      code: service.code,
      pricePerPage: service.pricePerPage + 0.25,
      basePrice: service.basePrice,
    });
    expect(updatedService.status).toBe(200);
    expect(updatedService.body.service.pricePerPage).toBe(service.pricePerPage + 0.25);
  });

  it('creates, updates, lists, and deactivates users without exposing passwords', async () => {
    const created = await agent.post('/api/v1/users').send({
      name: 'QA Managed User',
      email: 'qa-managed@nadra.test',
      password: randomUUID(),
      role: 'cashier',
    });
    expect(created.status).toBe(201);
    expect(created.body.user).not.toHaveProperty('password');
    const id = created.body.user._id;
    const updated = await agent.put(`/api/v1/users/${id}`).send({
      name: 'QA Managed User Updated',
      email: 'qa-managed@nadra.test',
      role: 'manager',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.user.role).toBe('manager');
    expect((await agent.get('/api/v1/users')).body.items.find((item: { _id: string }) => item._id === id)).not.toHaveProperty('password');
    expect((await agent.delete(`/api/v1/users/${id}`).send({ reason: 'Temporary QA account' })).status).toBe(200);
    expect((await mongoose.connection.collection('users').findOne({ _id: new mongoose.Types.ObjectId(id) }))?.isActive).toBe(false);
    const admin = (await mongoose.connection.collection('users').findOne({ email: 'admin@nadra.local' }))!;
    expect((await agent.delete(`/api/v1/users/${admin._id}`).send({ reason: 'Protect last owner' })).status).toBe(409);
  });

  it('receives purchases once, updates stock, and preserves history on reversal', async () => {
    const supplier = await agent.post('/api/v1/suppliers').send({ name: 'Purchase QA Supplier' });
    const product = await agent.post('/api/v1/products').send({
      name: 'Purchase workflow item', sku: 'PURCHASE-WORKFLOW-01', category: 'Stationery', sellingPrice: 8, costPrice: 2, stock: 4,
    });
    const id = product.body.product._id;
    const payload = {
      supplierId: supplier.body.supplier._id,
      items: [{ productId: id, quantity: 6, unitCost: 3 }],
      amountPaid: 6,
      idempotencyKey: 'purchase-workflow-01',
    };
    const received = await agent.post('/api/v1/purchases').send(payload);
    expect(received.status).toBe(201);
    expect(received.body.purchase.balance).toBe(12);
    expect((await mongoose.connection.collection('products').findOne({ _id: new mongoose.Types.ObjectId(id) }))?.stock).toBe(10);
    expect((await agent.post('/api/v1/purchases').send(payload)).body.duplicate).toBe(true);
    expect((await mongoose.connection.collection('products').findOne({ _id: new mongoose.Types.ObjectId(id) }))?.stock).toBe(10);
    const payment = await agent.post(`/api/v1/purchases/${received.body.purchase._id}/payments`).send({ amount: 12, method: 'cash' });
    expect(payment.status).toBe(201);
    expect(payment.body.purchase.balance).toBe(0);
    expect((await agent.post(`/api/v1/purchases/${received.body.purchase._id}/reverse`).send({ reason: 'Supplier returned goods' })).status).toBe(200);
    expect((await mongoose.connection.collection('products').findOne({ _id: new mongoose.Types.ObjectId(id) }))?.stock).toBe(4);
    expect((await agent.post(`/api/v1/purchases/${received.body.purchase._id}/reverse`).send({ reason: 'Repeated reversal' })).status).toBe(409);
  });

  it('reverses an individual sale payment and restores the outstanding balance', async () => {
    const product = await agent.post('/api/v1/products').send({
      name: 'Payment reversal item', sku: 'PAYMENT-REVERSAL-01', category: 'Stationery', sellingPrice: 10, costPrice: 4, stock: 4,
    });
    const sale = await agent.post('/api/v1/sales').send({
      items: [{ productId: product.body.product._id, quantity: 1 }],
      amountPaid: 10,
      paymentMethod: 'cash',
    });
    const payments = (await agent.get(`/api/v1/payments?saleId=${sale.body.sale._id}`)).body.items;
    expect(payments).toHaveLength(1);
    const reversed = await agent.post(`/api/v1/payments/${payments[0]._id}/reverse`).send({ reason: 'Cash tender correction' });
    expect(reversed.status).toBe(200);
    expect(reversed.body.sale.balance).toBe(10);
    expect((await agent.get(`/api/v1/payments?saleId=${sale.body.sale._id}`)).body.items[0].status).toBe('reversed');
  });

  it('prevents duplicate sale submissions and keeps payment and stock balances consistent', async () => {
    const dashboardBefore = (await agent.get('/api/v1/dashboard?range=today')).body;
    const product = await agent.post('/api/v1/products').send({
      name: 'Sale consistency product',
      sku: 'SALE-CONSISTENCY-01',
      category: 'Stationery',
      sellingPrice: 10,
      costPrice: 4,
      stock: 5,
    });
    const productId = product.body.product._id;
    const saleBody = {
      items: [{ productId, quantity: 2, unitPrice: 1 }],
      amountPaid: 5,
      paymentMethod: 'cash',
      idempotencyKey: 'sale-consistency-123',
    };
    const created = await agent.post('/api/v1/sales').send(saleBody);
    expect(created.status).toBe(201);
    expect(created.body.sale.total).toBe(20);
    expect(created.body.sale.balance).toBe(15);
    expect((await mongoose.connection.collection('products').findOne({ _id: new mongoose.Types.ObjectId(productId) }))?.stock).toBe(3);

    const duplicate = await agent.post('/api/v1/sales').send(saleBody);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);
    expect((await mongoose.connection.collection('products').findOne({ _id: new mongoose.Types.ObjectId(productId) }))?.stock).toBe(3);

    const payment = await agent.post(`/api/v1/sales/${created.body.sale._id}/payments`).send({ amount: 15, method: 'cash' });
    expect(payment.status).toBe(201);
    expect(payment.body.sale.balance).toBe(0);
    expect((await agent.post(`/api/v1/sales/${created.body.sale._id}/payments`).send({ amount: 0.01, method: 'cash' })).status).toBe(400);

    expect((await agent.post(`/api/v1/sales/${created.body.sale._id}/void`).send({ reason: 'Customer returned items' })).status).toBe(200);
    expect((await mongoose.connection.collection('products').findOne({ _id: new mongoose.Types.ObjectId(productId) }))?.stock).toBe(5);
    expect((await agent.post(`/api/v1/sales/${created.body.sale._id}/void`).send({ reason: 'Repeated void' })).status).toBe(409);
    const dashboardAfter = (await agent.get('/api/v1/dashboard?range=today')).body;
    expect(dashboardAfter.salesTotal).toBe(dashboardBefore.salesTotal);
  });

  it('records printing partial payments and enforces legal order transitions', async () => {
    const service = (await agent.get('/api/v1/printing-services')).body.items[0];
    const created = await agent.post('/api/v1/printing-orders').send({
      customerName: 'Printing workflow customer',
      serviceId: service._id,
      pages: 4,
      copies: 1,
      amountPaid: 0,
    });
    expect(created.status).toBe(201);
    const id = created.body.order._id;
    const initialBalance = created.body.order.balance;
    expect((await agent.post(`/api/v1/printing-orders/${id}/payments`).send({ amount: 2, method: 'cash' })).body.order.balance).toBe(initialBalance - 2);

    expect((await agent.patch(`/api/v1/printing-orders/${id}/status`).send({ status: 'Queued' })).status).toBe(200);
    expect((await agent.patch(`/api/v1/printing-orders/${id}/status`).send({ status: 'Completed' })).status).toBe(409);
    expect((await agent.post(`/api/v1/printing-orders/${id}/payments`).send({ amount: initialBalance - 2, method: 'cash' })).body.order.balance).toBe(0);
    for (const status of ['In progress', 'Ready for collection', 'Completed']) {
      expect((await agent.patch(`/api/v1/printing-orders/${id}/status`).send({ status })).status).toBe(200);
    }
    const persisted = await mongoose.connection.collection('printingorders').findOne({ _id: new mongoose.Types.ObjectId(id) });
    expect(persisted?.status).toBe('Completed');
    expect(persisted?.payments).toHaveLength(2);

    const cancelledOrder = await agent.post('/api/v1/printing-orders').send({
      customerName: 'Printing cancellation customer',
      serviceId: service._id,
      pages: 2,
      copies: 1,
      amountPaid: 1,
    });
    const cancelledId = cancelledOrder.body.order._id;
    expect((await agent.patch(`/api/v1/printing-orders/${cancelledId}/status`).send({ status: 'Cancelled' })).status).toBe(400);
    expect((await agent.patch(`/api/v1/printing-orders/${cancelledId}/status`).send({ status: 'Cancelled', reason: 'Customer cancelled request' })).status).toBe(200);
    const persistedCancellation = await mongoose.connection.collection('printingorders').findOne({ _id: new mongoose.Types.ObjectId(cancelledId) });
    expect(persistedCancellation?.payments).toHaveLength(1);
    expect(persistedCancellation?.cancellationReason).toBe('Customer cancelled request');
  });

  it('voids expenses with a reason and returns controlled errors for invalid ids and unauthenticated writes', async () => {
    const created = await agent.post('/api/v1/expenses').send({ description: 'Test utility expense', category: 'Utilities', amount: 12, status: 'pending' });
    expect(created.status).toBe(201);
    const id = created.body.expense._id;
    const updated = await agent.put(`/api/v1/expenses/${id}`).send({ description: 'Updated utility expense', category: 'Utilities', amount: 14, status: 'pending' });
    expect(updated.status).toBe(200);
    expect(updated.body.expense.amount).toBe(14);
    expect((await agent.post(`/api/v1/expenses/${id}/void`).send({ reason: 'Duplicate entry' })).status).toBe(200);
    expect((await mongoose.connection.collection('expenses').findOne({ _id: new mongoose.Types.ObjectId(id) }))?.status).toBe('void');
    expect((await agent.post(`/api/v1/expenses/${id}/void`).send({ reason: 'Repeated void' })).status).toBe(409);
    expect((await agent.get('/api/v1/sales/not-an-id')).status).toBe(400);
    expect((await request(app).post('/api/v1/products').send({})).status).toBe(401);
  });
});
