import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, ClipboardList, CreditCard, FileText, LayoutDashboard, LogOut, Menu, Moon, Package, Settings, ShoppingCart, Sun, UserCircle2, Users, Tags, Truck, UserCog, Wallet, ShoppingBag, X, TrendingUp, ReceiptText, Boxes, AlertTriangle, Plus, RefreshCw } from 'lucide-react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AuthProvider, useAuth } from './context/AuthContext';
import { api } from './lib/api';
import { ManagementPage, PaymentsPage, PurchasesPage } from './ManagementPages';
import { customerSchema, loginSchema, productSchema } from './lib/validation';
import type { Product, Sale, PrintingOrder } from './types';

const queryClient = new QueryClient();

type DashboardRange = 'today' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

function localDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromInput(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getDashboardBounds(range: DashboardRange, anchor: string, customFrom: string, customTo: string) {
  const today = new Date();
  let from: Date;
  let to: Date;
  if (range === 'today') {
    from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  } else if (range === 'custom') {
    from = dateFromInput(customFrom);
    to = dateFromInput(customTo);
    to.setDate(to.getDate() + 1);
  } else {
    const selected = dateFromInput(anchor);
    if (range === 'weekly') {
      from = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
      from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
      to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
    } else if (range === 'monthly') {
      from = new Date(selected.getFullYear(), selected.getMonth(), 1);
      to = new Date(selected.getFullYear(), selected.getMonth() + 1, 1);
    } else if (range === 'yearly') {
      from = new Date(selected.getFullYear(), 0, 1);
      to = new Date(selected.getFullYear() + 1, 0, 1);
    } else {
      from = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
      to = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + 1);
    }
  }
  return { from, to };
}

function formatMoney(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading, error, refresh } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-600">Loading...</div>;
  if (error) {
    return <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-red-700">
      <p>{error}</p>
      <button type="button" onClick={() => void refresh()} className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700">Retry</button>
    </div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function ReasonDialog({
  title,
  description,
  actionLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 3) {
      setError('Enter a reason of at least 3 characters.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onConfirm(reason.trim());
    } catch (failure) {
      setError((failure as Error).message || 'The action failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="reason-dialog-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="reason-dialog-title" className="text-xl font-bold text-brand-navy">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="reason-dialog-input">Reason</label>
        <textarea id="reason-dialog-input" autoFocus value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-300 p-3" />
        {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" disabled={saving} onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
          <button type="button" disabled={saving} onClick={() => void submit()} className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : actionLabel}</button>
        </div>
      </div>
    </div>
  );
}

function AppShell({ children }: { children: JSX.Element }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('nadra-theme') === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('nadra-theme', theme);
  }, [theme]);

  const navigationGroups = [
    { label: 'Workspace', items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard }] },
    { label: 'Sales & customers', items: [
      { label: 'POS', to: '/pos', icon: ShoppingCart },
      { label: 'Sales', to: '/sales', icon: CreditCard },
      { label: 'Payments', to: '/payments', icon: Wallet },
      { label: 'Customers', to: '/customers', icon: Users },
    ] },
    { label: 'Catalog & purchasing', items: [
      { label: 'Products', to: '/products', icon: Package },
      { label: 'Categories', to: '/categories', icon: Tags },
      { label: 'Suppliers', to: '/suppliers', icon: Truck },
      { label: 'Purchases', to: '/purchases', icon: ShoppingBag },
    ] },
    { label: 'Operations', items: [
      { label: 'Printing', to: '/printing', icon: ClipboardList },
      { label: 'Services', to: '/services', icon: ClipboardList },
      { label: 'Expenses', to: '/expenses', icon: FileText },
    ] },
    { label: 'Administration', items: [
      { label: 'Users', to: '/users', icon: UserCog },
      { label: 'Settings', to: '/settings', icon: Settings },
    ] },
  ];
  const currentPage = navigationGroups.flatMap((group) => group.items).find((item) => item.to === location.pathname)?.label || 'Workspace';

  return (
    <div className="app-shell min-h-screen bg-slate-100 text-slate-900">
      {mobileNavOpen ? <button type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} className="fixed inset-0 z-30 bg-slate-950/45 backdrop-blur-[2px] lg:hidden" /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[min(18rem,86vw)] flex-col border-r border-slate-200 bg-white shadow-soft transition-transform duration-200 lg:w-64 lg:translate-x-0 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-lg font-bold text-white shadow-sm">N</div>
          <div>
            <div className="text-lg font-bold tracking-tight text-brand-navy">Nadra</div>
            <div className="text-[11px] tracking-wide text-slate-500">Printing &amp; Stationery</div>
          </div>
          <button type="button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} className="ml-auto rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-teal lg:hidden"><X size={18} /></button>
        </div>

        <nav aria-label="Main navigation" className="app-navigation flex-1 space-y-5 overflow-y-auto px-3 py-5">
          {navigationGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{group.label}</p>
              <div className="space-y-1">
                {group.items.map(({ label, to, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMobileNavOpen(false)}
                    className={({ isActive }) =>
                      `app-nav-link flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                        isActive ? 'bg-brand-navy text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-brand-navy'
                      }`
                    }
                  >
                    <Icon size={18} strokeWidth={1.8} />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mx-3 mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-3">
            <UserCircle2 className="h-8 w-8 text-brand-teal" />
            <div className="min-w-0">
              <div className="font-medium text-slate-800">{user?.name || 'User'}</div>
              <div className="truncate text-xs capitalize text-slate-500">{user?.role || 'Role'}</div>
            </div>
          </div>
          <button
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-teal"
            onClick={async () => {
              await logout();
              setMobileNavOpen(false);
              navigate('/login');
            }}
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      <main className="min-h-screen px-4 pb-8 pt-4 sm:px-6 lg:ml-64 lg:px-8 lg:pt-6">
        <header className="mb-6 flex min-h-14 items-center justify-between rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 shadow-sm backdrop-blur sm:px-4">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" aria-label="Open navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-teal lg:hidden"><Menu size={20} /></button>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Nadra workspace</div>
              <div className="truncate text-sm font-semibold text-brand-navy sm:text-base">{currentPage}</div>
            </div>
          </div>
          <div className="ml-3 flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 sm:gap-3 sm:px-3">
            <button type="button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-teal">
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-semibold text-teal-700">{(user?.name || 'U').slice(0, 1).toUpperCase()}</span>
            <span className="hidden min-w-0 sm:block"><span className="block max-w-40 truncate text-sm font-medium text-slate-700">{user?.name || 'User'}</span><span className="block text-xs capitalize text-slate-500">{user?.role || 'Role'}</span></span>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: 'admin@nadra.local', password: '' },
  });

  const onSubmit = async (values: { email: string; password: string }) => {
    setServerError('');
    try {
      await login(values.email, values.password);
      navigate('/');
    } catch (e) {
      setServerError((e as Error).message || 'Login failed');
    }
  };

  return (
    <main className="login-page min-h-screen bg-brand-light text-slate-900">
      <div className="login-layout mx-auto grid min-h-screen w-full max-w-[1440px] grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="login-brand-panel relative hidden min-h-screen overflow-hidden bg-brand-navy px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-20 xl:py-16" aria-label="Nadra Printing and Stationery">
          <div className="login-paper-art" aria-hidden="true">
            <span className="login-paper-sheet login-paper-sheet-back" />
            <span className="login-paper-sheet login-paper-sheet-front" />
            <span className="login-paper-rule login-paper-rule-one" />
            <span className="login-paper-rule login-paper-rule-two" />
            <span className="login-paper-rule login-paper-rule-three" />
          </div>
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white text-2xl font-bold text-brand-navy shadow-lg">N</div>
            <div>
              <div className="text-xl font-bold tracking-tight">Nadra</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-[0.24em] text-slate-300">Printing &amp; Stationery</div>
            </div>
          </div>
          <div className="relative z-10 max-w-xl pb-12 xl:pb-20">
            <div className="mb-5 h-1 w-12 rounded-full bg-brand-teal" />
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-teal-300">Business management, made clear</p>
            <h1 className="max-w-lg text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">Everything your business needs, in one place.</h1>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-300">Manage your printing services, stationery inventory, customers, and daily operations with confidence.</p>
          </div>
          <p className="relative z-10 text-xs tracking-wide text-slate-400">A clearer view of your business.</p>
        </section>

        <section className="login-form-panel flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12 xl:px-20">
          <div className="login-form-card w-full max-w-[440px] rounded-2xl border border-slate-200/80 bg-white px-6 py-8 shadow-[0_24px_70px_rgba(20,33,61,0.09)] sm:px-10 sm:py-10">
            <div className="mb-9 flex items-center gap-3 lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-navy text-xl font-bold text-white shadow-sm">N</div>
              <div>
                <div className="text-xl font-bold tracking-tight text-brand-navy">Nadra</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-500">Printing &amp; Stationery</div>
              </div>
            </div>
            <div className="mb-8 hidden items-center gap-3 lg:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-teal" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Staff sign in</span>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-brand-navy">Welcome back</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Sign in to continue to your management workspace.</p>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700">Email
                  <input {...register('email')} aria-invalid={Boolean(errors.email)} className="login-input mt-2 h-[50px] w-full rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-normal text-slate-900 outline-none transition placeholder:text-slate-400" />
                </label>
                {errors.email ? <p role="alert" className="mt-2 text-xs font-medium text-red-600">{errors.email.message}</p> : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Password
                  <input type="password" {...register('password')} aria-invalid={Boolean(errors.password)} className="login-input mt-2 h-[50px] w-full rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-normal text-slate-900 outline-none transition placeholder:text-slate-400" />
                </label>
                {errors.password ? <p role="alert" className="mt-2 text-xs font-medium text-red-600">{errors.password.message}</p> : null}
              </div>
              {serverError ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">{serverError}</div> : null}
              <button disabled={isSubmitting} className="login-submit flex h-[50px] w-full items-center justify-center rounded-xl bg-brand-navy px-4 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? 'Signing in...' : 'Login'}
              </button>
            </form>
            <p className="mt-8 border-t border-slate-100 pt-5 text-center text-xs leading-5 text-slate-500">Secure access for Nadra team members</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function DashboardPage() {
  type DashboardData = {
    range: DashboardRange;
    from: string;
    to: string;
    salesTotal: number;
    expenseTotal: number;
    grossProfit: number;
    netProfit: number;
    salesCount: number;
    pendingOrders: number;
    completedOrdersToday: number;
    productCount: number;
    lowStockCount: number;
    lowStockProducts: Array<{ _id: string; name: string; sku: string; stock: number; reorderLevel?: number }>;
    recentSales: Array<Sale & { customer?: { name?: string } | null }>;
    recentOrders: Array<PrintingOrder & { createdAt?: string }>;
    topProducts: Array<{ _id: string; name: string; sku: string; quantity: number; revenue: number }>;
    chartBuckets: Array<{ key: string; label: string; sales: number; expenses: number; transactions: number }>;
    previousPeriod: { salesTotal: number; expenseTotal: number; grossProfit: number; netProfit: number; salesCount: number };
  };
  const navigate = useNavigate();
  const [range, setRange] = useState<DashboardRange>('today');
  const [anchorDate, setAnchorDate] = useState(() => localDateInput(new Date()));
  const [customFrom, setCustomFrom] = useState(() => localDateInput(new Date()));
  const [customTo, setCustomTo] = useState(() => localDateInput(new Date()));
  const today = localDateInput(new Date());
  const { from, to } = getDashboardBounds(range, anchorDate, customFrom, customTo);
  const validCustomRange = range !== 'custom' || customFrom <= customTo;
  const params = new URLSearchParams({ range, from: from.toISOString(), to: to.toISOString() });
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['dashboard', range, from.toISOString(), to.toISOString()],
    queryFn: () => api<DashboardData>(`/dashboard?${params.toString()}`),
    enabled: validCustomRange,
  });
  const periodLabel = range === 'today' ? 'Today'
    : range === 'daily' ? dateFromInput(anchorDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : range === 'weekly' ? 'Selected week'
        : range === 'monthly' ? dateFromInput(anchorDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
          : range === 'yearly' ? dateFromInput(anchorDate).getFullYear().toString()
            : 'Custom period';
  const metrics = [
    { label: range === 'today' ? "Today's sales" : 'Sales revenue', value: data?.salesTotal, previous: data?.previousPeriod.salesTotal, icon: TrendingUp, color: 'teal' },
    { label: range === 'today' ? "Today's expenses" : 'Expenses', value: data?.expenseTotal, previous: data?.previousPeriod.expenseTotal, icon: ReceiptText, color: 'amber' },
    { label: 'Gross profit', value: data?.grossProfit, previous: data?.previousPeriod.grossProfit, icon: ArrowUpRight, color: 'navy' },
    { label: 'Net profit', value: data?.netProfit, previous: data?.previousPeriod.netProfit, icon: CreditCard, color: 'blue' },
  ];
  const comparison = (current?: number, previous?: number) => {
    if (current === undefined || previous === undefined || previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  };
  const empty = data?.salesCount === 0;

  if (error) return <section className="dashboard-card flex flex-col items-start gap-4 border border-red-200 bg-white p-6 sm:p-8">
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600"><AlertTriangle size={21} /></div>
    <div><h1 className="text-xl font-semibold text-brand-navy">Dashboard data is unavailable</h1><p className="mt-1 text-sm text-slate-500">{(error as Error).message || 'Could not load analytics right now.'}</p></div>
    <button type="button" onClick={() => void refetch()} className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white"><RefreshCw size={16} /> Retry</button>
  </section>;

  return (
    <div className="dashboard-page space-y-5 sm:space-y-6">
      <section className="dashboard-heading flex flex-col justify-between gap-4 rounded-2xl bg-brand-navy p-5 text-white shadow-soft sm:flex-row sm:items-center sm:p-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-teal-200"><span className="h-1.5 w-1.5 rounded-full bg-brand-teal" /> Business overview</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-300">{periodLabel} · Revenue, expenses, and daily operations</p>
        </div>
        <div className="dashboard-filter grid grid-cols-2 gap-2 rounded-xl border border-white/15 bg-white/5 p-2 sm:flex sm:items-center">
          <label className="sr-only" htmlFor="dashboard-range">Analytics period</label>
          <select id="dashboard-range" value={range} onChange={(event) => setRange(event.target.value as DashboardRange)} className="dashboard-range-select col-span-2 h-10 min-w-36 rounded-lg border border-white/15 bg-white/10 px-3 text-sm font-medium text-white sm:col-span-1">
            <option value="today">Today</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="custom">Custom date range</option>
          </select>
          {range !== 'today' && range !== 'custom' ? <label className="dashboard-date-label col-span-2 flex items-center gap-2 text-xs text-slate-300 sm:col-span-1">
            <span className="sm:sr-only">Choose reference date</span>
            <input type="date" aria-label="Choose reference date" max={today} value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} className="dashboard-date-input h-10 w-full rounded-lg border border-white/15 bg-white/10 px-2 text-sm text-white sm:w-auto" />
          </label> : null}
          {range === 'custom' ? <>
            <input type="date" aria-label="Custom start date" max={today} value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="dashboard-date-input h-10 min-w-0 rounded-lg border border-white/15 bg-white/10 px-2 text-sm text-white" />
            <input type="date" aria-label="Custom end date" max={today} min={customFrom} value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="dashboard-date-input h-10 min-w-0 rounded-lg border border-white/15 bg-white/10 px-2 text-sm text-white" />
          </> : null}
        </div>
      </section>

      {!validCustomRange ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">The end date must be on or after the start date.</p> : null}
      {isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="dashboard-card h-32 animate-pulse bg-white p-5"><div className="h-3 w-24 rounded bg-slate-200" /><div className="mt-5 h-7 w-36 rounded bg-slate-100" /><div className="mt-4 h-3 w-28 rounded bg-slate-100" /></div>)}</div> : null}
      {!isLoading && data ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, previous, icon: Icon, color }) => {
            const change = comparison(value, previous);
            return <article key={label} className="dashboard-card dashboard-metric relative overflow-hidden border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
              <div className={`dashboard-metric-accent dashboard-accent-${color}`} />
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight text-brand-navy sm:text-[1.75rem]">{formatMoney(value || 0)}</p></div>
                <span className={`dashboard-icon dashboard-icon-${color}`}><Icon size={19} strokeWidth={2} /></span>
              </div>
              <div className="mt-3 flex min-h-5 items-center gap-1.5 text-xs">
                {change === null ? <span className="text-slate-400">No comparison available</span> : <>
                  <span className={`inline-flex items-center gap-0.5 font-semibold ${change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(change).toFixed(1)}%
                  </span>
                  <span className="text-slate-400">vs previous period</span>
                </>}
              </div>
            </article>;
          })}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.85fr)]">
          <section className="dashboard-card min-w-0 border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-semibold text-brand-navy">Sales &amp; Revenue Overview</h2><p className="mt-1 text-sm text-slate-500">Revenue and recorded expenses · {periodLabel}</p></div>
              {isFetching ? <span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><RefreshCw size={13} className="animate-spin" /> Updating</span> : null}
            </div>
            {empty ? <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">No sales recorded in this period. The chart shows zero values for the selected dates.</p> : null}
            <div className="mt-4 h-[260px] w-full sm:h-[310px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.chartBuckets} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
                  <defs><linearGradient id="dashboardSalesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14B8A6" stopOpacity={0.24} /><stop offset="92%" stopColor="#14B8A6" stopOpacity={0.01} /></linearGradient></defs>
                  <CartesianGrid stroke="var(--dashboard-grid)" vertical={false} strokeDasharray="3 5" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--dashboard-muted)', fontSize: 11 }} minTickGap={18} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--dashboard-muted)', fontSize: 11 }} tickFormatter={(value: number) => `$${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`} width={48} />
                  <Tooltip formatter={(value: number, name: string) => [formatMoney(value), name === 'sales' ? 'Sales revenue' : 'Expenses']} contentStyle={{ background: 'var(--dashboard-tooltip)', border: '1px solid var(--dashboard-border)', borderRadius: 12, color: 'var(--dashboard-text)', boxShadow: 'var(--dashboard-shadow)' }} labelStyle={{ color: 'var(--dashboard-muted)', marginBottom: 4 }} />
                  <Legend formatter={(value) => value === 'sales' ? 'Sales revenue' : 'Expenses'} wrapperStyle={{ fontSize: 12, color: 'var(--dashboard-muted)' }} />
                  <Area type="monotone" dataKey="sales" name="sales" stroke="#14B8A6" strokeWidth={2.5} fill="url(#dashboardSalesFill)" activeDot={{ r: 5, strokeWidth: 0 }} isAnimationActive animationDuration={450} />
                  <Line type="monotone" dataKey="expenses" name="expenses" stroke="#52627e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive animationDuration={450} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
            <section className="dashboard-card border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
              <div className="flex items-center justify-between"><div><h2 className="font-semibold text-brand-navy">Sales performance</h2><p className="mt-1 text-xs text-slate-500">For {periodLabel.toLowerCase()}</p></div><span className="dashboard-icon dashboard-icon-teal"><Boxes size={18} /></span></div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Transactions</p><p className="mt-1 text-xl font-semibold text-brand-navy">{data.salesCount.toLocaleString()}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Average sale</p><p className="mt-1 text-xl font-semibold text-brand-navy">{formatMoney(data.salesCount ? data.salesTotal / data.salesCount : 0)}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Pending print jobs</p><p className="mt-1 text-xl font-semibold text-brand-navy">{data.pendingOrders}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Active products</p><p className="mt-1 text-xl font-semibold text-brand-navy">{data.productCount}</p></div>
              </div>
            </section>

            <section className="dashboard-card min-w-0 border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
              <div className="flex items-center justify-between gap-2"><div><h2 className="font-semibold text-brand-navy">Best-selling products</h2><p className="mt-1 text-xs text-slate-500">By units sold · selected period</p></div><button type="button" onClick={() => navigate('/sales')} className="text-xs font-semibold text-teal-700 hover:text-teal-800">Sales history</button></div>
              {data.topProducts.length ? <div className="mt-3 h-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topProducts} layout="vertical" margin={{ top: 2, right: 12, left: 4, bottom: 2 }}>
                    <CartesianGrid stroke="var(--dashboard-grid)" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={104} tickLine={false} axisLine={false} tick={{ fill: 'var(--dashboard-muted)', fontSize: 10 }} tickFormatter={(name: string) => name.length > 16 ? `${name.slice(0, 15)}…` : name} />
                    <Tooltip formatter={(value: number) => [`${value} units`, 'Sold']} contentStyle={{ background: 'var(--dashboard-tooltip)', border: '1px solid var(--dashboard-border)', borderRadius: 12, color: 'var(--dashboard-text)' }} />
                    <Bar dataKey="quantity" fill="#14B8A6" radius={[0, 6, 6, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div> : <p className="mt-5 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No product sales in this period.</p>}
            </section>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="dashboard-card min-w-0 border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold text-brand-navy">Recent sales</h2><p className="mt-1 text-xs text-slate-500">Latest transactions in this period</p></div><button type="button" onClick={() => navigate('/sales')} className="text-xs font-semibold text-teal-700 hover:text-teal-800">View all</button></div>
            {data.recentSales.length ? <div className="overflow-x-auto"><table className="dashboard-table w-full min-w-[520px] text-left text-sm"><thead><tr><th>Sale</th><th>Customer</th><th>Date</th><th>Status</th><th className="text-right">Total</th></tr></thead><tbody>
              {data.recentSales.map((sale) => <tr key={sale._id}><td className="font-medium text-brand-navy">{sale.transactionNumber}</td><td className="max-w-32 truncate">{sale.customer?.name || 'Walk-in'}</td><td>{new Date(sale.createdAt).toLocaleDateString()}</td><td><span className={`dashboard-status ${sale.balance > 0 ? 'dashboard-status-warning' : 'dashboard-status-success'}`}>{sale.balance > 0 ? 'Balance due' : 'Paid'}</span></td><td className="text-right font-semibold">{formatMoney(sale.total)}</td></tr>)}
            </tbody></table></div> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No sales recorded in this period.</p>}
          </section>

          <section className="dashboard-card min-w-0 border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold text-brand-navy">Recent printing orders</h2><p className="mt-1 text-xs text-slate-500">Latest job activity in this period</p></div><button type="button" onClick={() => navigate('/printing')} className="text-xs font-semibold text-teal-700 hover:text-teal-800">View orders</button></div>
            {data.recentOrders.length ? <div className="overflow-x-auto"><table className="dashboard-table w-full min-w-[500px] text-left text-sm"><thead><tr><th>Order</th><th>Customer / service</th><th>Status</th><th className="text-right">Total</th></tr></thead><tbody>
              {data.recentOrders.map((order) => <tr key={order._id}><td className="font-medium text-brand-navy">{order.orderNumber}<div className="mt-0.5 text-xs font-normal">{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ''}</div></td><td className="max-w-40 truncate">{order.customerName}<div className="mt-0.5 text-xs">{order.serviceName}</div></td><td><span className={`dashboard-status ${order.status === 'Completed' ? 'dashboard-status-success' : order.status === 'Cancelled' ? 'dashboard-status-danger' : 'dashboard-status-neutral'}`}>{order.status}</span></td><td className="text-right font-semibold">{formatMoney(order.total)}</td></tr>)}
            </tbody></table></div> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No printing orders in this period.</p>}
          </section>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
          <section className="dashboard-card border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
            <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-brand-navy">Low-stock alerts</h2><p className="mt-1 text-xs text-slate-500">Items at or below their reorder threshold</p></div><span className="dashboard-icon dashboard-icon-amber"><AlertTriangle size={18} /></span></div>
            {data.lowStockProducts.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {data.lowStockProducts.map((product) => <button type="button" key={product._id} onClick={() => navigate('/products')} className="dashboard-stock-row flex min-w-0 items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-left transition hover:border-amber-200">
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-800">{product.name}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{product.sku}</span></span>
                <span className="shrink-0 text-right"><span className="block text-sm font-semibold text-amber-800">{product.stock} left</span><span className="text-[10px] text-amber-700">Reorder at {product.reorderLevel ?? 10}</span></span>
              </button>)}
            </div> : <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Stock levels look good. No products need reordering.</p>}
          </section>

          <section className="dashboard-card border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
            <div className="flex items-center justify-between"><div><h2 className="font-semibold text-brand-navy">Quick actions</h2><p className="mt-1 text-xs text-slate-500">Jump into a workflow</p></div><span className="dashboard-icon dashboard-icon-navy"><Plus size={18} /></span></div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[{ label: 'New sale', path: '/pos', icon: CreditCard }, { label: 'Add product', path: '/products', icon: Boxes }, { label: 'New print order', path: '/printing', icon: ClipboardList }, { label: 'Add customer', path: '/customers', icon: Users }, { label: 'Record expense', path: '/expenses', icon: ReceiptText }].map(({ label, path, icon: Icon }) => <button type="button" key={path} onClick={() => navigate(path)} className="dashboard-action flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"><Icon size={16} className="shrink-0 text-teal-700" />{label}</button>)}
            </div>
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">{data.salesCount} sales · {data.pendingOrders} open print jobs · {data.lowStockCount} low-stock items</p>
          </section>
        </div>
      </> : null}
    </div>
  );
}

function POSPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Array<{ product: Product; qty: number }>>([]);
  const [customerId, setCustomerId] = useState('');
  const [amountPaid, setAmountPaid] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void api<{ items: Product[] }>('/products').then((res) => setProducts(res.items || [])).catch((error) => setMessage((error as Error).message));
  }, []);
  const idempotencyKey = useRef<string | null>(null);

  const addItem = (product: Product) => {
    setCart((current) => {
      const index = current.findIndex((item) => item.product._id === product._id);
      if (index >= 0) {
        const clone = [...current];
        clone[index] = { ...clone[index], qty: clone[index].qty + 1 };
        return clone;
      }
      return [...current, { product, qty: 1 }];
    });
  };

  const subtotal = cart.reduce((sum, item) => sum + item.product.sellingPrice * item.qty, 0);
  const discountValue = Number(discount || 0);
  const total = Math.max(0, subtotal - discountValue);

  const handleCheckout = async () => {
    setLoading(true);
    setMessage('');
    try {
      await api('/sales', {
        method: 'POST',
        body: JSON.stringify({
          items: cart.map((item) => ({ productId: item.product._id, quantity: item.qty, unitPrice: item.product.sellingPrice })),
          customerId,
          amountPaid: Number(amountPaid || 0),
          discount: discountValue,
          paymentMethod: 'cash',
          idempotencyKey: idempotencyKey.current || (idempotencyKey.current = crypto.randomUUID()),
        }),
      });
      setMessage('Sale created successfully');
      idempotencyKey.current = null;
      setCart([]);
      setAmountPaid('0');
      setDiscount('0');
    } catch (e) {
      setMessage((e as Error).message || 'Sale failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h1 className="text-2xl font-bold text-brand-navy">Point of Sale</h1>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {products.map((product) => (
            <button key={product._id} onClick={() => addItem(product)} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-brand-teal">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-800">{product.name}</div>
                <div className="text-xs text-slate-500">stock {product.stock}</div>
              </div>
              <div className="mt-2 text-sm text-slate-600">{product.sku}</div>
              <div className="mt-2 text-lg font-bold text-brand-navy">${product.sellingPrice.toFixed(2)}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-xl font-bold text-brand-navy">Cart</h2>
        <div className="mt-4 space-y-3">
          {cart.length === 0 ? <div className="text-slate-500">No items added</div> : cart.map((item) => (
            <div key={item.product._id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <div>
                <div className="font-medium">{item.product.name}</div>
                <div className="text-xs text-slate-500">Qty: {item.qty}</div>
              </div>
              <div className="font-semibold text-brand-navy">${(item.product.sellingPrice * item.qty).toFixed(2)}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>Discount</span><input type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1 text-right" /></div>
          <div className="flex justify-between"><span>Total</span><span>${total.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>Paid</span><input type="number" min="0" max={total} step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1 text-right" /></div>
          <div className="flex justify-between"><span>Balance</span><span>${Math.max(0, total - Number(amountPaid || 0)).toFixed(2)}</span></div>
          <input placeholder="Customer ID (optional)" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-2" />
        </div>

        {message ? <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}
        <button onClick={handleCheckout} disabled={loading || cart.length === 0} className="mt-6 w-full rounded-xl bg-brand-teal px-4 py-3 font-semibold text-white disabled:opacity-50">{loading ? 'Processing...' : 'Complete Sale'}</button>
      </div>
    </div>
  );
}

function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [serverError, setServerError] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', sku: '', category: 'Stationery', sellingPrice: 0, costPrice: 0, stock: 0 },
  });

  const loadProducts = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), limit: '20', search });
    const data = await api<{ items: Product[]; total: number }>(`/products?${query.toString()}`);
    setProducts(data.items || []);
    setTotal(data.total || 0);
  }, [page, search]);

  useEffect(() => {
    void loadProducts().catch((error) => setServerError((error as Error).message));
  }, [loadProducts]);

  const onSubmit = async (values: { name: string; sku: string; category: string; sellingPrice: number; costPrice: number; stock: number }) => {
    setServerError('');
    try {
      await api(editingProduct ? `/products/${editingProduct._id}` : '/products', {
        method: editingProduct ? 'PUT' : 'POST',
        body: JSON.stringify(values),
      });
      setEditingProduct(null);
      reset({ name: '', sku: '', category: 'Stationery', sellingPrice: 0, costPrice: 0, stock: 0 });
      await loadProducts();
    } catch (e) {
      setServerError((e as Error).message || 'Failed to save product');
    }
  };

  const editProduct = (product: Product) => {
    setEditingProduct(product);
    reset({
      name: product.name,
      sku: product.sku,
      category: product.category,
      sellingPrice: product.sellingPrice,
      costPrice: product.costPrice,
      stock: product.stock,
    });
  };

  const archiveProduct = async (product: Product, reason: string) => {
      await api(`/products/${product._id}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
      await loadProducts();
      setArchiveTarget(null);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h1 className="text-2xl font-bold text-brand-navy">Products</h1>
        <input aria-label="Search products" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, SKU, or barcode" className="mt-4 w-full rounded border border-slate-300 px-3 py-2" />
        <div className="mt-4 space-y-3">
          {products.map((product) => (
            <div key={product._id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div>
                <div className="font-medium">{product.name}</div>
                <div className="text-xs text-slate-500">{product.sku} • {product.category}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                <div className="font-semibold text-brand-navy">${product.sellingPrice.toFixed(2)}</div>
                <div className="text-xs text-slate-500">Stock {product.stock}</div>
                </div>
                <button type="button" onClick={() => editProduct(product)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm">Edit</button>
                <button type="button" onClick={() => setArchiveTarget(product)} className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-700">Archive</button>
              </div>
            </div>
          ))}
          {products.length === 0 ? <p className="text-sm text-slate-500">No active products found.</p> : null}
        </div>
        <div className="mt-4 flex items-center justify-between text-sm"><span>{total} products · page {page}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button><button type="button" disabled={page * 20 >= total} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button></div></div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-xl font-bold text-brand-navy">{editingProduct ? 'Edit product' : 'Add product'}</h2>
        <div className="mt-4 space-y-3">
          <div>
            <input placeholder="Product name" {...register('name')} className="w-full rounded border border-slate-300 px-3 py-2" />
            {errors.name ? <p className="mt-1 text-xs text-red-600">{errors.name.message}</p> : null}
          </div>
          <div>
            <input placeholder="SKU" {...register('sku')} className="w-full rounded border border-slate-300 px-3 py-2" />
            {errors.sku ? <p className="mt-1 text-xs text-red-600">{errors.sku.message}</p> : null}
          </div>
          <div>
            <input placeholder="Category" {...register('category')} className="w-full rounded border border-slate-300 px-3 py-2" />
            {errors.category ? <p className="mt-1 text-xs text-red-600">{errors.category.message}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input type="number" step="0.01" placeholder="Cost price" {...register('costPrice', { valueAsNumber: true })} className="w-full rounded border border-slate-300 px-3 py-2" />
              {errors.costPrice ? <p className="mt-1 text-xs text-red-600">{errors.costPrice.message}</p> : null}
            </div>
            <div>
              <input type="number" step="0.01" placeholder="Selling price" {...register('sellingPrice', { valueAsNumber: true })} className="w-full rounded border border-slate-300 px-3 py-2" />
              {errors.sellingPrice ? <p className="mt-1 text-xs text-red-600">{errors.sellingPrice.message}</p> : null}
            </div>
          </div>
          <div>
            <input type="number" placeholder="Stock" {...register('stock', { valueAsNumber: true })} className="w-full rounded border border-slate-300 px-3 py-2" />
            {errors.stock ? <p className="mt-1 text-xs text-red-600">{errors.stock.message}</p> : null}
          </div>
        </div>
        {serverError ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</div> : null}
        <button disabled={isSubmitting} className="mt-4 w-full rounded-xl bg-brand-navy px-4 py-3 font-semibold text-white disabled:opacity-50">{isSubmitting ? 'Saving...' : editingProduct ? 'Save changes' : 'Save product'}</button>
        {editingProduct ? <button type="button" onClick={() => { setEditingProduct(null); reset({ name: '', sku: '', category: 'Stationery', sellingPrice: 0, costPrice: 0, stock: 0 }); }} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700">Cancel</button> : null}
      </form>
      {archiveTarget ? <ReasonDialog
        title={`Archive ${archiveTarget.name}?`}
        description="The product will be hidden from active inventory. Historical sales will be retained."
        actionLabel="Archive product"
        onCancel={() => setArchiveTarget(null)}
        onConfirm={(reason) => archiveProduct(archiveTarget, reason)}
      /> : null}
    </div>
  );
}

function CustomersPage() {
  type CustomerRecord = { _id: string; name: string; phone: string; email?: string; organization?: string; address?: string; notes?: string };
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [search, setSearch] = useState('');
  const [serverError, setServerError] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CustomerRecord | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', phone: '', email: '', organization: '', address: '' },
  });

  const loadCustomers = useCallback(async () => {
    const result = await api<{ items: CustomerRecord[] }>(`/customers?search=${encodeURIComponent(search)}`);
    setCustomers(result.items || []);
  }, [search]);

  useEffect(() => {
    void loadCustomers().catch((error) => setServerError((error as Error).message));
  }, [loadCustomers]);

  const onSubmit = async (values: { name: string; phone?: string; email?: string; organization?: string; address?: string }) => {
    setServerError('');
    try {
      await api(editingCustomer ? `/customers/${editingCustomer._id}` : '/customers', {
        method: editingCustomer ? 'PUT' : 'POST',
        body: JSON.stringify(values),
      });
      setEditingCustomer(null);
      reset({ name: '', phone: '', email: '', organization: '', address: '' });
      await loadCustomers();
    } catch (e) {
      setServerError((e as Error).message || 'Failed to save customer');
    }
  };

  const editCustomer = (customer: CustomerRecord) => {
    setEditingCustomer(customer);
    reset({
      name: customer.name,
      phone: customer.phone || '',
      email: customer.email || '',
      organization: customer.organization || '',
      address: customer.address || '',
    });
  };

  const archiveCustomer = async (customer: CustomerRecord, reason: string) => {
      await api(`/customers/${customer._id}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
      await loadCustomers();
      setArchiveTarget(null);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h1 className="text-2xl font-bold text-brand-navy">Customers</h1>
        <input aria-label="Search customers" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or phone" className="mt-4 w-full rounded border border-slate-300 px-3 py-2" />
        <div className="mt-4 space-y-3">
          {customers.map((customer) => (
            <div key={customer._id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div>
                <div className="font-medium text-slate-800">{customer.name}</div>
                <div className="text-sm text-slate-500">{customer.phone || 'No phone'}</div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => editCustomer(customer)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm">Edit</button>
                <button type="button" onClick={() => setArchiveTarget(customer)} className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-700">Archive</button>
              </div>
            </div>
          ))}
          {customers.length === 0 ? <p className="text-sm text-slate-500">No active customers found.</p> : null}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-xl font-bold text-brand-navy">{editingCustomer ? 'Edit customer' : 'Add customer'}</h2>
        <div className="mt-4 space-y-3">
          <div>
            <input {...register('name')} placeholder="Customer name" className="w-full rounded border border-slate-300 px-3 py-2" />
            {errors.name ? <p className="mt-1 text-xs text-red-600">{errors.name.message}</p> : null}
          </div>
          <div>
            <input {...register('phone')} placeholder="Phone" className="w-full rounded border border-slate-300 px-3 py-2" />
            {errors.phone ? <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p> : null}
          </div>
          <div>
            <input {...register('email')} placeholder="Email (optional)" className="w-full rounded border border-slate-300 px-3 py-2" />
            {errors.email ? <p className="mt-1 text-xs text-red-600">{errors.email.message}</p> : null}
          </div>
        </div>
        {serverError ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</div> : null}
        <button disabled={isSubmitting} className="mt-4 w-full rounded-xl bg-brand-navy px-4 py-3 font-semibold text-white disabled:opacity-50">{isSubmitting ? 'Saving...' : editingCustomer ? 'Save changes' : 'Save'}</button>
        {editingCustomer ? <button type="button" onClick={() => { setEditingCustomer(null); reset({ name: '', phone: '', email: '', organization: '', address: '' }); }} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700">Cancel</button> : null}
      </form>
      {archiveTarget ? <ReasonDialog
        title={`Archive ${archiveTarget.name}?`}
        description="The customer will be hidden from active lists. Historical transactions remain preserved."
        actionLabel="Archive customer"
        onCancel={() => setArchiveTarget(null)}
        onConfirm={(reason) => archiveCustomer(archiveTarget, reason)}
      /> : null}
    </div>
  );
}

function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);

  const loadSales = async () => {
    const result = await api<{ items: Sale[] }>('/sales');
    setSales(result.items || []);
  };
  useEffect(() => { void loadSales().catch((error) => setServerError((error as Error).message)); }, []);

  const viewSale = async (sale: Sale) => {
    setServerError('');
    try {
      const result = await api<{ sale: Sale }>(`/sales/${sale._id}`);
      setSelectedSale(result.sale);
    } catch (error) {
      setServerError((error as Error).message);
    }
  };

  const receivePayment = async () => {
    if (!selectedSale) return;
    setSaving(true);
    setServerError('');
    try {
      const result = await api<{ sale: Sale }>(`/sales/${selectedSale._id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(paymentAmount), method: 'cash' }),
      });
      setSelectedSale(result.sale);
      setPaymentAmount('');
      await loadSales();
    } catch (error) {
      setServerError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const voidSale = async (sale: Sale, reason: string) => {
    setSaving(true);
    setServerError('');
    try {
      const result = await api<{ sale: Sale }>(`/sales/${sale._id}/void`, { method: 'POST', body: JSON.stringify({ reason }) });
      setSelectedSale(result.sale);
      setVoidTarget(null);
      await loadSales();
    } catch (error) {
      setServerError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h1 className="text-2xl font-bold text-brand-navy">Sales</h1>
        <div className="mt-4 space-y-3">
          {sales.map((sale) => (
            <button type="button" key={sale._id} onClick={() => void viewSale(sale)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
              <div>
                <div className="font-medium">{sale.transactionNumber}</div>
                <div className="text-xs text-slate-500">{new Date(sale.createdAt).toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-brand-navy">${sale.total.toFixed(2)}</div>
                <div className="text-xs text-slate-500">{sale.status}</div>
              </div>
            </button>
          ))}
          {sales.length === 0 ? <p className="text-sm text-slate-500">No sales found.</p> : null}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-xl font-bold text-brand-navy">Sale details</h2>
        {selectedSale ? <>
          <div className="mt-4 space-y-2 text-sm">
            <p>Receipt: {selectedSale.transactionNumber}</p>
            <p>Status: {selectedSale.status}</p>
            <div className="border-y border-slate-200 py-2">
              {selectedSale.items?.map((item, index) => <div key={`${item.name}-${index}`} className="flex justify-between gap-3 py-1">
                <span>{item.name} × {item.quantity} @ ${item.unitPrice.toFixed(2)}</span>
                <span>${item.total.toFixed(2)}</span>
              </div>)}
            </div>
            <p>Total: ${selectedSale.total.toFixed(2)}</p>
            <p>Paid: ${selectedSale.amountPaid.toFixed(2)}</p>
            <p>Balance: ${selectedSale.balance.toFixed(2)}</p>
          </div>
          {selectedSale.balance > 0 && selectedSale.status !== 'voided' ? <div className="mt-4 flex gap-2">
            <input type="number" min="0.01" max={selectedSale.balance} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="Payment amount" className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2" />
            <button type="button" disabled={saving} onClick={() => void receivePayment()} className="rounded-lg bg-brand-teal px-3 py-2 text-white disabled:opacity-50">Receive</button>
          </div> : null}
          {selectedSale.status !== 'voided' ? <button type="button" disabled={saving} onClick={() => setVoidTarget(selectedSale)} className="mt-3 rounded-lg border border-red-200 px-3 py-2 text-red-700 disabled:opacity-50">Void sale</button> : null}
        </> : <p className="mt-3 text-sm text-slate-500">Select a sale to view its receipt and payment balance.</p>}
        {serverError ? <p role="alert" className="mt-3 text-sm text-red-700">{serverError}</p> : null}
      </div>
      {voidTarget ? <ReasonDialog
        title={`Void sale ${voidTarget.transactionNumber}?`}
        description="Stock will be restored, payments will be marked reversed, and the original receipt will remain in history."
        actionLabel="Void sale"
        onCancel={() => setVoidTarget(null)}
        onConfirm={(reason) => voidSale(voidTarget, reason)}
      /> : null}
    </div>
  );
}

function PrintingPage() {
  const [services, setServices] = useState<Array<{ _id: string; name: string; pricePerPage: number }>>([]);
  const [orders, setOrders] = useState<PrintingOrder[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [pages, setPages] = useState('10');
  const [copies, setCopies] = useState('1');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PrintingOrder | null>(null);

  const loadOrders = async () => {
    const result = await api<{ items: PrintingOrder[] }>('/printing-orders');
    setOrders(result.items || []);
  };
  useEffect(() => {
    void Promise.all([
      api<{ items: Array<{ _id: string; name: string; pricePerPage: number }> }>('/printing-services').then((result) => setServices(result.items || [])),
      loadOrders(),
    ]).catch((error) => setServerError((error as Error).message));
  }, []);

  const handleCreate = async () => {
    setSaving(true);
    setServerError('');
    try {
      await api('/printing-orders', {
        method: 'POST',
        body: JSON.stringify({ customerName, serviceId, pages: Number(pages), copies: Number(copies), amountPaid: Number(paymentAmount || 0) }),
      });
      await loadOrders();
      setCustomerName('');
      setServiceId('');
      setPages('10');
      setCopies('1');
      setPaymentAmount('');
    } catch (error) {
      setServerError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (order: PrintingOrder, status: string, reason?: string) => {
    setSaving(true);
    setServerError('');
    try {
      await api(`/printing-orders/${order._id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) });
      await loadOrders();
      setCancelTarget(null);
    } catch (error) {
      setServerError((error as Error).message);
      if (reason) throw error;
    } finally {
      setSaving(false);
    }
  };

  const receivePayment = async (order: PrintingOrder) => {
    setSaving(true);
    setServerError('');
    try {
      await api(`/printing-orders/${order._id}/payments`, { method: 'POST', body: JSON.stringify({ amount: Number(paymentAmount), method: 'cash' }) });
      await loadOrders();
      setPaymentAmount('');
    } catch (error) {
      setServerError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h1 className="text-2xl font-bold text-brand-navy">Printing Orders</h1>
        <div className="mt-4 space-y-3">
          {orders.map((order) => (
            <div key={order._id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div>
                <div className="font-medium">{order.orderNumber}</div>
                <div className="text-xs text-slate-500">{order.customerName}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-brand-navy">${order.total.toFixed(2)}</div>
                <div className="text-xs text-slate-500">{order.status}</div>
                <div className="text-xs text-slate-500">Balance ${order.balance.toFixed(2)}</div>
              </div>
              <div className="ml-4 flex flex-col gap-2">
                <select aria-label={`Status for ${order.orderNumber}`} value={order.status} disabled={saving || order.status === 'Completed' || order.status === 'Cancelled'} onChange={(event) => event.target.value === 'Cancelled' ? setCancelTarget(order) : void updateStatus(order, event.target.value)} className="rounded border border-slate-300 px-2 py-1 text-xs">
                  {['Received', 'Awaiting payment', 'Queued', 'In progress', 'Ready for collection', 'Completed', 'Cancelled'].map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                {order.balance > 0 && !['Completed', 'Cancelled'].includes(order.status) ? <div className="flex gap-1">
                  <input aria-label={`Payment amount for ${order.orderNumber}`} type="number" min="0.01" max={order.balance} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1 text-xs" />
                  <button type="button" disabled={saving} onClick={() => void receivePayment(order)} className="rounded bg-brand-teal px-2 py-1 text-xs text-white disabled:opacity-50">Pay</button>
                </div> : null}
              </div>
            </div>
          ))}
          {orders.length === 0 ? <p className="text-sm text-slate-500">No printing orders found.</p> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-xl font-bold text-brand-navy">Create order</h2>
        <div className="mt-4 space-y-3">
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" className="w-full rounded border border-slate-300 px-3 py-2" />
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2">
            <option value="">Select service</option>
            {services.map((service) => (
              <option key={service._id} value={service._id}>{service.name}</option>
            ))}
          </select>
          <input type="number" min="1" step="1" value={pages} onChange={(e) => setPages(e.target.value)} aria-label="Page count" className="w-full rounded border border-slate-300 px-3 py-2" />
          <input type="number" min="1" step="1" value={copies} onChange={(e) => setCopies(e.target.value)} aria-label="Copies" className="w-full rounded border border-slate-300 px-3 py-2" />
          <input type="number" min="0" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Optional initial payment" className="w-full rounded border border-slate-300 px-3 py-2" />
          <button disabled={saving || !customerName.trim() || !serviceId} onClick={() => void handleCreate()} className="w-full rounded-xl bg-brand-navy px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Create order'}</button>
          {serverError ? <p role="alert" className="text-sm text-red-700">{serverError}</p> : null}
        </div>
      </div>
      {cancelTarget ? <ReasonDialog
        title={`Cancel printing order ${cancelTarget.orderNumber}?`}
        description="The order and its payment history will remain recorded."
        actionLabel="Cancel order"
        onCancel={() => setCancelTarget(null)}
        onConfirm={(reason) => updateStatus(cancelTarget, 'Cancelled', reason)}
      /> : null}
    </div>
  );
}

function ExpensesPage() {
  type ExpenseRecord = { _id: string; description: string; amount: number; category: string; status?: string };
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [form, setForm] = useState({ description: '', category: 'Other', amount: '0' });
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [voidTarget, setVoidTarget] = useState<ExpenseRecord | null>(null);

  const loadExpenses = useCallback(async () => {
    const result = await api<{ items: ExpenseRecord[] }>('/expenses');
    setExpenses(result.items || []);
  }, []);

  useEffect(() => {
    void loadExpenses().catch((error) => setServerError((error as Error).message));
  }, [loadExpenses]);

  const handleAdd = async () => {
    setSaving(true);
    setServerError('');
    try {
      await api('/expenses', {
        method: 'POST',
        body: JSON.stringify({ description: form.description, category: form.category, amount: Number(form.amount) }),
      });
      setForm({ description: '', category: 'Other', amount: '0' });
      await loadExpenses();
    } catch (error) {
      setServerError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const voidExpense = async (expense: ExpenseRecord, reason: string) => {
    setSaving(true);
    setServerError('');
    try {
      await api(`/expenses/${expense._id}/void`, { method: 'POST', body: JSON.stringify({ reason }) });
      setVoidTarget(null);
      await loadExpenses();
    } catch (error) {
      setServerError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h1 className="text-2xl font-bold text-brand-navy">Expenses</h1>
        <div className="mt-4 space-y-3">
          {expenses.map((expense) => (
            <div key={expense._id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div>
                <div className="font-medium">{expense.description}</div>
                <div className="text-xs text-slate-500">{expense.category}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="font-semibold text-brand-navy">${expense.amount.toFixed(2)}</div>
                  <div className="text-xs text-slate-500">{expense.status || 'approved'}</div>
                </div>
                {expense.status !== 'void' ? <button type="button" disabled={saving} onClick={() => setVoidTarget(expense)} className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-700 disabled:opacity-50">Void</button> : null}
              </div>
            </div>
          ))}
          {expenses.length === 0 ? <p className="text-sm text-slate-500">No expenses found.</p> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-xl font-bold text-brand-navy">Add expense</h2>
        <div className="mt-4 space-y-3">
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="w-full rounded border border-slate-300 px-3 py-2" />
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" className="w-full rounded border border-slate-300 px-3 py-2" />
          <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" className="w-full rounded border border-slate-300 px-3 py-2" />
          <button disabled={saving || !form.description.trim() || !form.category.trim() || Number(form.amount) <= 0} onClick={() => void handleAdd()} className="w-full rounded-xl bg-brand-teal px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save expense'}</button>
          {serverError ? <p role="alert" className="text-sm text-red-700">{serverError}</p> : null}
        </div>
      </div>
      {voidTarget ? <ReasonDialog
        title={`Void "${voidTarget.description}"?`}
        description="The expense will be excluded from reports, but its original record and audit history will remain."
        actionLabel="Void expense"
        onCancel={() => setVoidTarget(null)}
        onConfirm={(reason) => voidExpense(voidTarget, reason)}
      /> : null}
    </div>
  );
}

function SettingsPage() {
  const [settings, setSettings] = useState<{ businessName?: string; currency?: string; currencySymbol?: string }>({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api<{ settings: { businessName?: string; currency?: string; currencySymbol?: string } }>('/settings')
      .then((result) => setSettings(result.settings || {}))
      .catch((error) => setServerError((error as Error).message));
  }, []);

  const update = async () => {
    setSaving(true);
    setServerError('');
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify(settings) });
      setServerError('Settings saved.');
    } catch (error) {
      setServerError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <h1 className="text-2xl font-bold text-brand-navy">Business Settings</h1>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <input value={settings.businessName || ''} onChange={(e) => setSettings({ ...settings, businessName: e.target.value })} placeholder="Business name" className="rounded border border-slate-300 px-3 py-2" />
        <input value={settings.currency || ''} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} placeholder="Currency" className="rounded border border-slate-300 px-3 py-2" />
      </div>
      {serverError ? <p role={serverError === 'Settings saved.' ? 'status' : 'alert'} className={`mt-3 text-sm ${serverError === 'Settings saved.' ? 'text-emerald-700' : 'text-red-700'}`}>{serverError}</p> : null}
      <button disabled={saving} onClick={() => void update()} className="mt-5 rounded-xl bg-brand-navy px-4 py-3 font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save settings'}</button>
    </div>
  );
}

function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><AppShell><DashboardPage /></AppShell></ProtectedRoute>} />
      <Route path="/pos" element={<ProtectedRoute><AppShell><POSPage /></AppShell></ProtectedRoute>} />
      <Route path="/products" element={<ProtectedRoute><AppShell><ProductsPage /></AppShell></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><AppShell><CustomersPage /></AppShell></ProtectedRoute>} />
      <Route path="/categories" element={<ProtectedRoute><AppShell><ManagementPage kind="categories" /></AppShell></ProtectedRoute>} />
      <Route path="/suppliers" element={<ProtectedRoute><AppShell><ManagementPage kind="suppliers" /></AppShell></ProtectedRoute>} />
      <Route path="/purchases" element={<ProtectedRoute><AppShell><PurchasesPage /></AppShell></ProtectedRoute>} />
      <Route path="/sales" element={<ProtectedRoute><AppShell><SalesPage /></AppShell></ProtectedRoute>} />
      <Route path="/payments" element={<ProtectedRoute><AppShell><PaymentsPage /></AppShell></ProtectedRoute>} />
      <Route path="/printing" element={<ProtectedRoute><AppShell><PrintingPage /></AppShell></ProtectedRoute>} />
      <Route path="/services" element={<ProtectedRoute><AppShell><ManagementPage kind="services" /></AppShell></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><AppShell><ManagementPage kind="users" /></AppShell></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute><AppShell><ExpensesPage /></AppShell></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><AppShell><SettingsPage /></AppShell></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRouter />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
