'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';
import ReceiptModal, { ReceiptOrder } from '@/components/ReceiptModal';
import { formatINR } from '@/lib/currency';
import { isProcessingStage } from '@/lib/workflow';
import {
  Clock,
  ChevronRight,
  Eye,
  CheckCircle2,
  RefreshCw,
  Search,
  AlertTriangle,
  CreditCard,
  Building2,
  Calendar,
  Phone,
  ShieldCheck,
  Loader2,
  Trash2,
  PackageCheck,
  Sparkles,
  X,
} from 'lucide-react';

interface QueueOrderItem {
  itemName?: string;
  serviceName?: string;
  qty?: number;
  unitPrice?: number;
  subtotal: number;
  // Legacy
  typeName?: string;
  kilo?: number;
  unit?: string;
}

interface QueueOrder {
  _id: string;
  orderNumber: string;
  customerName: string;
  customerContact?: string;
  customerAddress?: string;
  locationName?: string;
  staffName?: string;
  orderItems?: QueueOrderItem[];
  items?: QueueOrderItem[]; // legacy
  total: number;
  amountPaid: number;
  balance: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  paymentMethod?: string;
  status: string;
  expectedDeliveryDate?: string;
  createdAt: string;
}

export default function QueuePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptOrder | null>(null);

  // Search & Filters with Debouncing
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'delivery'>('newest');
  const [activeTab, setActiveTab] = useState<'all' | 'processing' | 'done'>('all');

  // Track in-flight stage progression per order for instant feedback
  const [updatingOrderIds, setUpdatingOrderIds] = useState<Record<string, boolean>>({});

  // Payment Collection Handover Popup State
  const [pendingHandoverOrder, setPendingHandoverOrder] = useState<QueueOrder | null>(null);
  const [collectAmount, setCollectAmount] = useState<string>('');
  const [collectMethod, setCollectMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [collectRef, setCollectRef] = useState('');
  const [adminOverride, setAdminOverride] = useState(false);
  const [handoverSubmitting, setHandoverSubmitting] = useState(false);

  // Delete / Cancel Mistaken Order in Processing
  const [orderToDelete, setOrderToDelete] = useState<QueueOrder | null>(null);
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);

  // Top Success Collection Pop-up Toast
  const [collectionSuccess, setCollectionSuccess] = useState<{
    orderNumber: string;
    customerName: string;
    amountCollected?: number;
    message?: string;
  } | null>(null);

  useEffect(() => {
    if (collectionSuccess) {
      const timer = setTimeout(() => {
        setCollectionSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [collectionSuccess]);

  // Debounce search by 250ms
  useEffect(() => {
    if (search !== debouncedSearch) {
      setIsSearching(true);
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setIsSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchOrders = (searchTerm = debouncedSearch, showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true);
    fetch(`/api/orders?view=queue&search=${encodeURIComponent(searchTerm)}&paymentStatus=${paymentStatusFilter}&sort=${sortBy}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setOrders(data.orders || []);
        }
      })
      .catch((err) => console.error('Fetch orders error:', err))
      .finally(() => {
        setLoading(false);
        setIsSearching(false);
      });
  };

  useEffect(() => {
    fetchOrders(debouncedSearch);
  }, [debouncedSearch, paymentStatusFilter, sortBy]);

  // Advance Order from Processing -> Ready for Pickup ('done')
  const handleMarkReady = async (order: QueueOrder) => {
    const previousStatus = order.status;
    setUpdatingOrderIds((prev) => ({ ...prev, [order._id]: true }));

    // Optimistic Update: move card to 'done' (Ready for Pickup) instantly
    setOrders((prev) =>
      prev.map((o) => (o._id === order._id ? { ...o, status: 'done' } : o))
    );

    try {
      const res = await fetch(`/api/orders/${order._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done', staffName: 'Staff' }),
      });
      const data = await res.json();
      if (!data.success) {
        setOrders((prev) =>
          prev.map((o) => (o._id === order._id ? { ...o, status: previousStatus } : o))
        );
        alert(data.message || 'Failed to update order to Ready for Pickup');
      } else if (data.order) {
        setOrders((prev) =>
          prev.map((o) => (o._id === order._id ? { ...o, ...data.order } : o))
        );
      }
    } catch {
      setOrders((prev) =>
        prev.map((o) => (o._id === order._id ? { ...o, status: previousStatus } : o))
      );
      alert('Network error: Change was reverted.');
    } finally {
      setUpdatingOrderIds((prev) => {
        const nextState = { ...prev };
        delete nextState[order._id];
        return nextState;
      });
    }
  };

  // Open Handover / Delivery Action
  const handleInitiateDelivery = (order: QueueOrder) => {
    if (order.balance > 0) {
      // Unpaid balance: require payment collection or admin override
      setPendingHandoverOrder(order);
      setCollectAmount(order.balance.toString());
      setCollectMethod('Cash');
      setCollectRef('');
      setAdminOverride(false);
    } else {
      // Fully paid: confirm and deliver directly
      if (confirm(`Confirm customer pickup & delivery for Order #${order.orderNumber}?`)) {
        handleDirectDelivery(order);
      }
    }
  };

  // Direct delivery for fully-paid order (instant removal from queue board)
  const handleDirectDelivery = async (order: QueueOrder) => {
    // Optimistically remove from active board
    setOrders((prev) => prev.filter((o) => o._id !== order._id));

    try {
      const res = await fetch(`/api/orders/${order._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'claimed', staffName: 'Staff' }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.message || 'Failed to record delivery');
        fetchOrders();
      } else {
        setCollectionSuccess({
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          message: `Order #${order.orderNumber} successfully handed over to ${order.customerName}`,
        });
      }
    } catch {
      alert('Network error during delivery');
      fetchOrders();
    }
  };

  // Submit payment & complete handover with payment collection modal
  const handleCompleteHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingHandoverOrder) return;

    const currentOrder = pendingHandoverOrder;
    setHandoverSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        status: 'claimed',
        staffName: 'Staff Attendant',
      };

      const paidAmount = Number(collectAmount) || 0;
      if (adminOverride) {
        payload.adminOverride = true;
      } else {
        payload.paymentAmount = paidAmount;
        payload.paymentMethod = collectMethod;
        payload.referenceNumber = collectRef;
      }

      const res = await fetch(`/api/orders/${currentOrder._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        // Remove from active queue board as it is now Delivered
        setOrders((prev) => prev.filter((o) => o._id !== currentOrder._id));
        setPendingHandoverOrder(null);
        setCollectionSuccess({
          orderNumber: currentOrder.orderNumber,
          customerName: currentOrder.customerName,
          amountCollected: paidAmount,
          message: paidAmount > 0
            ? `Successfully collected ₹${paidAmount.toLocaleString('en-IN')} via ${collectMethod} & handed over Order #${currentOrder.orderNumber}`
            : `Successfully collected & handed over Order #${currentOrder.orderNumber} to ${currentOrder.customerName}`,
        });
      } else {
        alert(data.message || 'Payment collection failed');
      }
    } catch {
      alert('Network error during handover');
    } finally {
      setHandoverSubmitting(false);
    }
  };

  // Delete mistaken order (Processing section only)
  const handleDeleteOrder = async () => {
    if (!orderToDelete) return;
    setIsDeletingOrder(true);
    const targetId = orderToDelete._id;

    // Instant optimistic removal from UI
    setOrders((prev) => prev.filter((o) => o._id !== targetId));

    try {
      const res = await fetch(`/api/orders/${targetId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.message || 'Failed to delete order');
        fetchOrders();
      }
    } catch {
      alert('Network error while deleting order');
      fetchOrders();
    } finally {
      setIsDeletingOrder(false);
      setOrderToDelete(null);
    }
  };

  // 2 Canonical Columns on the Queue Board
  const boardColumns: { key: 'processing' | 'done'; title: string; subtitle: string; icon: string }[] = [
    { key: 'processing', title: 'Processing', subtitle: 'Orders currently being cleaned, washed or pressed', icon: '🔄' },
    { key: 'done', title: 'Ready for Pickup', subtitle: 'Packed & awaiting customer collection / handover', icon: '🛍️' },
  ];

  const isOrderInCol = (o: QueueOrder, colKey: 'processing' | 'done') => {
    if (colKey === 'processing') return isProcessingStage(o.status);
    if (colKey === 'done') return o.status === 'done';
    return false;
  };

  const processingCount = orders.filter((o) => isOrderInCol(o, 'processing')).length;
  const readyCount = orders.filter((o) => isOrderInCol(o, 'done')).length;

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Queue Board"
          subtitle="Simplified 2-Stage Daily Laundry Workflow"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="p-3 sm:p-5 md:p-8 space-y-4 sm:space-y-6 flex-1 max-w-7xl w-full mx-auto overflow-hidden md:overflow-visible">
          {/* Search & Comprehensive Filters Bar */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search Bar: Order #, Customer Name, Mobile # */}
              <div className="relative flex-1">
                {isSearching ? (
                  <Loader2 className="w-4 h-4 text-blue-600 absolute left-3.5 top-1/2 -translate-y-1/2 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                )}
                <input
                  type="text"
                  placeholder="Search by Order #, Customer Name, Mobile #..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm rounded-2xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 transition"
                />
              </div>

              {/* Filters & Actions */}
              <div className="flex items-center space-x-2 shrink-0">
                {/* Payment Status Filter */}
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Payments</option>
                  <option value="paid">Fully Paid (₹)</option>
                  <option value="partial">Partial Balance</option>
                  <option value="unpaid">Unpaid Orders</option>
                </select>

                {/* Sort Option */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'delivery')}
                  className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="delivery">Delivery Date</option>
                </select>

                <button
                  onClick={() => fetchOrders(debouncedSearch, true)}
                  title="Refresh Board"
                  className="p-2.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 transition"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
                </button>
              </div>
            </div>

            {/* Mobile Tab View Switcher */}
            <div className="md:hidden flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition ${
                  activeTab === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All (Swipe) ({orders.length})
              </button>
              <button
                onClick={() => setActiveTab('processing')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition flex items-center space-x-1.5 ${
                  activeTab === 'processing'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>🔄 Processing</span>
                <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">
                  {processingCount}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('done')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition flex items-center space-x-1.5 ${
                  activeTab === 'done'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>🛍️ Ready for Pickup</span>
                <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">
                  {readyCount}
                </span>
              </button>
            </div>
          </div>

          {/* Background data sync pulse indicator */}
          {loading && orders.length > 0 && (
            <div className="w-full bg-blue-100/70 h-1 overflow-hidden rounded-full animate-in fade-in">
              <div className="bg-blue-600 h-full w-2/5 rounded-full animate-pulse"></div>
            </div>
          )}

          {/* Mobile Horizontal Swipe Instruction Hint */}
          {activeTab === 'all' && (
            <div className="md:hidden flex items-center justify-between text-[11px] font-semibold text-slate-500 px-1">
              <span className="flex items-center space-x-1">
                <span>👉 Swipe horizontally between <strong>Processing</strong> &amp; <strong>Ready for Pickup</strong></span>
              </span>
            </div>
          )}

          {/* Simplified 2-Column Board (2-Column Grid on Desktop, Horizontal Swipe Kanban on Mobile) */}
          <div className="flex md:grid md:grid-cols-2 gap-4 sm:gap-5 items-start overflow-x-auto pb-4 md:pb-0 snap-x snap-mandatory scrollbar-thin -mx-3 px-3 sm:mx-0 sm:px-0">
            {boardColumns
              .filter((col) => activeTab === 'all' || activeTab === col.key)
              .map((col) => {
                const colOrders = orders.filter((o) => isOrderInCol(o, col.key));
                const isProcessingCol = col.key === 'processing';

                return (
                  <div
                    key={col.key}
                    className={`${
                      activeTab === 'all'
                        ? 'w-[88vw] sm:w-[420px] md:w-auto shrink-0 snap-start'
                        : 'w-full md:w-auto shrink-0'
                    } rounded-3xl p-4 sm:p-5 border flex flex-col min-h-[500px] transition-all ${
                      isProcessingCol
                        ? 'bg-slate-200/60 border-slate-300/80'
                        : 'bg-emerald-50/50 border-emerald-200/80'
                    }`}
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between pb-3.5 px-1 border-b border-slate-300/60 mb-4">
                      <div className="flex items-center space-x-2.5">
                        <span className="text-xl p-1.5 bg-white rounded-xl shadow-xs">{col.icon}</span>
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm sm:text-base tracking-tight">{col.title}</h3>
                          <p className="text-[11px] text-slate-500 font-medium">{col.subtitle}</p>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-black text-white shadow-xs ${
                          isProcessingCol ? 'bg-blue-600' : 'bg-emerald-600'
                        }`}
                      >
                        {colOrders.length}
                      </span>
                    </div>

                    {/* Order Cards List */}
                    <div className="space-y-3.5 flex-1 overflow-y-auto">
                      {loading && orders.length === 0 ? (
                        <div className="space-y-3 py-2">
                          {[1, 2, 3].map((n) => (
                            <div key={n} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs animate-pulse space-y-3">
                              <div className="flex justify-between items-center">
                                <div className="h-4 bg-slate-200 rounded w-20"></div>
                                <div className="h-4 bg-slate-200 rounded-md w-16"></div>
                              </div>
                              <div className="h-3.5 bg-slate-200 rounded w-32"></div>
                              <div className="h-10 bg-slate-100 rounded-xl"></div>
                              <div className="h-8 bg-slate-200 rounded-xl"></div>
                            </div>
                          ))}
                        </div>
                      ) : colOrders.length === 0 ? (
                        <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2">
                          <span className="text-2xl">{isProcessingCol ? '🧺' : '✨'}</span>
                          <p className="font-semibold text-slate-600">
                            {isProcessingCol ? 'No orders currently in processing' : 'No orders waiting for pickup'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {isProcessingCol ? 'New counter orders will automatically appear here' : 'Mark processed orders ready to move them here'}
                          </p>
                        </div>
                      ) : (
                        colOrders.map((order) => {
                          const isFullyPaid = order.balance <= 0;
                          const isUpdating = !!updatingOrderIds[order._id];
                          const displayItems =
                            order.orderItems && order.orderItems.length > 0
                              ? order.orderItems
                              : order.items || [];

                          // Extract unique service names from items
                          const serviceNames = Array.from(
                            new Set(
                              displayItems
                                .map((i) => i.serviceName || i.typeName)
                                .filter(Boolean)
                            )
                          );

                          return (
                            <div
                              key={order._id}
                              className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm hover:shadow-md transition space-y-3"
                            >
                              {/* Header: Order # + Payment Status Badge */}
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-mono font-bold text-blue-600 text-xs flex items-center space-x-1.5">
                                  <span>#{order.orderNumber}</span>
                                  {isUpdating && <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />}
                                </span>
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
                                    isFullyPaid
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : order.amountPaid > 0
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                      : 'bg-rose-100 text-rose-800 border border-rose-200'
                                  }`}
                                >
                                  {isFullyPaid ? 'Fully Paid ✓' : `Due: ${formatINR(order.balance)}`}
                                </span>
                              </div>

                              {/* Customer Information & Delete Option (Processing only) */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                                    {order.customerName}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
                                    <span className="flex items-center space-x-1">
                                      <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span>{order.customerContact || 'N/A'}</span>
                                    </span>
                                    {order.locationName && (
                                      <span className="flex items-center space-x-1 text-slate-400">
                                        <Building2 className="w-3 h-3 shrink-0" />
                                        <span className="truncate">{order.locationName}</span>
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Delete Mistaken Order Button (Available in Processing as requested) */}
                                {isProcessingCol && (
                                  <button
                                    type="button"
                                    onClick={() => setOrderToDelete(order)}
                                    title="Cancel Mistaken Order"
                                    className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition active:scale-95 shrink-0"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>

                              {/* Item Summary + Services Tag (Simple informative view, no checkboxes) */}
                              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-700 space-y-1.5">
                                <div className="flex justify-between items-start gap-2">
                                  <p className="font-medium text-slate-800 truncate">
                                    <span className="font-bold">{displayItems.length} Item(s): </span>
                                    <span>
                                      {displayItems.map((i) => i.itemName || i.typeName).slice(0, 3).join(', ')}
                                      {displayItems.length > 3 ? '...' : ''}
                                    </span>
                                  </p>
                                  <span className="font-mono font-black text-slate-900 shrink-0">
                                    {formatINR(order.total)}
                                  </span>
                                </div>

                                {/* Clean Services List Tag */}
                                {serviceNames.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-200/60">
                                    <span className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">
                                      Services:
                                    </span>
                                    {serviceNames.map((svc) => (
                                      <span
                                        key={svc}
                                        className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-semibold text-[10px] border border-blue-200/60"
                                      >
                                        {svc}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Expected Delivery Date */}
                              {order.expectedDeliveryDate && (
                                <p className="text-[11px] text-slate-500 font-medium flex items-center space-x-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  <span>
                                    Delivery Due:{' '}
                                    <strong className="text-slate-700">
                                      {new Date(order.expectedDeliveryDate).toLocaleDateString('en-IN', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                      })}
                                    </strong>
                                  </span>
                                </p>
                              )}

                              {/* Action Buttons: View Slip + Move to Ready / Deliver */}
                              <div className="pt-1 flex items-center space-x-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedReceipt(order as unknown as ReceiptOrder)}
                                  title="View / Print Dual Slip"
                                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shrink-0 flex items-center space-x-1 text-xs font-semibold"
                                >
                                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                                  <span>Slip</span>
                                </button>

                                {isProcessingCol ? (
                                  /* Move from Processing to Ready for Pickup */
                                  <button
                                    type="button"
                                    onClick={() => handleMarkReady(order)}
                                    disabled={isUpdating}
                                    className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition active:scale-95 flex items-center justify-center space-x-1.5 ${
                                      isUpdating ? 'opacity-80 cursor-wait' : ''
                                    }`}
                                  >
                                    {isUpdating ? (
                                      <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>Saving...</span>
                                      </>
                                    ) : (
                                      <>
                                        <span>Ready for Pickup</span>
                                        <ChevronRight className="w-4 h-4" />
                                      </>
                                    )}
                                  </button>
                                ) : (
                                  /* Ready for Pickup -> Complete Delivery / Handover */
                                  <button
                                    type="button"
                                    onClick={() => handleInitiateDelivery(order)}
                                    className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs text-white shadow-xs transition active:scale-95 flex items-center justify-center space-x-1.5 ${
                                      order.balance > 0
                                        ? 'bg-amber-600 hover:bg-amber-700'
                                        : 'bg-emerald-600 hover:bg-emerald-700'
                                    }`}
                                  >
                                    <PackageCheck className="w-4 h-4" />
                                    <span>
                                      {order.balance > 0
                                        ? `Collect ₹${order.balance} & Deliver`
                                        : 'Mark as Delivered'}
                                    </span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </main>
      </div>

      {/* Top Floating Notification Pop-up upon Successful Collection / Handover */}
      {collectionSuccess && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4 transition-all duration-300 animate-in fade-in slide-in-from-top-6">
          <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between border border-emerald-400/40 gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <span className="p-2 rounded-xl bg-white/20 text-white shrink-0 shadow-xs">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5 flex-wrap">
                  <h4 className="font-black text-sm text-white tracking-tight">
                    Successfully Collected &amp; Delivered
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-800/80 text-emerald-100 uppercase">
                    #{collectionSuccess.orderNumber}
                  </span>
                </div>
                <p className="text-xs text-emerald-100 font-medium truncate mt-0.5">
                  {collectionSuccess.message || `Order successfully handed over to ${collectionSuccess.customerName}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCollectionSuccess(null)}
              className="p-1.5 rounded-xl hover:bg-emerald-700 text-emerald-100 hover:text-white transition shrink-0"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Payment Collection & Handover Delivery Modal */}
      {pendingHandoverOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Collect Payment &amp; Deliver</h3>
                <p className="text-xs text-slate-500">Order #{pendingHandoverOrder.orderNumber} • {pendingHandoverOrder.customerName}</p>
              </div>
              <span className="p-2 rounded-2xl bg-amber-50 text-amber-700">
                <CreditCard className="w-5 h-5" />
              </span>
            </div>

            {/* Outstanding Balance Banner */}
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <span className="text-amber-800 font-semibold block">Outstanding Amount</span>
                <span className="text-[11px] text-amber-700">Total: {formatINR(pendingHandoverOrder.total)} • Paid: {formatINR(pendingHandoverOrder.amountPaid)}</span>
              </div>
              <span className="font-mono font-black text-rose-600 text-lg">
                {formatINR(pendingHandoverOrder.balance)}
              </span>
            </div>

            <form onSubmit={handleCompleteHandover} className="space-y-4">
              {!adminOverride ? (
                <>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Amount Collected Now (₹) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        max={pendingHandoverOrder.balance}
                        required
                        value={collectAmount}
                        onChange={(e) => setCollectAmount(e.target.value)}
                        className="w-full pl-8 pr-3 py-2.5 text-base font-black font-mono text-slate-900 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Payment Method</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Cash', 'UPI', 'Card'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setCollectMethod(m)}
                          className={`py-2 text-xs font-bold rounded-xl border transition ${
                            collectMethod === m
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {m === 'Cash' ? '💵 Cash' : m === 'UPI' ? '📱 UPI' : '💳 Card'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {collectMethod !== 'Cash' && (
                    <input
                      type="text"
                      placeholder={`Enter ${collectMethod} Transaction / Ref #`}
                      value={collectRef}
                      onChange={(e) => setCollectRef(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </>
              ) : (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
                  <p className="font-bold flex items-center space-x-1.5">
                    <ShieldCheck className="w-4 h-4 text-rose-600" />
                    <span>Admin Handover Override Active</span>
                  </p>
                  <p className="text-[11px] text-rose-700">
                    Clothes will be marked as Delivered without collecting full payment now. Balance will remain in the customer&apos;s ledger.
                  </p>
                </div>
              )}

              {/* Admin Override Toggle */}
              <div className="pt-1 flex items-center justify-between text-xs text-slate-500">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adminOverride}
                    onChange={(e) => setAdminOverride(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Authorize Admin Handover Override</span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingHandoverOrder(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={handoverSubmitting}
                  className={`flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition flex items-center justify-center space-x-1.5 ${
                    handoverSubmitting ? 'opacity-80 cursor-wait' : 'active:scale-95'
                  }`}
                >
                  {handoverSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : adminOverride ? (
                    'Confirm Handover'
                  ) : (
                    `Collect ₹${collectAmount} & Deliver`
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Cancel Mistaken Order Confirmation Modal (Processing section) */}
      {orderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-slate-900 text-base">Cancel Mistaken Order?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to cancel order <strong className="text-slate-800">#{orderToDelete.orderNumber}</strong> for <strong className="text-slate-800">{orderToDelete.customerName}</strong>?
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11.5px] text-amber-900 space-y-1">
              <p className="font-bold">What happens when cancelled:</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                <li>Order is removed from active processing.</li>
                <li>Any advance payment or customer dues are reverted.</li>
                <li>An audit log entry is recorded.</li>
              </ul>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                No, Keep Order
              </button>
              <button
                type="button"
                onClick={handleDeleteOrder}
                disabled={isDeletingOrder}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition flex items-center justify-center space-x-1"
              >
                {isDeletingOrder ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <span>Yes, Cancel Order</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dual Printable Receipt Modal */}
      <ReceiptModal order={selectedReceipt} onClose={() => setSelectedReceipt(null)} />
    </div>
  );
}
