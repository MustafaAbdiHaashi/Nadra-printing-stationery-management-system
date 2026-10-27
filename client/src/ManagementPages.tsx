import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './lib/api';

type ManageKind = 'categories' | 'suppliers' | 'services' | 'users';
type Row = { _id: string; name?: string; email?: string; role?: string; code?: string; phone?: string; description?: string; isActive?: boolean; [key: string]: unknown };
type Field = { name: string; label: string; type?: string; required?: boolean; options?: string[] };

const configs: Record<ManageKind, { title: string; endpoint: string; fields: Field[]; columns: string[] }> = {
  categories: {
    title: 'Categories', endpoint: '/categories',
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'description', label: 'Description' }],
    columns: ['name', 'description'],
  },
  suppliers: {
    title: 'Suppliers', endpoint: '/suppliers',
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'contactPerson', label: 'Contact person' }, { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'address', label: 'Address' }, { name: 'notes', label: 'Notes' }],
    columns: ['name', 'contactPerson', 'phone', 'email'],
  },
  services: {
    title: 'Printing services', endpoint: '/printing-services',
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'code', label: 'Code', required: true }, { name: 'pricePerPage', label: 'Price per page', type: 'number', required: true }, { name: 'basePrice', label: 'Base price', type: 'number', required: true }, { name: 'description', label: 'Description' }],
    columns: ['name', 'code', 'pricePerPage', 'basePrice'],
  },
  users: {
    title: 'Users and roles', endpoint: '/users',
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'password', label: 'Password (10+ characters)', type: 'password' }, { name: 'role', label: 'Role', required: true, options: ['owner', 'manager', 'cashier', 'printing_staff'] }],
    columns: ['name', 'email', 'role', 'isActive'],
  },
};

function ArchiveReason({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (reason.trim().length < 3) { setError('Enter a reason of at least 3 characters.'); return; }
    setSaving(true);
    setError('');
    try { await onConfirm(reason.trim()); } catch (failure) { setError((failure as Error).message); } finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
    <h2 className="text-xl font-bold">{title}</h2><label className="mt-4 block text-sm" htmlFor="management-reason">Reason</label>
    <textarea id="management-reason" autoFocus value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border p-3" />
    {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
    <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border px-4 py-2">Cancel</button><button type="button" onClick={() => void submit()} disabled={saving} className="rounded-lg bg-brand-navy px-4 py-2 text-white">{saving ? 'Saving...' : 'Confirm'}</button></div>
  </div></div>;
}

export function ManagementPage({ kind }: { kind: ManageKind }) {
  const config = configs[kind];
  const [items, setItems] = useState<Row[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => setItems((await api<{ items: Row[] }>(config.endpoint)).items || []), [config.endpoint]);
  useEffect(() => { void load().catch((failure) => setError((failure as Error).message)); }, [load]);
  const reset = () => setValues({});
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    const payload: Record<string, unknown> = { ...values };
    for (const field of config.fields) if (field.type === 'number') payload[field.name] = Number(values[field.name] || 0);
    if (kind === 'users' && !payload.password) delete payload.password;
    try {
      await api(editing ? `${config.endpoint}/${editing._id}` : config.endpoint, {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      setEditing(null); reset(); await load();
    } catch (failure) { setError((failure as Error).message); } finally { setSaving(false); }
  };
  const archive = async (item: Row, reason: string) => {
    await api(`${config.endpoint}/${item._id}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
    setArchiveTarget(null); await load();
  };
  return <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"><h1 className="text-2xl font-bold text-brand-navy">{config.title}</h1><div className="mt-4 space-y-3">
      {items.map((item) => <div key={item._id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div>{config.columns.map((column) => <div key={column} className={column === config.columns[0] ? 'font-medium' : 'text-sm text-slate-500'}>{String(item[column] ?? '')}</div>)}</div>
        <div className="flex gap-2"><button type="button" onClick={() => { setEditing(item); setValues(Object.fromEntries(config.fields.map((field) => [field.name, field.name === 'password' ? '' : String(item[field.name] ?? '')]))); }} className="rounded-lg border px-3 py-1 text-sm">Edit</button>
          {kind !== 'users' || item.isActive ? <button type="button" onClick={() => setArchiveTarget(item)} className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-700">{kind === 'users' ? 'Deactivate' : 'Archive'}</button> : null}</div>
      </div>)}
      {items.length === 0 ? <p className="text-sm text-slate-500">No records found.</p> : null}
    </div></section>
    <form onSubmit={(event) => void submit(event)} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <h2 className="text-xl font-bold">{editing ? `Edit ${config.title.slice(0, -1)}` : `Add ${config.title.slice(0, -1)}`}</h2>
      <div className="mt-4 space-y-3">{config.fields.map((field) => <label key={field.name} className="block text-sm font-medium text-slate-700">{field.label}
        {field.options ? <select required={field.required} value={values[field.name] || field.options[kind === 'users' ? 2 : 0]} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">{field.options.map((option) => <option key={option}>{option}</option>)}</select>
          : <input type={field.type || 'text'} required={field.required && !(kind === 'users' && editing && field.name === 'password')} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? '0.01' : undefined} value={values[field.name] || ''} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />}</label>)}</div>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      <button disabled={saving} className="mt-4 w-full rounded-xl bg-brand-navy px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : editing ? 'Save changes' : 'Create'}</button>
      {editing ? <button type="button" onClick={() => { setEditing(null); reset(); }} className="mt-2 w-full rounded-xl border px-4 py-3">Cancel</button> : null}
    </form>
    {archiveTarget ? <ArchiveReason title={`${kind === 'users' ? 'Deactivate' : 'Archive'} ${archiveTarget.name || archiveTarget.email || ''}?`} onCancel={() => setArchiveTarget(null)} onConfirm={(reason) => archive(archiveTarget, reason)} /> : null}
  </div>;
}

type PurchaseRow = { _id: string; purchaseNumber: string; total: number; amountPaid: number; balance: number; status: string; supplier: { name?: string } };
type ProductOption = { _id: string; name: string; costPrice: number };
type SupplierOption = { _id: string; name: string };

export function PurchasesPage() {
  const [items, setItems] = useState<PurchaseRow[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('0');
  const [amountPaid, setAmountPaid] = useState('0');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const [reverseTarget, setReverseTarget] = useState<PurchaseRow | null>(null);
  const load = async () => setItems((await api<{ items: PurchaseRow[] }>('/purchases')).items || []);
  useEffect(() => {
    void Promise.all([load(), api<{ items: ProductOption[] }>('/products').then((value) => setProducts(value.items)), api<{ items: SupplierOption[] }>('/suppliers').then((value) => setSuppliers(value.items))])
      .catch((failure) => setError((failure as Error).message));
  }, []);
  const createPurchase = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api('/purchases', { method: 'POST', body: JSON.stringify({ supplierId, items: [{ productId, quantity: Number(quantity), unitCost: Number(unitCost) }], amountPaid: Number(amountPaid), idempotencyKey: idempotencyKey.current }) });
      idempotencyKey.current = crypto.randomUUID();
      await load(); setQuantity('1'); setAmountPaid('0');
    } catch (failure) { setError((failure as Error).message); } finally { setSaving(false); }
  };
  const receivePayment = async (purchase: PurchaseRow) => {
    setSaving(true); setError('');
    try {
      await api(`/purchases/${purchase._id}/payments`, { method: 'POST', body: JSON.stringify({ amount: Number(paymentAmount), method: 'cash' }) });
      setPaymentAmount(''); await load();
    } catch (failure) { setError((failure as Error).message); } finally { setSaving(false); }
  };
  return <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"><h1 className="text-2xl font-bold">Purchases / Receiving</h1><div className="mt-4 space-y-3">
      {items.map((item) => <div key={item._id} className="flex items-center justify-between gap-3 rounded-xl border bg-slate-50 p-3"><div className="font-medium">{item.purchaseNumber}<div className="text-xs text-slate-500">{item.supplier?.name} · {item.status}</div><div className="text-xs">Total ${item.total.toFixed(2)} · Paid ${item.amountPaid.toFixed(2)} · Balance ${item.balance.toFixed(2)}</div></div><div className="flex gap-2">{item.status === 'received' && item.balance > 0 ? <><input aria-label={`Payment for ${item.purchaseNumber}`} type="number" min="0.01" max={item.balance} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="w-28 rounded border px-2 py-1" /><button type="button" disabled={saving} onClick={() => void receivePayment(item)} className="rounded bg-brand-teal px-3 py-1 text-sm text-white disabled:opacity-50">Pay</button></> : null}{item.status === 'received' ? <button type="button" onClick={() => setReverseTarget(item)} className="rounded border border-red-200 px-3 py-1 text-sm text-red-700">Reverse</button> : null}</div></div>)}
      {items.length === 0 ? <p className="text-sm text-slate-500">No purchases found.</p> : null}</div></section>
    <form onSubmit={(event) => void createPurchase(event)} className="h-fit rounded-2xl border bg-white p-5 shadow-soft"><h2 className="text-xl font-bold">Receive purchase</h2><div className="mt-4 space-y-3">
      <select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="w-full rounded border px-3 py-2"><option value="">Select supplier</option>{suppliers.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
      <select required value={productId} onChange={(event) => { setProductId(event.target.value); setUnitCost(String(products.find((product) => product._id === event.target.value)?.costPrice || 0)); }} className="w-full rounded border px-3 py-2"><option value="">Select product</option>{products.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
      <input aria-label="Quantity" type="number" min="1" step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} className="w-full rounded border px-3 py-2" />
      <input aria-label="Unit cost" type="number" min="0" step="0.01" required value={unitCost} onChange={(event) => setUnitCost(event.target.value)} className="w-full rounded border px-3 py-2" />
      <input aria-label="Amount paid" type="number" min="0" step="0.01" value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} className="w-full rounded border px-3 py-2" />
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<button disabled={saving || !supplierId || !productId} className="w-full rounded-xl bg-brand-teal px-4 py-3 text-white disabled:opacity-50">{saving ? 'Receiving...' : 'Receive purchase'}</button></div></form>
    {reverseTarget ? <ArchiveReason title={`Reverse purchase ${reverseTarget.purchaseNumber}?`} onCancel={() => setReverseTarget(null)} onConfirm={async (reason) => { await api(`/purchases/${reverseTarget._id}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) }); setReverseTarget(null); await load(); }} /> : null}
  </div>;
}

type PaymentRow = { _id: string; amount: number; method: string; status: string; reference: string; createdAt: string; saleId: string; receivedBy: { name?: string } };
export function PaymentsPage() {
  const [items, setItems] = useState<PaymentRow[]>([]);
  const [error, setError] = useState('');
  const [reverseTarget, setReverseTarget] = useState<PaymentRow | null>(null);
  const load = async () => setItems((await api<{ items: PaymentRow[] }>('/payments')).items || []);
  useEffect(() => { void load().catch((failure) => setError((failure as Error).message)); }, []);
  return <section className="rounded-2xl border bg-white p-5 shadow-soft"><h1 className="text-2xl font-bold">Payments</h1><div className="mt-4 space-y-3">
    {items.map((item) => <div key={item._id} className="flex items-center justify-between rounded-xl border bg-slate-50 p-3"><div><div className="font-medium">{item.reference || item.saleId}</div><div className="text-sm text-slate-500">{item.method} · {item.status} · {item.receivedBy?.name || 'Staff'} · {new Date(item.createdAt).toLocaleString()}</div></div><div className="flex items-center gap-3 font-semibold">${item.amount.toFixed(2)}{item.status === 'received' ? <button type="button" onClick={() => setReverseTarget(item)} className="rounded border border-red-200 px-3 py-1 text-sm text-red-700">Reverse</button> : null}</div></div>)}
    {items.length === 0 ? <p className="text-sm text-slate-500">No payments found.</p> : null}{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}</div>
    {reverseTarget ? <ArchiveReason title={`Reverse payment $${reverseTarget.amount.toFixed(2)}?`} onCancel={() => setReverseTarget(null)} onConfirm={async (reason) => { await api(`/payments/${reverseTarget._id}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) }); setReverseTarget(null); await load(); }} /> : null}
  </section>;
}
