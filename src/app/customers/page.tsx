'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';
import Pagination from '@/components/Pagination';
import { formatINR } from '@/lib/currency';
import { Users, Plus, Search, Edit2, Trash2, Phone, MapPin, Building2, Wallet, AlertCircle, Calendar, X } from 'lucide-react';

interface Customer {
  _id: string;
  fullname: string;
  address: string;
  contact: string;
  locationName?: string;
  outstandingBalance?: number;
  createdAt: string;
}

function CustomersContent() {
  const searchParams = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const paramSearch = searchParams.get('search') || '';
  const paramDatePreset = searchParams.get('datePreset');
  const paramStartDate = searchParams.get('startDate')?.slice(0, 10) || '';
  const paramEndDate = searchParams.get('endDate')?.slice(0, 10) || '';
  const paramLocationId = searchParams.get('locationId') || 'all';

  const getTodayStr = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const initialStartDate = paramDatePreset === 'today' ? getTodayStr() : paramStartDate;
  const initialEndDate = paramDatePreset === 'today' ? getTodayStr() : paramEndDate;

  const [search, setSearch] = useState(paramSearch);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [locationFilter, setLocationFilter] = useState(paramLocationId);
  const [locationsList, setLocationsList] = useState<{ _id: string; name: string; code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    fetch('/api/locations')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.locations)) {
          setLocationsList(data.locations.filter((l: any) => l.active !== false));
        }
      })
      .catch(() => {});
  }, []);

  // Sync whenever searchParams changes
  useEffect(() => {
    if (paramSearch) setSearch(paramSearch);
    if (paramLocationId) setLocationFilter(paramLocationId);
    if (paramDatePreset === 'today') {
      const todayStr = getTodayStr();
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else {
      setStartDate(paramStartDate);
      setEndDate(paramEndDate);
    }

    if (paramDatePreset || paramStartDate || paramEndDate || paramSearch || (paramLocationId && paramLocationId !== 'all')) {
      const timer = setTimeout(() => {
        customerTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const customerTableRef = React.useRef<HTMLDivElement>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullname, setFullname] = useState('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');

  const fetchCustomers = useCallback(() => {
    setLoading(true);
    let url = '/api/customers';
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (search) params.set('search', search);
    if (locationFilter) params.set('locationId', locationFilter);
    const qs = params.toString();
    if (qs) url += `?${qs}`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => setCustomers(data.customers || []))
      .finally(() => setLoading(false));
  }, [startDate, endDate, search, locationFilter]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const normalizeDigits = (str: string) => {
    const d = (str || '').replace(/\D/g, '');
    return d.length > 10 ? d.slice(-10) : d;
  };

  // Instant duplicate check against existing customers
  const existingCustMatch = React.useMemo(() => {
    const inputDigits = normalizeDigits(contact);
    if (inputDigits.length < 5) return null;
    return (
      customers.find((c) => {
        if (editingId && c._id === editingId) return false;
        const cDigits = normalizeDigits(c.contact);
        return cDigits && (cDigits === inputDigits || (inputDigits.length >= 7 && cDigits.endsWith(inputDigits)));
      }) || null
    );
  }, [contact, customers, editingId]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setFullname('');
    setContact('');
    setAddress('');
    setShowModal(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingId(c._id);
    setFullname(c.fullname);
    setContact(c.contact);
    setAddress(c.address);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullname || !contact) return;

    const digits = contact.replace(/\D/g, '');
    if (digits.length !== 10) {
      alert('Mobile number must be exactly 10 digits (numbers only).');
      return;
    }

    if (!editingId && existingCustMatch) {
      if (confirm(`A customer named "${existingCustMatch.fullname}" already has this phone number (${existingCustMatch.contact}). Would you like to view/edit that customer instead?`)) {
        handleOpenEdit(existingCustMatch);
      }
      return;
    }

    const method = editingId ? 'PUT' : 'POST';
    const body = editingId
      ? { id: editingId, fullname, address, contact }
      : { fullname, address, contact };

    const res = await fetch('/api/customers', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.success) {
      setShowModal(false);
      fetchCustomers();
    } else if (data.code === 'CUSTOMER_EXISTS' && data.customer) {
      alert(data.message);
      handleOpenEdit(data.customer);
    } else {
      alert(data.message || 'Error saving customer');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete customer "${name}"?`)) return;

    const res = await fetch(`/api/customers?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      fetchCustomers();
    }
  };

  const filtered = customers.filter((c) => {
    if (startDate && endDate && startDate === endDate) {
      const d = new Date(c.createdAt);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      if (`${yyyy}-${mm}-${dd}` !== startDate) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.fullname.toLowerCase().includes(q) ||
        c.contact.includes(q) ||
        c.address.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Customer Directory"
          subtitle="Directory & Ledger of Registered Clients across Hubs"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="p-3 sm:p-5 md:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          {/* Header Action Bar */}
          <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 max-w-2xl">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by customer name, phone, address..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                />
              </div>

              {locationsList.length > 0 && (
                <div className="sm:w-56">
                  <select
                    value={locationFilter}
                    onChange={(e) => {
                      setLocationFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="all">📍 All Branches</option>
                    {locationsList.map((l) => (
                      <option key={l._id} value={l._id}>
                        📍 {l.name} ({l.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <button
              onClick={handleOpenAdd}
              className="flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-xs whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Customer</span>
            </button>
          </div>

          {/* Active Filter Banner if filtered by Date or Branch */}
          {(startDate || endDate || (locationFilter && locationFilter !== 'all')) && (
            <div className="px-4 py-2.5 rounded-2xl bg-cyan-50 border border-cyan-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-cyan-900 animate-in fade-in">
              <div className="flex items-center space-x-2">
                <Calendar className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                <span>
                  Showing customers
                  {(startDate || endDate) && (
                    <> registered on <strong>{startDate === endDate ? startDate : `${startDate} to ${endDate}`}</strong></>
                  )}
                  {locationFilter && locationFilter !== 'all' && (
                    <> for branch <strong>{locationsList.find((l) => l._id === locationFilter)?.name || 'Selected Location'}</strong></>
                  )}
                  {' '}({filtered.length} found)
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setLocationFilter('all');
                }}
                className="text-cyan-700 hover:text-cyan-950 font-bold underline flex items-center space-x-1 self-start sm:self-auto"
              >
                <span>Reset All Filters</span>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Customers Table */}
          <div ref={customerTableRef} className="scroll-mt-20 bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">Contact Phone</th>
                    <th className="py-3 px-4">Branch Location</th>
                    <th className="py-3 px-4">Address</th>
                    <th className="py-3 px-4">Outstanding (₹)</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">Loading customers...</td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">No customers found.</td>
                    </tr>
                  ) : (
                    filtered
                      .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
                      .map((c) => (
                        <tr key={c._id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 font-bold text-slate-900">{c.fullname}</td>
                          <td className="py-3 px-4 font-mono text-slate-700 font-medium">{c.contact}</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold">
                              <Building2 className="w-3 h-3" />
                              <span>{c.locationName || 'Central Branch'}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500 truncate max-w-xs">{c.address || '-'}</td>
                          <td className="py-3 px-4 font-mono font-bold">
                            {c.outstandingBalance ? (
                              <span className="text-rose-600">{formatINR(c.outstandingBalance)}</span>
                            ) : (
                              <span className="text-emerald-600">₹0 (Clear)</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => handleOpenEdit(c)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(c._id, c.fullname)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {!loading && filtered.length > 0 && (
              <div className="p-4 bg-slate-50/50">
                <Pagination
                  currentPage={currentPage}
                  totalItems={filtered.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setCurrentPage}
                  label="customers"
                />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Customer Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {editingId ? 'Edit Customer' : 'Add New Customer'}
              </h3>
              <p className="text-xs text-slate-500">Enter client contact details and address</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikram Malhotra"
                  value={fullname}
                  onChange={(e) => setFullname(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Contact Phone (10 Digits) *
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  required
                  placeholder="e.g. 9820011223"
                  value={contact}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setContact(digits);
                  }}
                  className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition ${
                    !editingId && existingCustMatch
                      ? 'border-amber-400 bg-amber-50/30 ring-2 ring-amber-300/50'
                      : 'border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'
                  }`}
                />

                {contact.length > 0 && contact.length < 10 && !existingCustMatch && (
                  <p className="text-[10px] text-amber-600 font-medium mt-1">
                    Mobile number must be exactly 10 digits ({contact.length}/10)
                  </p>
                )}
                {contact.length === 10 && !existingCustMatch && (
                  <p className="text-[10px] text-emerald-600 font-medium mt-1">
                    ✓ Valid 10-digit mobile number
                  </p>
                )}

                {/* Instant Existing Customer Detected Alert & One-Click Edit */}
                {!editingId && existingCustMatch && (
                  <div className="mt-2.5 p-3 rounded-2xl bg-amber-50 border border-amber-300 text-xs space-y-2 animate-in fade-in">
                    <div className="flex items-center space-x-1.5 text-amber-900 font-bold">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Customer with this number already exists!</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-amber-200 flex items-center justify-between gap-2 shadow-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 text-xs truncate">{existingCustMatch.fullname}</p>
                        <p className="text-[11px] text-slate-500 font-mono flex items-center space-x-1">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{existingCustMatch.contact}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(existingCustMatch)}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs active:scale-95 shrink-0 transition"
                      >
                        Edit Customer →
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Address / Flat Details</label>
                <input
                  type="text"
                  placeholder="e.g. Apt 4B, Green Acres"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editingId && !!existingCustMatch}
                  title={!editingId && existingCustMatch ? 'Mobile number already belongs to an existing customer. Click "Edit Customer" above.' : ''}
                  className={`px-4 py-2 rounded-xl text-white text-xs font-bold shadow-sm transition ${
                    !editingId && !!existingCustMatch
                      ? 'opacity-40 cursor-not-allowed bg-slate-400'
                      : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                  }`}
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-100 flex items-center justify-center p-8 text-slate-400 font-semibold text-xs">Loading customer directory...</div>}>
      <CustomersContent />
    </Suspense>
  );
}
