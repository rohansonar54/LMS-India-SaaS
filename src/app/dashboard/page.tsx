'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';
import ReceiptModal, { ReceiptOrder } from '@/components/ReceiptModal';
import Link from 'next/link';
import { formatINR } from '@/lib/currency';
import {
  Wallet,
  Clock,
  Users,
  AlertTriangle,
  ArrowRight,
  PlusCircle,
  Eye,
  CheckCircle2,
  TrendingUp,
  CreditCard,
  Building2,
  Package,
  Calendar,
  Filter,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

type DatePreset = 'today' | 'all' | 'custom';

interface DashboardStats {
  totalRevenue: number;
  todayRevenue: number;
  totalOutstanding: number;
  allTimeOutstanding?: number;
  totalOrders: number;
  allTimeOrders?: number;
  activeCount: number;
  allTimeActive?: number;
  completedCount: number;
  totalProcessing?: number;
  totalReady?: number;
  totalDelivered?: number;
  overdueCount?: number;
  totalCustomers: number;
  allTimeCustomers?: number;
  newCustomers: number;
  lowStockCount: number;
}

interface LocationMetric {
  id: string;
  name: string;
  code: string;
  ordersCount: number;
  revenue: number;
  outstanding: number;
}

export default function DashboardPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global Date Filter State (default: 'today')
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    todayRevenue: 0,
    totalOutstanding: 0,
    allTimeOutstanding: 0,
    totalOrders: 0,
    allTimeOrders: 0,
    activeCount: 0,
    allTimeActive: 0,
    completedCount: 0,
    totalCustomers: 0,
    allTimeCustomers: 0,
    newCustomers: 0,
    lowStockCount: 0,
  });

  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [paymentMethodsDist, setPaymentMethodsDist] = useState<Record<string, number>>({});
  const [locationComparison, setLocationComparison] = useState<LocationMetric[]>([]);
  const [recentOrders, setRecentOrders] = useState<ReceiptOrder[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptOrder | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate from URL query params on initial mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const presetParam = sp.get('preset') as DatePreset | null;
      const startParam = sp.get('startDate');
      const endParam = sp.get('endDate');

      if (presetParam === 'today' || presetParam === 'all' || presetParam === 'custom') {
        setDatePreset(presetParam);
      }
      if (startParam) setCustomStartDate(startParam.slice(0, 10));
      if (endParam) setCustomEndDate(endParam.slice(0, 10));
    }
  }, []);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('preset', datePreset);
      if (datePreset === 'custom') {
        if (customStartDate) params.set('startDate', customStartDate);
        if (customEndDate) params.set('endDate', customEndDate);
      }

      // Sync URL without full reload
      if (typeof window !== 'undefined') {
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, '', newUrl);
      }

      const res = await fetch(`/api/dashboard?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setStatusCounts(data.statusCounts || {});
        setPaymentMethodsDist(data.paymentMethodsDist || {});
        setLocationComparison(data.locationComparison || []);
        setRecentOrders(data.recentOrders || []);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }, [datePreset, customStartDate, customEndDate]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Helper to build drill-down URLs carrying the active date filter
  const getDrilldownUrl = (basePath: string, extraParams: Record<string, string> = {}) => {
    const sp = new URLSearchParams();
    if (datePreset === 'today') {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;
      sp.set('datePreset', 'today');
      sp.set('startDate', todayStr);
      sp.set('endDate', todayStr);
    } else if (datePreset === 'all') {
      sp.set('datePreset', 'all');
    } else if (datePreset === 'custom') {
      sp.set('datePreset', 'custom');
      if (customStartDate) sp.set('startDate', customStartDate);
      if (customEndDate) sp.set('endDate', customEndDate);
    }
    for (const [k, v] of Object.entries(extraParams)) {
      if (v) sp.set(k, v);
    }
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  // Formatted description of active period
  const getPeriodLabel = () => {
    if (datePreset === 'today') {
      return `Today (${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})`;
    }
    if (datePreset === 'all') {
      return 'All Time (Lifetime Business Analytics)';
    }
    if (customStartDate && customEndDate) {
      return `${customStartDate} to ${customEndDate}`;
    }
    if (customStartDate) return `Since ${customStartDate}`;
    return 'Custom Date Range';
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Executive Dashboard"
          subtitle="Real-Time Branch Operations & Interactive Financial Analytics (₹)"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="p-3 sm:p-5 md:p-8 space-y-5 flex-1 overflow-y-auto max-w-7xl w-full mx-auto">
          {/* Global Date Filter Bar (Controls Entire Dashboard & Preserved in Drill-Downs) */}
          <div className="bg-white p-3.5 sm:p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-2xl bg-blue-50 text-blue-600 shrink-0">
                <Calendar className="w-4 h-4" />
              </span>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Global Dashboard Date Filter
                  </span>
                  {loading && (
                    <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-blue-600 animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Updating analytics...</span>
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-800">
                  Showing records for: <span className="text-blue-600 font-extrabold">{getPeriodLabel()}</span>
                </p>
              </div>
            </div>

            {/* Filter Buttons & Custom Pickers */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center p-1 rounded-2xl bg-slate-100 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setDatePreset('today')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs ${
                    datePreset === 'today'
                      ? 'bg-blue-600 text-white shadow-blue-500/20'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('all')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs ${
                    datePreset === 'all'
                      ? 'bg-blue-600 text-white shadow-blue-500/20'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Time
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('custom')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs ${
                    datePreset === 'custom'
                      ? 'bg-blue-600 text-white shadow-blue-500/20'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Custom Range
                </button>
              </div>

              {/* Custom Range Date Pickers */}
              {datePreset === 'custom' && (
                <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 border border-slate-200 p-1 rounded-2xl animate-in fade-in">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-2 py-1 text-xs rounded-xl border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    title="From Date"
                  />
                  <span className="text-slate-400 text-xs font-bold">to</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-2 py-1 text-xs rounded-xl border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    title="To Date"
                  />
                  <button
                    type="button"
                    onClick={fetchDashboardData}
                    className="px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-2xs"
                  >
                    Apply
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={fetchDashboardData}
                disabled={loading}
                title="Refresh dashboard analytics"
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition shadow-2xs shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            </div>
          </div>

          {/* Quick POS Banner */}
          <div className="rounded-3xl bg-gradient-to-r from-blue-700 via-indigo-700 to-cyan-600 p-5 md:p-7 text-white shadow-xl shadow-blue-600/15 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <span className="px-3 py-1 rounded-full bg-white/20 text-white text-[11px] font-bold backdrop-blur-xs">
                Indian Rupee Multi-Location POS
              </span>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-black mt-2 tracking-tight">
                Item-Based Counter Billing & QR Tracker
              </h2>
              <p className="text-blue-100 text-xs md:text-sm mt-1 max-w-xl">
                Create clothing orders, record advance/partial payments, print dual receipts with QR tracking, and manage delivery handovers.
              </p>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <Link
                href="/transactions"
                className="px-5 py-2.5 rounded-2xl bg-white text-blue-700 font-bold text-xs sm:text-sm hover:bg-blue-50 shadow-md transition flex items-center space-x-1.5"
              >
                <PlusCircle className="w-4 h-4" />
                <span>New POS Order</span>
              </Link>
              <Link
                href={getDrilldownUrl('/payments', { tab: 'balances' })}
                className="px-5 py-2.5 rounded-2xl bg-blue-900/60 text-white font-bold text-xs sm:text-sm hover:bg-blue-900 border border-white/20 transition flex items-center space-x-1.5"
              >
                <Wallet className="w-4 h-4" />
                <span>Pending Balances</span>
              </Link>
            </div>
          </div>

          {/* Interactive KPI Analytics Cards (Click to Drill Down) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Card A: Revenue Collected (Click -> /payments?tab=history) */}
            <Link
              href={getDrilldownUrl('/payments', { tab: 'history' })}
              className="group bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs hover:border-emerald-300 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
              title="Click to view detailed revenue collection ledger & payment transactions"
            >
              <div>
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider group-hover:text-emerald-700 transition">
                    Revenue Collected
                  </span>
                  <span className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition">
                    <TrendingUp className="w-4 h-4" />
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 font-mono group-hover:text-emerald-600 transition">
                  {formatINR(stats.totalRevenue)}
                </h3>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-emerald-600">
                <span>Today: {formatINR(stats.todayRevenue)}</span>
                <span className="opacity-0 group-hover:opacity-100 transition flex items-center space-x-0.5 font-bold">
                  <span>Ledger</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </Link>

            {/* Card B: Pending Balances (Click -> /orders?paymentStatus=unpaid) */}
            <Link
              href={getDrilldownUrl('/orders', { paymentStatus: 'unpaid' })}
              className="group bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs hover:border-rose-300 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
              title="Click to view all orders with pending balances"
            >
              <div>
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider group-hover:text-rose-700 transition">
                    Pending Balances
                  </span>
                  <span className="p-1.5 rounded-xl bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition">
                    <Wallet className="w-4 h-4" />
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-rose-600 font-mono">
                  {formatINR(stats.totalOutstanding)}
                </h3>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  {datePreset === 'today'
                    ? `Total Dues: ${formatINR(stats.allTimeOutstanding || stats.totalOutstanding)}`
                    : 'To collect at handover'}
                </span>
                <span className="opacity-0 group-hover:opacity-100 text-rose-600 transition flex items-center space-x-0.5 font-bold">
                  <span>View Dues</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </Link>

            {/* Card C: Active in Station (Click -> /orders?status=active) */}
            <Link
              href={getDrilldownUrl('/orders', { status: 'active' })}
              className="group bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs hover:border-blue-300 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
              title="Click to view all active orders in Processing & Ready for Pickup"
            >
              <div>
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider group-hover:text-blue-700 transition">
                    Active in Station
                  </span>
                  <span className="p-1.5 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition">
                    <Clock className="w-4 h-4" />
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-blue-600 font-mono">
                  {stats.activeCount}
                </h3>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>{stats.allTimeActive || stats.activeCount} active in store</span>
                <span className="opacity-0 group-hover:opacity-100 text-blue-600 transition flex items-center space-x-0.5 font-bold">
                  <span>Active List</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </Link>

            {/* Card D: Customer Base (Click -> /customers) */}
            <Link
              href={getDrilldownUrl('/customers')}
              className="group bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs hover:border-cyan-300 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
              title="Click to view registered customer directory"
            >
              <div>
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider group-hover:text-cyan-700 transition">
                    Customer Base
                  </span>
                  <span className="p-1.5 rounded-xl bg-cyan-50 text-cyan-600 group-hover:bg-cyan-600 group-hover:text-white transition">
                    <Users className="w-4 h-4" />
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 font-mono group-hover:text-cyan-600 transition">
                  {stats.totalCustomers}
                </h3>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span className="text-cyan-700 font-medium">
                  {datePreset === 'all'
                    ? `${stats.allTimeCustomers || stats.totalCustomers} total registered`
                    : `+${stats.newCustomers} in period • Lifetime: ${stats.allTimeCustomers || stats.totalCustomers}`}
                </span>
                <span className="opacity-0 group-hover:opacity-100 text-cyan-600 transition flex items-center space-x-0.5 font-bold">
                  <span>Directory</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </Link>
          </div>

          {/* Interactive Active Queue & Pipeline Status (Click each stage to drill down to matching orders) */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Active Queue &amp; Order Pipeline</h3>
                <p className="text-xs text-slate-500">
                  Live orders for <span className="font-semibold text-slate-700">{getPeriodLabel()}</span> — click any stage to view matching orders
                </p>
              </div>
              <Link
                href="/queue"
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1 self-start sm:self-auto"
              >
                <span>Open 2-Stage Queue Board</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* In Processing */}
              <Link
                href={getDrilldownUrl('/orders', { status: 'processing' })}
                className="group p-4 rounded-2xl border flex items-center justify-between gap-3 shadow-2xs bg-blue-50/80 text-blue-900 border-blue-200 hover:border-blue-400 hover:shadow-md transition cursor-pointer"
                title="Click to view all Processing orders"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-2xl p-2 bg-white rounded-xl shadow-xs group-hover:scale-110 transition">🔄</span>
                  <div>
                    <div className="flex items-center space-x-1">
                      <p className="text-xs font-bold uppercase tracking-tight">In Processing</p>
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition text-blue-600" />
                    </div>
                    <p className="text-[11px] opacity-75">Cleaning, washing or pressing</p>
                  </div>
                </div>
                <span className="px-3.5 py-1 rounded-full text-base font-black font-mono shadow-xs bg-blue-600 text-white">
                  {statusCounts['processing'] || 0}
                </span>
              </Link>

              {/* Ready for Pickup */}
              <Link
                href={getDrilldownUrl('/orders', { status: 'ready' })}
                className="group p-4 rounded-2xl border flex items-center justify-between gap-3 shadow-2xs bg-emerald-50/80 text-emerald-900 border-emerald-200 hover:border-emerald-400 hover:shadow-md transition cursor-pointer"
                title="Click to view all Ready for Pickup orders"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-2xl p-2 bg-white rounded-xl shadow-xs group-hover:scale-110 transition">🛍️</span>
                  <div>
                    <div className="flex items-center space-x-1">
                      <p className="text-xs font-bold uppercase tracking-tight">Ready for Pickup</p>
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition text-emerald-600" />
                    </div>
                    <p className="text-[11px] opacity-75">Packed &amp; awaiting collection</p>
                  </div>
                </div>
                <span className="px-3.5 py-1 rounded-full text-base font-black font-mono shadow-xs bg-emerald-600 text-white">
                  {statusCounts['done'] || 0}
                </span>
              </Link>

              {/* Delivered (Completed) */}
              <Link
                href={getDrilldownUrl('/orders', { status: 'claimed' })}
                className="group p-4 rounded-2xl border flex items-center justify-between gap-3 shadow-2xs bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-400 hover:shadow-md transition cursor-pointer"
                title="Click to view Delivered orders archive"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-2xl p-2 bg-white rounded-xl shadow-xs group-hover:scale-110 transition">📦</span>
                  <div>
                    <div className="flex items-center space-x-1">
                      <p className="text-xs font-bold uppercase tracking-tight">Delivered</p>
                      <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition text-slate-600" />
                    </div>
                    <p className="text-[11px] opacity-75">Collected &amp; closed orders</p>
                  </div>
                </div>
                <span className="px-3.5 py-1 rounded-full text-base font-black font-mono shadow-xs bg-slate-800 text-white">
                  {statusCounts['claimed'] || 0}
                </span>
              </Link>
            </div>
          </div>

          {/* Location Comparison & Payment Modes Distribution (Both Interactive) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Location-wise Comparison (Click branch to view its orders) */}
            <div className="lg:col-span-7 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Branch Comparison</h3>
                  <p className="text-xs text-slate-500">Revenue &amp; orders across registered laundry hubs (Click branch to view its orders)</p>
                </div>
                <Building2 className="w-4 h-4 text-slate-400" />
              </div>

              <div className="space-y-3">
                {locationComparison.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No branch activity recorded in this period</p>
                ) : (
                  locationComparison.map((loc) => (
                    <Link
                      key={loc.id}
                      href={getDrilldownUrl('/orders', { locationId: loc.id })}
                      className="group p-3.5 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-blue-300 hover:shadow-xs transition flex items-center justify-between gap-3 cursor-pointer"
                      title={`Click to view all orders from ${loc.name}`}
                    >
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <p className="font-bold text-slate-800 text-xs group-hover:text-blue-600 transition">
                            {loc.name}
                          </p>
                          <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition text-blue-600" />
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono">
                          Code: {loc.code} • <span className="font-bold text-slate-600">{loc.ordersCount} orders</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-black text-slate-900 text-sm group-hover:text-blue-600 transition">
                          {formatINR(loc.revenue)}
                        </p>
                        {loc.outstanding > 0 ? (
                          <p className="text-[10px] font-bold text-rose-600 font-mono">
                            Dues: {formatINR(loc.outstanding)}
                          </p>
                        ) : (
                          <p className="text-[10px] font-medium text-emerald-600">No dues</p>
                        )}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Payment Method Distribution (Click mode to view transactions) */}
            <div className="lg:col-span-5 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Payment Methods</h3>
                  <p className="text-xs text-slate-500">Click method to view filtered transactions</p>
                </div>
                <CreditCard className="w-4 h-4 text-slate-400" />
              </div>

              <div className="space-y-3">
                {['Cash', 'UPI', 'Card', 'Net Banking'].map((mode) => {
                  const amt = paymentMethodsDist[mode] || 0;
                  const pct = stats.totalRevenue > 0 ? Math.round((amt / stats.totalRevenue) * 100) : 0;

                  return (
                    <Link
                      key={mode}
                      href={getDrilldownUrl('/payments', { tab: 'history', method: mode })}
                      className="group block p-2 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition cursor-pointer"
                      title={`Click to view ${mode} payment transactions`}
                    >
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-700 flex items-center space-x-1 group-hover:text-blue-600 transition">
                            <span>{mode}</span>
                            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {formatINR(amt)} <span className="text-slate-400 font-normal">({pct}%)</span>
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              mode === 'UPI'
                                ? 'bg-indigo-600'
                                : mode === 'Card'
                                ? 'bg-cyan-500'
                                : mode === 'Net Banking'
                                ? 'bg-purple-600'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Recent Orders List with Direct Drill-Down to Orders Directory */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Recent Transactions in Selected Period</h3>
                <p className="text-xs text-slate-500">Showing newest orders for {getPeriodLabel()}</p>
              </div>
              <Link
                href={getDrilldownUrl('/orders')}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1"
              >
                <span>View All In Directory</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px]">
                    <th className="py-2.5 px-3">Order #</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Paid</th>
                    <th className="py-2.5 px-3">Balance</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No orders recorded for this period
                      </td>
                    </tr>
                  ) : (
                    recentOrders.map((ro) => (
                      <tr key={ro.orderNumber} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3 font-mono font-bold text-blue-600">
                          <Link href={getDrilldownUrl('/orders', { search: ro.orderNumber })} className="hover:underline">
                            #{ro.orderNumber}
                          </Link>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{ro.customerName}</td>
                        <td className="py-2.5 px-3 font-mono font-bold">{formatINR(ro.total)}</td>
                        <td className="py-2.5 px-3 font-mono text-emerald-600">{formatINR(ro.amountPaid)}</td>
                        <td className="py-2.5 px-3 font-mono text-rose-600">
                          {formatINR(ro.balance !== undefined ? ro.balance : Math.max(0, ro.total - ro.amountPaid))}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                            {ro.status === 'done' || ro.status === 'ready'
                              ? 'Ready'
                              : ro.status === 'claimed'
                              ? 'Delivered'
                              : ro.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedReceipt(ro)}
                            className="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold inline-flex items-center space-x-1"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Dual Printable Receipt Modal */}
      <ReceiptModal order={selectedReceipt} onClose={() => setSelectedReceipt(null)} />
    </div>
  );
}
