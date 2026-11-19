'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';
import Pagination from '@/components/Pagination';
import ReceiptModal, { ReceiptOrder } from '@/components/ReceiptModal';
import BlurLoaderOverlay from '@/components/BlurLoaderOverlay';
import { formatINR } from '@/lib/currency';
import {
  ShoppingBag,
  Search,
  RefreshCw,
  Printer,
  ChevronDown,
  ChevronUp,
  X,
  Filter,
  Calendar,
  Building2,
  Clock,
  ArrowUpDown,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Check,
} from 'lucide-react';

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'month_to_date' | 'last_month' | 'year_to_date' | 'all';

interface DateRange {
  start: Date | null;
  end: Date | null;
}

function getDateRangeForPreset(preset: DatePreset): DateRange {
  const now = new Date();

  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start, end };
  }

  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
    const end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
    return { start, end };
  }

  if (preset === 'this_week') {
    // Current week starting Monday
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(now.setDate(diff));
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (preset === 'month_to_date') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start, end };
  }

  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start, end };
  }

  if (preset === 'year_to_date') {
    const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start, end };
  }

  return { start: null, end: null };
}

export default function OrdersPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [orders, setOrders] = useState<ReceiptOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Preset filter state (default to 'all')
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);

  // Quick Global Search (Searches across all dates: Mobile, Name, Date, Order #)
  const [quickSearch, setQuickSearch] = useState('');

  // Advanced Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<'createdAt' | 'total'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const PAGE_SIZE = 25;

  // Receipt Modal State
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<ReceiptOrder | null>(null);

  // Quick Collect Payment Modal State
  const [collectOrder, setCollectOrder] = useState<ReceiptOrder | null>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [payRef, setPayRef] = useState('');
  const [markDelivered, setMarkDelivered] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);

  const handleOpenCollect = (order: ReceiptOrder) => {
    const bal = order.balance !== undefined ? order.balance : Math.max(0, order.total - order.amountPaid);
    setCollectOrder(order);
    setPayAmount(bal > 0 ? bal.toString() : '');
    setPayMethod('Cash');
    setPayRef('');
    setMarkDelivered(order.status === 'ready' || order.status === 'done');
  };

  const handleDirectHandover = async (order: ReceiptOrder) => {
    if (!order._id) return;
    if (!confirm(`Confirm handover of clothes for Order #${order.orderNumber} to customer?`)) return;

    try {
      const res = await fetch(`/api/orders/${order._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'claimed',
          staffName: 'Staff',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOrders((prev) =>
          prev.map((o) => (o._id === order._id ? { ...o, status: 'claimed' } : o))
        );
      } else {
        alert(data.message || 'Failed to update order status');
      }
    } catch {
      alert('Network error while updating status');
    }
  };

  const handleCollectPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectOrder || !collectOrder._id) return;
    const amountNum = Number(payAmount);
    if (!amountNum || amountNum <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }

    setIsCollecting(true);
    try {
      // 1. Post payment
      const payRes = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: collectOrder._id,
          amount: amountNum,
          method: payMethod,
          referenceNumber: payRef,
          notes: markDelivered ? 'Payment collected at customer pickup/handover' : 'Payment collected in orders list',
        }),
      });

      const payData = await payRes.json();
      if (!payData.success) {
        alert(payData.message || 'Payment collection failed');
        setIsCollecting(false);
        return;
      }

      // 2. If marked delivered, update order status to claimed
      let updatedStatus = collectOrder.status;
      if (markDelivered) {
        const statusRes = await fetch(`/api/orders/${collectOrder._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'claimed',
            staffName: 'Staff',
          }),
        });
        const statusData = await statusRes.json();
        if (statusData.success) {
          updatedStatus = 'claimed';
        }
      }

      // 3. Update orders list locally
      setOrders((prev) =>
        prev.map((o) => {
          if (o._id === collectOrder._id) {
            const newPaid = o.amountPaid + amountNum;
            const newBalance = Math.max(0, o.total - newPaid);
            return {
              ...o,
              amountPaid: newPaid,
              balance: newBalance,
              paymentStatus: newBalance <= 0 ? 'paid' : 'partial',
              status: updatedStatus,
            };
          }
          return o;
        })
      );

      setCollectOrder(null);
    } catch {
      alert('Network error while processing payment');
    } finally {
      setIsCollecting(false);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('view', 'table');

      // If quick search has text, search across ALL dates globally
      const isGlobalQuickSearch = quickSearch.trim().length > 0;

      if (!isGlobalQuickSearch) {
        if (customStartDate || customEndDate) {
          if (customStartDate) params.set('startDate', new Date(customStartDate).toISOString());
          if (customEndDate) {
            const end = new Date(customEndDate);
            end.setHours(23, 59, 59, 999);
            params.set('endDate', end.toISOString());
          }
        } else if (datePreset !== 'all') {
          const range = getDateRangeForPreset(datePreset);
          if (range.start) params.set('startDate', range.start.toISOString());
          if (range.end) params.set('endDate', range.end.toISOString());
        }
      }

      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (paymentFilter !== 'all') params.set('paymentStatus', paymentFilter);

      const activeSearch = quickSearch.trim() || search.trim();
      if (activeSearch) params.set('search', activeSearch);

      const res = await fetch(`/api/orders?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders || []);
      } else {
        setOrders([]);
      }
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchOrders();
  }, [datePreset, statusFilter, paymentFilter, customStartDate, customEndDate, quickSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchOrders();
  };

  const handleSelectPreset = (preset: DatePreset) => {
    // Clear custom date inputs and quick search when clicking a preset
    setCustomStartDate('');
    setCustomEndDate('');
    setQuickSearch('');
    setDatePreset(preset);
  };

  const handleClearFilters = () => {
    setSearch('');
    setQuickSearch('');
    setStatusFilter('all');
    setPaymentFilter('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setDatePreset('all');
  };

  // Filter and sort orders client-side
  const filteredAndSortedOrders = useMemo(() => {
    let list = [...orders];

    const effectiveSearch = (quickSearch.trim() || search.trim()).toLowerCase();
    if (effectiveSearch) {
      const q = effectiveSearch;
      list = list.filter((o) => {
        const orderNum = (o.orderNumber || '').toLowerCase();
        const custName = (o.customerName || '').toLowerCase();
        const contact = (o.customerContact || '').toLowerCase();
        const locName = (o.locationName || '').toLowerCase();

        // Match formatted dates: e.g. "18 Nov", "18/11/2026", "2026-11-18", "November"
        const d = new Date(o.createdAt);
        let dateMatches = false;
        if (!isNaN(d.getTime())) {
          const formattedMedium = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toLowerCase();
          const formattedFull = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).toLowerCase();
          const iso = d.toISOString().slice(0, 10);
          const slash = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
          const dash = `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
          dateMatches =
            formattedMedium.includes(q) ||
            formattedFull.includes(q) ||
            iso.includes(q) ||
            slash.includes(q) ||
            dash.includes(q);
        }

        return (
          orderNum.includes(q) ||
          custName.includes(q) ||
          contact.includes(q) ||
          locName.includes(q) ||
          dateMatches
        );
      });
    }

    list.sort((a, b) => {
      if (sortField === 'total') {
        return sortOrder === 'desc' ? b.total - a.total : a.total - b.total;
      }
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return list;
  }, [orders, search, sortField, sortOrder]);

  // Financial Summaries for active view
  const summary = useMemo(() => {
    const totalOrders = filteredAndSortedOrders.length;
    const totalValue = filteredAndSortedOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalPaid = filteredAndSortedOrders.reduce((sum, o) => sum + (o.amountPaid || 0), 0);
    const totalBalance = filteredAndSortedOrders.reduce(
      (sum, o) => sum + (o.balance !== undefined ? o.balance : Math.max(0, o.total - o.amountPaid)),
      0
    );
    return { totalOrders, totalValue, totalPaid, totalBalance };
  }, [filteredAndSortedOrders]);

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredAndSortedOrders.slice(start, start + PAGE_SIZE);
  }, [filteredAndSortedOrders, currentPage]);

  const toggleSort = (field: 'createdAt' | 'total') => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const formatDateTime = (dateVal: string | Date) => {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return { datePart: '—', timePart: '' };
    const datePart = d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const timePart = d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return { datePart, timePart };
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'claimed' || s === 'delivered') {
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
    if (s === 'ready') {
      return 'bg-blue-100 text-blue-800 border-blue-200';
    }
    if (s.includes('washing') || s.includes('drying') || s.includes('iron') || s.includes('process')) {
      return 'bg-amber-100 text-amber-800 border-amber-200';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const hasActiveAdvancedFilters =
    search.trim() !== '' ||
    statusFilter !== 'all' ||
    paymentFilter !== 'all' ||
    customStartDate !== '' ||
    customEndDate !== '';

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Orders & Transactions"
          subtitle="Complete branch-wise order directory, billing trails & slips"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="p-3 sm:p-5 md:p-8 space-y-5 flex-1 max-w-7xl w-full mx-auto">
          {/* Top Bar with Date Presets + Quick Search + Advanced Search */}
          <div className="bg-white p-3.5 sm:p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            {/* Date Preset Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
              <button
                type="button"
                onClick={() => handleSelectPreset('today')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs ${datePreset === 'today' && !customStartDate && !quickSearch
                  ? 'bg-blue-600 text-white shadow-blue-500/20'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                  }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('yesterday')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs ${datePreset === 'yesterday' && !customStartDate && !quickSearch
                  ? 'bg-blue-600 text-white shadow-blue-500/20'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                  }`}
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('this_week')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs ${datePreset === 'this_week' && !customStartDate && !quickSearch
                  ? 'bg-blue-600 text-white shadow-blue-500/20'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                  }`}
              >
                This Week
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('month_to_date')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs ${datePreset === 'month_to_date' && !customStartDate && !quickSearch
                  ? 'bg-blue-600 text-white shadow-blue-500/20'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                  }`}
              >
                Month to Date
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('last_month')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs ${datePreset === 'last_month' && !customStartDate && !quickSearch
                  ? 'bg-blue-600 text-white shadow-blue-500/20'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                  }`}
              >
                Last Month
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('year_to_date')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs ${datePreset === 'year_to_date' && !customStartDate && !quickSearch
                  ? 'bg-blue-600 text-white shadow-blue-500/20'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                  }`}
              >
                Year to Date
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-2xs ${(datePreset === 'all' || !!quickSearch) && !customStartDate && !customEndDate
                  ? 'bg-slate-900 text-white'
                  : 'bg-white hover:bg-slate-50 text-slate-500 border border-slate-200'
                  }`}
              >
                All Time
              </button>
            </div>

            {/* Actions: Quick Search + Advanced Search + Refresh */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Quick Search Box (Searches across all orders & dates: Mobile, Name, Date, Order #) */}
              <div className="relative flex-1 sm:w-72 min-w-[240px]">
                <input
                  type="text"
                  placeholder="Quick search (Mobile, Name, Date, #)..."
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 hover:bg-white focus:bg-white transition"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                {quickSearch && (
                  <button
                    type="button"
                    onClick={() => setQuickSearch('')}
                    title="Clear quick search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 rounded-full"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Advanced Search Button */}
              <button
                type="button"
                onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
                className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition shadow-2xs shrink-0 ${showAdvancedSearch || hasActiveAdvancedFilters
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <span>Advanced Search</span>
                {showAdvancedSearch ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={fetchOrders}
                disabled={loading}
                title="Refresh order records"
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Active Quick Search Global Banner */}
          {quickSearch.trim() && (
            <div className="px-4 py-2.5 rounded-2xl bg-blue-50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-blue-900 animate-in fade-in">
              <div className="flex items-center space-x-2">
                <Search className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>
                  Quick Searching <strong>all orders across all dates</strong> for &ldquo;<strong className="font-bold text-blue-950">{quickSearch}</strong>&rdquo;
                  {filteredAndSortedOrders.length > 0 ? ` (${filteredAndSortedOrders.length} found)` : ' (No orders matched)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setQuickSearch('')}
                className="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline shrink-0 flex items-center space-x-1 self-end sm:self-auto"
              >
                <span>Clear search & return to {datePreset === 'all' ? 'All Orders' : datePreset.replace(/_/g, ' ')}</span>
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Advanced Search Collapsible Drawer */}
          {showAdvancedSearch && (
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-blue-600" />
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                    Advanced Search & Multi-Filters
                  </h4>
                </div>
                {hasActiveAdvancedFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center space-x-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reset All Filters</span>
                  </button>
                )}
              </div>

              <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {/* Search Text */}
                <div className="col-span-1 sm:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Search Order #, Customer, or Phone
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g. LMS-8194, Ramesh, 98765..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Order Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="washing_drying">Washing / Drying</option>
                    <option value="ironing">Ironing</option>
                    <option value="dryCleaning">Dry Clean</option>
                    <option value="ready">Ready for Pickup</option>
                    <option value="claimed">Delivered / Claimed</option>
                  </select>
                </div>

                {/* Payment Status Filter */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Payment Status</label>
                  <select
                    value={paymentFilter}
                    onChange={(e) => setPaymentFilter(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Payments</option>
                    <option value="paid">Fully Paid</option>
                    <option value="partial">Partially Paid</option>
                    <option value="unpaid">Unpaid / Due</option>
                  </select>
                </div>

                {/* Custom Start Date */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">From Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Custom End Date */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">To Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Submit button */}
                <div className="col-span-1 sm:col-span-2 flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-xs flex items-center justify-center space-x-1.5"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Apply Search Filters</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Orders</span>
              <p className="text-xl font-black text-slate-900 mt-0.5">{summary.totalOrders}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Value</span>
              <p className="text-xl font-black text-blue-600 font-mono mt-0.5">{formatINR(summary.totalValue)}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Collected</span>
              <p className="text-xl font-black text-emerald-600 font-mono mt-0.5">{formatINR(summary.totalPaid)}</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Outstanding Due</span>
              <p className="text-xl font-black text-rose-600 font-mono mt-0.5">{formatINR(summary.totalBalance)}</p>
            </div>
          </div>

          {/* Main Orders Table (Matching 'Recent Transactions in this Branch' style + Date Time Column) */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center space-x-2">
                  <ShoppingBag className="w-4 h-4 text-blue-600" />
                  <span>Orders Directory</span>
                  <span className="text-xs font-semibold text-slate-400">({filteredAndSortedOrders.length})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detailed ledger with date/time, customer dues, current status and reprintable slips
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-500 font-medium">
                  Showing <strong className="text-slate-800">{paginatedOrders.length}</strong> of{' '}
                  <strong className="text-slate-800">{filteredAndSortedOrders.length}</strong> orders
                </span>
              </div>
            </div>

            <BlurLoaderOverlay
              loading={loading}
              text="Loading Orders..."
            >
              <div className="overflow-x-auto min-h-[220px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
                      <th className="py-3 px-3.5 cursor-pointer select-none" onClick={() => toggleSort('createdAt')}>
                        <div className="flex items-center space-x-1">
                          <span>Date & Time</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="py-3 px-3">Order #</th>
                      <th className="py-3 px-3">Customer</th>
                      <th className="py-3 px-3">Branch / Location</th>
                      <th className="py-3 px-3 cursor-pointer select-none" onClick={() => toggleSort('total')}>
                        <div className="flex items-center space-x-1">
                          <span>Total</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="py-3 px-3">Paid</th>
                      <th className="py-3 px-3">Balance</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Payment / Handover</th>
                      <th className="py-3 px-3.5 text-right">Slip / Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedOrders.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-16 text-center">
                          <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-sm font-bold text-slate-700">
                            {loading ? 'Preparing orders...' : 'No orders found'}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {loading ? 'Please wait a moment' : 'Try adjusting your date range or clear the search filter above'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      paginatedOrders.map((ro) => {
                        const dt = formatDateTime(ro.createdAt);
                        const balance =
                          ro.balance !== undefined ? ro.balance : Math.max(0, ro.total - ro.amountPaid);

                        return (
                          <tr key={ro.orderNumber} className="hover:bg-slate-50 transition">
                            {/* Date & Time Column (User Requested) */}
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              <div className="font-semibold text-slate-900 text-xs">{dt.datePart}</div>
                              <div className="text-[10px] text-slate-400 font-medium">{dt.timePart}</div>
                            </td>

                            {/* Order Number */}
                            <td className="py-3 px-3 font-mono font-bold text-blue-600 whitespace-nowrap">
                              #{ro.orderNumber.replace(/^#/, '')}
                            </td>

                            {/* Customer */}
                            <td className="py-3 px-3">
                              <div className="font-semibold text-slate-800">{ro.customerName}</div>
                              {ro.customerContact && (
                                <div className="text-[10px] font-mono text-slate-400">{ro.customerContact}</div>
                              )}
                            </td>

                            {/* Branch / Location */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-medium">
                                <Building2 className="w-3 h-3 text-slate-400" />
                                <span>{ro.locationName || 'Main Branch'}</span>
                              </span>
                            </td>

                            {/* Total */}
                            <td className="py-3 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                              {formatINR(ro.total)}
                            </td>

                            {/* Paid */}
                            <td className="py-3 px-3 font-mono font-semibold text-emerald-600 whitespace-nowrap">
                              {formatINR(ro.amountPaid)}
                            </td>

                            {/* Balance */}
                            <td className="py-3 px-3 font-mono font-bold whitespace-nowrap">
                              {balance > 0 ? (
                                <span className="text-rose-600">{formatINR(balance)}</span>
                              ) : (
                                <span className="text-emerald-700 text-[11px] font-semibold">₹0 (Paid)</span>
                              )}
                            </td>

                            {/* Order Status Column */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getStatusBadge(
                                  ro.status
                                )}`}
                              >
                                {ro.status === 'ready' || ro.status === 'done'
                                  ? 'Ready for Pickup'
                                  : ro.status.replace(/_/g, ' ')}
                              </span>
                            </td>

                            {/* Dedicated Payment / Handover Action Column */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              {/* Case 1: Order Completed & Ready for Pickup */}
                              {ro.status === 'ready' || ro.status === 'done' ? (
                                balance > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCollect(ro)}
                                    className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-2xs active:scale-95"
                                    title="Order completed & ready for pickup - Collect remaining balance and handover"
                                  >
                                    <CreditCard className="w-3.5 h-3.5" />
                                    <span>Collect ₹{balance} & Handover</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleDirectHandover(ro)}
                                    className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 transition shadow-2xs active:scale-95"
                                    title="Order is fully paid - Click to mark clothes as handed over to customer"
                                  >
                                    <Check className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Handover Clothes</span>
                                  </button>
                                )
                              ) : balance > 0 ? (
                                /* Case 2: Order in other stages (Washing, Drying, Ironing) with pending dues */
                                <button
                                  type="button"
                                  onClick={() => handleOpenCollect(ro)}
                                  className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 transition shadow-2xs active:scale-95"
                                  title="Collect pending payment"
                                >
                                  <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Collect ₹{balance}</span>
                                </button>
                              ) : ro.status === 'claimed' ? (
                                /* Case 3: Order already collected & delivered to customer */
                                <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                  <span>Delivered & Paid</span>
                                </span>
                              ) : (
                                /* Case 4: Order in progress, already fully paid */
                                <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                  <span>Fully Paid</span>
                                </span>
                              )}
                            </td>

                            {/* Slip Button */}
                            <td className="py-3 px-3.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setSelectedReceiptOrder(ro)}
                                className="px-3 py-1 rounded-xl border border-slate-300 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 text-slate-700 text-xs font-semibold inline-flex items-center space-x-1.5 transition shadow-2xs active:scale-95"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Slip</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </BlurLoaderOverlay>

            {/* Pagination */}
            {!loading && filteredAndSortedOrders.length > PAGE_SIZE && (
              <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                <Pagination
                  currentPage={currentPage}
                  totalItems={filteredAndSortedOrders.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={(page) => setCurrentPage(page)}
                />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Dual Printable Receipt Modal */}
      <ReceiptModal order={selectedReceiptOrder} onClose={() => setSelectedReceiptOrder(null)} />

      {/* Collect Payment & Handover Modal */}
      {collectOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center space-x-2">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                  <span>Collect Payment</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Order <span className="font-mono font-bold text-blue-600">#{collectOrder.orderNumber}</span> • {collectOrder.customerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCollectOrder(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Bill Summary Card */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total</span>
                <span className="font-mono font-bold text-slate-800">{formatINR(collectOrder.total)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Paid So Far</span>
                <span className="font-mono font-bold text-emerald-600">{formatINR(collectOrder.amountPaid)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Balance Due</span>
                <span className="font-mono font-bold text-rose-600">
                  {formatINR(
                    collectOrder.balance !== undefined
                      ? collectOrder.balance
                      : Math.max(0, collectOrder.total - collectOrder.amountPaid)
                  )}
                </span>
              </div>
            </div>

            <form onSubmit={handleCollectPaymentSubmit} className="space-y-3.5">
              {/* Payment Mode Selector */}
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1.5">Payment Method *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Cash', 'UPI', 'Card'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPayMethod(m)}
                      className={`py-2 text-xs font-bold rounded-xl border transition flex items-center justify-center space-x-1 ${payMethod === m
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                    >
                      <span>{m === 'Cash' ? '💵 Cash' : m === 'UPI' ? '📱 UPI' : '💳 Card'}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount to Collect */}
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Amount to Collect (₹) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-bold text-slate-800 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Reference # if UPI or Card */}
              {payMethod !== 'Cash' && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    {payMethod} Reference / Transaction ID
                  </label>
                  <input
                    type="text"
                    placeholder={`e.g. UTR / Txn reference for ${payMethod}`}
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              )}

              {/* Handover Checkbox if Ready / Done */}
              {(collectOrder.status === 'ready' || collectOrder.status === 'done') && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
                  <label className="flex items-start space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={markDelivered}
                      onChange={(e) => setMarkDelivered(e.target.checked)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <div className="text-xs">
                      <p className="font-bold text-amber-950">Handover clothes to customer now</p>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Marks order as &quot;Delivered / Claimed&quot; in the system workflow.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCollectOrder(null)}
                  disabled={isCollecting}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCollecting}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-xs flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isCollecting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Recording...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>
                        {markDelivered ? `Collect ₹${payAmount || 0} & Handover` : `Collect ₹${payAmount || 0}`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
