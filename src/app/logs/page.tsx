'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';
import Pagination from '@/components/Pagination';
import BlurLoaderOverlay from '@/components/BlurLoaderOverlay';
import { History, Search, RefreshCw, Filter, ShieldCheck, User, Building2, Power, AlertTriangle, Loader2 } from 'lucide-react';

interface LogItem {
  _id: string;
  username: string;
  type: string;
  logs: string;
  locationName?: string;
  createdAt: string;
}

const LOG_TYPES = [
  { value: 'all', label: 'All Event Types' },
  { value: 'login', label: 'User Logins' },
  { value: 'order_create', label: 'Order Creations' },
  { value: 'payment_record', label: 'Payments Recorded' },
  { value: 'status_change', label: 'Status Changes' },
  { value: 'customer_create', label: 'Customer Management' },
  { value: 'supply_update', label: 'Supplies / Inventory' },
  { value: 'seed', label: 'Database Seeding' },
];

export default function LogsPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [retentionDays, setRetentionDays] = useState(10);
  const [loggingEnabled, setLoggingEnabled] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  const fetchLogs = () => {
    setLoading(true);
    setCurrentPage(1);
    const query = new URLSearchParams();
    if (search.trim()) query.set('search', search.trim());
    if (selectedType !== 'all') query.set('type', selectedType);

    fetch(`/api/logs?${query.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setLogs(data.logs || []);
          if (data.retentionDays) {
            setRetentionDays(data.retentionDays);
          }
          if (typeof data.loggingEnabled === 'boolean') {
            setLoggingEnabled(data.loggingEnabled);
          }
        } else {
          setLogs([]);
        }
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  };

  const handleToggleLogging = async () => {
    const nextState = !loggingEnabled;
    setIsToggling(true);
    setLoggingEnabled(nextState); // optimistic update

    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });
      const data = await res.json();
      if (data.success && typeof data.loggingEnabled === 'boolean') {
        setLoggingEnabled(data.loggingEnabled);
      } else {
        setLoggingEnabled(!nextState); // revert
        alert(data.message || 'Failed to update logging setting');
      }
    } catch {
      setLoggingEnabled(!nextState); // revert
      alert('Network error while toggling logging');
    } finally {
      setIsToggling(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  const getTypeBadgeClass = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('payment') || t.includes('collect')) {
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
    if (t.includes('order')) {
      return 'bg-blue-100 text-blue-800 border-blue-200';
    }
    if (t.includes('login') || t.includes('auth')) {
      return 'bg-purple-100 text-purple-800 border-purple-200';
    }
    if (t.includes('seed')) {
      return 'bg-amber-100 text-amber-800 border-amber-200';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Activity & Audit Logs"
          subtitle="Security & Financial Trail of All Multi-Location Operations"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="p-3 sm:p-5 md:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          {/* Header Bar */}
          <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center space-x-2">
                <History className="w-5 h-5 text-blue-600" />
                <span>System Audit Trail</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Activity logs tracking logins, POS orders, collections, and system updates • Auto-purged after {retentionDays} days
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-semibold shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>{retentionDays}-Day Auto-Retention</span>
              </span>

              {/* Configurable Logging ON/OFF Button */}
              <button
                type="button"
                onClick={handleToggleLogging}
                disabled={isToggling}
                suppressHydrationWarning
                title={
                  loggingEnabled
                    ? 'Activity Logging is currently ON. Click to turn OFF / pause recording logs.'
                    : 'Activity Logging is currently OFF (Paused). Click to turn ON / start recording logs.'
                }
                className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-xs active:scale-95 shrink-0 ${loggingEnabled
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300'
                  } ${isToggling ? 'opacity-70 cursor-wait' : ''}`}
              >
                {isToggling ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${loggingEnabled ? 'bg-emerald-200 animate-pulse' : 'bg-rose-500'
                      }`}
                  />
                )}
                <Power className="w-3.5 h-3.5 shrink-0" />
                <span>Logging: {loggingEnabled ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={fetchLogs}
                suppressHydrationWarning
                className="flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
                <span>Refresh Logs</span>
              </button>
            </div>
          </div>

          {/* Notice Banner when Logging is Paused (OFF) */}
          {!loggingEnabled && (
            <div className="p-3.5 rounded-3xl bg-amber-50 border border-amber-300 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900 animate-in fade-in">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-200/80 flex items-center justify-center shrink-0 text-amber-800">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-amber-950">Activity Logging is currently PAUSED (OFF)</p>
                  <p className="text-amber-800 text-[11px] mt-0.5">
                    New operations (orders, payments, logins, customer edits) are not being saved to the audit trail until logging is resumed.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleLogging}
                disabled={isToggling}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs active:scale-95 transition shrink-0 self-end sm:self-auto"
              >
                Turn ON Logging
              </button>
            </div>
          )}

          {/* Search & Filters */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
            <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by operator, details, description, or location..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                />
              </div>

              <div className="flex items-center space-x-2">
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {LOG_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>

                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
                >
                  Search
                </button>
              </div>
            </form>
          </div>

          {/* Logs Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Activity Records ({logs.length})
              </span>
              <span className="text-[11px] text-slate-400">Sorted by newest first</span>
            </div>

            <BlurLoaderOverlay
              loading={loading}
              text="Loading Logs..."
            >
              <div className="overflow-x-auto min-h-[220px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                      <th className="py-3 px-4">Operator</th>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4">Event Type</th>
                      <th className="py-3 px-4">Log Description</th>
                      <th className="py-3 px-4 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="font-semibold text-slate-600">
                            {loading ? 'Preparing audit history...' : 'No activity logs found'}
                          </p>
                          <p className="text-[11px] mt-0.5">
                            {loading ? 'Please wait a moment' : 'Try adjusting your search query or event filter.'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      logs
                        .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
                        .map((log) => (
                          <tr key={log._id} className="hover:bg-slate-50 transition">
                            <td className="py-3 px-4">
                              <div className="flex items-center space-x-1.5">
                                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-[10px]">
                                  {(log.username || 'S')[0].toUpperCase()}
                                </div>
                                <span className="font-bold text-slate-800">{log.username || 'System'}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-600 font-medium">
                              {log.locationName || 'Central Hub'}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getTypeBadgeClass(log.type || '')}`}>
                                {log.type || 'EVENT'}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-800 max-w-md break-words">
                              {log.logs || '—'}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-500 font-mono text-[11px] whitespace-nowrap">
                              {log.createdAt
                                ? new Date(log.createdAt).toLocaleString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                                : '—'}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </BlurLoaderOverlay>

            {/* Pagination Controls */}
            {!loading && logs.length > 0 && (
              <div className="p-4 bg-slate-50/50">
                <Pagination
                  currentPage={currentPage}
                  totalItems={logs.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setCurrentPage}
                  label="activity logs"
                />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
