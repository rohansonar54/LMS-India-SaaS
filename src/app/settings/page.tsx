'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';
import { formatINR } from '@/lib/currency';
import { Plus, Edit2, Trash2, Shirt, Layers, Sparkles, CheckCircle2, XCircle, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';

interface ClothingItem {
  _id: string;
  name: string;
  category: string;
  icon?: string;
  defaultService: string;
  services: { serviceName: string; price: number }[];
  active: boolean;
  order?: number;
}

interface ServiceItem {
  _id: string;
  name: string;
  code: string;
  defaultPrice: number;
  description?: string;
  category: string;
  active: boolean;
  order: number;
}

interface PriceItem {
  _id: string;
  name: string;
  unit: string;
  price: number;
}

export default function SettingsPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'garments' | 'services' | 'weight'>('garments');
  const [clothingItems, setClothingItems] = useState<ClothingItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [prices, setPrices] = useState<PriceItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Clothing Item Modal State
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('General');
  const [itemServicePrices, setItemServicePrices] = useState<Record<string, string>>({});

  // Services Master Modal State
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState('');
  const [serviceCategory, setServiceCategory] = useState('Laundry');
  const [serviceDefaultPrice, setServiceDefaultPrice] = useState('25');
  const [serviceDesc, setServiceDesc] = useState('');
  const [serviceActive, setServiceActive] = useState(true);

  // Weight Packages State & Modal
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [editingWeightId, setEditingWeightId] = useState<string | null>(null);
  const [weightName, setWeightName] = useState('');
  const [weightUnit, setWeightUnit] = useState('kg');
  const [weightPrice, setWeightPrice] = useState('45');

  // Sequence Reordering State
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isSavingSequence, setIsSavingSequence] = useState(false);
  const [sequenceSavedToast, setSequenceSavedToast] = useState(false);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const updated = [...clothingItems];
    const [removed] = updated.splice(draggedIndex, 1);
    updated.splice(dropIndex, 0, removed);
    setClothingItems(updated);
    setDraggedIndex(null);
    saveSequence(updated);
  };

  const handleMoveSequence = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= clothingItems.length) return;

    const updated = [...clothingItems];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setClothingItems(updated);
    saveSequence(updated);
  };

  const saveSequence = async (items: ClothingItem[]) => {
    setIsSavingSequence(true);
    try {
      const reorder = items.map((it, idx) => ({ id: it._id, order: idx + 1 }));
      const res = await fetch('/api/items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorder }),
      });
      const data = await res.json();
      if (data.success) {
        setSequenceSavedToast(true);
        setTimeout(() => setSequenceSavedToast(false), 2500);
      }
    } catch {
      // ignore
    } finally {
      setIsSavingSequence(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [itemsRes, servicesRes, pricesRes] = await Promise.all([
        fetch('/api/items').then((r) => r.json()),
        fetch('/api/services').then((r) => r.json()),
        fetch('/api/prices').then((r) => r.json()),
      ]);

      if (itemsRes.success) setClothingItems(itemsRes.items || []);
      if (servicesRes.success) setServices(servicesRes.services || []);
      if (pricesRes.success) setPrices(pricesRes.prices || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Garment Handlers
  const handleOpenAddItem = () => {
    setEditingItemId(null);
    setItemName('');
    setItemCategory('General');
    const initialPrices: Record<string, string> = {};
    services.forEach((s) => {
      initialPrices[s.name] = s.defaultPrice.toString();
    });
    setItemServicePrices(initialPrices);
    setShowItemModal(true);
  };

  const handleOpenEditItem = (item: ClothingItem) => {
    setEditingItemId(item._id);
    setItemName(item.name);
    setItemCategory(item.category || 'General');

    const mappedPrices: Record<string, string> = {};
    services.forEach((s) => {
      const found = item.services.find((itS) => itS.serviceName === s.name);
      mappedPrices[s.name] = found ? found.price.toString() : s.defaultPrice.toString();
    });
    setItemServicePrices(mappedPrices);
    setShowItemModal(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;

    const formattedServices = services.map((s) => {
      const val = itemServicePrices[s.name];
      const parsed = val !== undefined && val !== '' ? parseFloat(val) : NaN;
      return {
        serviceName: s.name,
        price: !isNaN(parsed) && parsed >= 0 ? parsed : s.defaultPrice || 0,
      };
    });

    const method = editingItemId ? 'PUT' : 'POST';
    const body = editingItemId
      ? { id: editingItemId, name: itemName.trim(), category: itemCategory, services: formattedServices }
      : { name: itemName.trim(), category: itemCategory, services: formattedServices };

    const res = await fetch('/api/items', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.success) {
      setShowItemModal(false);
      fetchData();
    } else {
      alert(data.message || 'Error saving garment rate');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to remove this garment from the master list?')) return;
    const res = await fetch(`/api/items?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      fetchData();
    }
  };

  // Services Master Handlers
  const handleOpenAddService = () => {
    setEditingServiceId(null);
    setServiceName('');
    setServiceCategory('Laundry');
    setServiceDefaultPrice('25');
    setServiceDesc('');
    setServiceActive(true);
    setShowServiceModal(true);
  };

  const handleOpenEditService = (s: ServiceItem) => {
    setEditingServiceId(s._id);
    setServiceName(s.name);
    setServiceCategory(s.category || 'Laundry');
    setServiceDefaultPrice(s.defaultPrice.toString());
    setServiceDesc(s.description || '');
    setServiceActive(s.active !== false);
    setShowServiceModal(true);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim()) return;

    const parsedPrice = parseFloat(serviceDefaultPrice);
    const validPrice = !isNaN(parsedPrice) && parsedPrice >= 0 ? parsedPrice : 0;

    const method = editingServiceId ? 'PUT' : 'POST';
    const body = editingServiceId
      ? {
          id: editingServiceId,
          name: serviceName.trim(),
          category: serviceCategory,
          defaultPrice: validPrice,
          description: serviceDesc.trim(),
          active: serviceActive,
        }
      : {
          name: serviceName.trim(),
          category: serviceCategory,
          defaultPrice: validPrice,
          description: serviceDesc.trim(),
          active: serviceActive,
        };

    const res = await fetch('/api/services', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.success) {
      setShowServiceModal(false);
      fetchData();
    } else {
      alert(data.message || 'Error saving service');
    }
  };

  const handleDeleteService = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove service "${name}"?`)) return;
    const res = await fetch(`/api/services?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      fetchData();
    } else {
      alert(data.message || 'Error deleting service');
    }
  };

  const handleToggleServiceActive = async (s: ServiceItem) => {
    const res = await fetch('/api/services', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s._id, active: !s.active }),
    });
    const data = await res.json();
    if (data.success) {
      fetchData();
    }
  };

  // Weight Package Handlers
  const handleOpenAddWeight = () => {
    setEditingWeightId(null);
    setWeightName('');
    setWeightUnit('kg');
    setWeightPrice('45');
    setShowWeightModal(true);
  };

  const handleOpenEditWeight = (p: PriceItem) => {
    setEditingWeightId(p._id);
    setWeightName(p.name);
    setWeightUnit(p.unit || 'kg');
    setWeightPrice(p.price.toString());
    setShowWeightModal(true);
  };

  const handleSaveWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weightName.trim()) return;

    const method = editingWeightId ? 'PUT' : 'POST';
    const body = editingWeightId
      ? { id: editingWeightId, name: weightName.trim(), unit: weightUnit.trim(), price: Number(weightPrice) || 0 }
      : { name: weightName.trim(), unit: weightUnit.trim(), price: Number(weightPrice) || 0 };

    const res = await fetch('/api/prices', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (data.success) {
      setShowWeightModal(false);
      fetchData();
    } else {
      alert(data.message || 'Error saving weight package');
    }
  };

  const handleDeleteWeight = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove package "${name}"?`)) return;
    const res = await fetch(`/api/prices?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      fetchData();
    } else {
      alert(data.message || 'Error deleting weight package');
    }
  };

  const activeServices = services.filter((s) => s.active);

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Price & Service Master"
          subtitle="Indian Rupee (₹) Garment & Laundry Service Rate Configuration"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="p-3 sm:p-5 md:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          {/* Header & Tabs */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-slate-100">
              <button
                onClick={() => setActiveTab('garments')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                  activeTab === 'garments'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Shirt className="w-4 h-4" />
                <span>Garment Master ({clothingItems.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('services')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                  activeTab === 'services'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>Services Master ({services.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('weight')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                  activeTab === 'weight'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Bulk & Measurement Rates ({prices.length})</span>
              </button>
            </div>

            {activeTab === 'garments' && (
              <button
                onClick={handleOpenAddItem}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add New Garment</span>
              </button>
            )}

            {activeTab === 'services' && (
              <button
                onClick={handleOpenAddService}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add New Service</span>
              </button>
            )}

            {activeTab === 'weight' && (
              <button
                onClick={handleOpenAddWeight}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Package / Rate</span>
              </button>
            )}
          </div>

          {/* TAB 1: Garment Item Master */}
          {activeTab === 'garments' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Individual Garment Pricing &amp; Sequence</h3>
                  <p className="text-xs text-slate-500">
                    Drag rows or use ▲/▼ arrows to reorder garments. This sequence controls the exact order shown in POS Quick Add.
                  </p>
                </div>
                {sequenceSavedToast && (
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 animate-in fade-in">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Sequence saved &amp; synced to Quick Add!</span>
                  </span>
                )}
                {isSavingSequence && (
                  <span className="inline-flex items-center space-x-1.5 text-xs text-blue-600 font-semibold animate-pulse">
                    <span>Saving sequence...</span>
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px]">
                      <th className="py-3 px-3 w-16 text-center">Seq #</th>
                      <th className="py-3 px-2 w-14 text-center">Reorder</th>
                      <th className="py-3 px-4">Garment Item</th>
                      <th className="py-3 px-4">Category</th>
                      {activeServices.map((svc) => (
                        <th key={svc._id} className="py-3 px-4">
                          {svc.name}
                        </th>
                      ))}
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={5 + activeServices.length} className="py-8 text-center text-slate-400">
                          Loading garment rates...
                        </td>
                      </tr>
                    ) : clothingItems.length === 0 ? (
                      <tr>
                        <td colSpan={5 + activeServices.length} className="py-8 text-center text-slate-400">
                          No items found.
                        </td>
                      </tr>
                    ) : (
                      clothingItems.map((item, index) => (
                        <tr
                          key={item._id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDrop={(e) => handleDrop(e, index)}
                          className={`transition ${
                            draggedIndex === index
                              ? 'opacity-30 bg-blue-100 border-2 border-dashed border-blue-500'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-slate-100 text-slate-700 font-black text-xs font-mono border border-slate-200 shadow-2xs">
                              #{index + 1}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <div className="flex items-center justify-center space-x-0.5">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => handleMoveSequence(index, 'up')}
                                title="Move up (swap with previous)"
                                className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-20 disabled:cursor-not-allowed"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={index === clothingItems.length - 1}
                                onClick={() => handleMoveSequence(index, 'down')}
                                title="Move down (swap with next)"
                                className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-20 disabled:cursor-not-allowed"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <span
                                className="p-1 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing hidden sm:inline-block"
                                title="Drag to reorder"
                              >
                                <GripVertical className="w-3.5 h-3.5" />
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900 flex items-center space-x-2">
                            <span>{item.icon || '👕'}</span>
                            <span>{item.name}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold">
                              {item.category || 'General'}
                            </span>
                          </td>
                          {activeServices.map((svc) => {
                            const foundSvc = item.services.find((s) => s.serviceName === svc.name);
                            const price = foundSvc ? foundSvc.price : svc.defaultPrice;
                            return (
                              <td key={svc._id} className="py-3 px-4 font-mono font-bold text-slate-800">
                                {price !== undefined ? formatINR(price) : '-'}
                              </td>
                            );
                          })}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => handleOpenEditItem(item)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100"
                                title="Edit Garment Rates"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item._id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100"
                                title="Delete Garment"
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
            </div>
          )}

          {/* TAB 2: Services Master */}
          {activeTab === 'services' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-200">
                <h3 className="font-bold text-slate-800 text-sm">Services Master</h3>
                <p className="text-xs text-slate-500">
                  Configure laundry service types, default rates, and status across the entire application
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px]">
                      <th className="py-3 px-4">Service Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Base Default Rate (₹)</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">Loading services...</td>
                      </tr>
                    ) : services.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No services found. Click &quot;+ Add New Service&quot; above.
                        </td>
                      </tr>
                    ) : (
                      services.map((s) => (
                        <tr key={s._id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 font-bold text-slate-900 flex items-center space-x-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500" />
                            <span>{s.name}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold">
                              {s.category || 'Laundry'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-blue-600">
                            {formatINR(s.defaultPrice)}
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate">
                            {s.description || '—'}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleToggleServiceActive(s)}
                              className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition ${
                                s.active
                                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              }`}
                            >
                              {s.active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              <span>{s.active ? 'Active' : 'Disabled'}</span>
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => handleOpenEditService(s)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100"
                                title="Edit Service"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteService(s._id, s.name)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100"
                                title="Delete Service"
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
            </div>
          )}

          {/* TAB 3: Per-Kg Weight & Measurement Packages */}
          {activeTab === 'weight' && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-200">
                <h3 className="font-bold text-slate-800 text-sm">Bulk Laundry & Measurement Rates (Kg, SqFt, Meter, Pcs)</h3>
                <p className="text-xs text-slate-500">Configured packages are available as quick-add items during order booking</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px]">
                      <th className="py-3 px-4">Service Package</th>
                      <th className="py-3 px-4">Unit</th>
                      <th className="py-3 px-4">Rate (₹)</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">Loading packages...</td>
                      </tr>
                    ) : prices.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">No packages configured. Click &quot;+ Add Package / Rate&quot; above.</td>
                      </tr>
                    ) : (
                      prices.map((p) => (
                        <tr key={p._id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 font-bold text-slate-900">{p.name}</td>
                          <td className="py-3 px-4 font-mono uppercase text-slate-600">{p.unit}</td>
                          <td className="py-3 px-4 font-mono font-bold text-blue-600">{formatINR(p.price)} / {p.unit}</td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => handleOpenEditWeight(p)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100"
                                title="Edit Package"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteWeight(p._id, p.name)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100"
                                title="Delete Package"
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
            </div>
          )}
        </main>
      </div>

      {/* Add / Edit Garment Item Modal */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {editingItemId ? 'Edit Garment Rates' : 'Add New Garment'}
              </h3>
              <p className="text-xs text-slate-500">Configure item name, category, and rates for each active service</p>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Garment Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kurta / Pyjama"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Category</label>
                <select
                  value={itemCategory}
                  onChange={(e) => setItemCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Men">Men</option>
                  <option value="Women">Women</option>
                  <option value="Household">Household</option>
                  <option value="Special">Special Garment</option>
                  <option value="General">General</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                  Service Rates (₹ INR)
                </label>
                <div className="grid grid-cols-2 gap-2.5 max-h-48 overflow-y-auto p-1">
                  {activeServices.map((svc) => (
                    <div key={svc._id} className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                      <span className="text-[10px] font-bold text-slate-600 block truncate" title={svc.name}>
                        {svc.name}
                      </span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={itemServicePrices[svc.name] || ''}
                          onChange={(e) =>
                            setItemServicePrices({
                              ...itemServicePrices,
                              [svc.name]: e.target.value,
                            })
                          }
                          placeholder={svc.defaultPrice.toString()}
                          className="w-full pl-6 pr-2 py-1 text-xs rounded-lg border border-slate-300 font-mono text-right bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-sm"
                >
                  Save Garment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Service Master Modal */}
      {showServiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {editingServiceId ? 'Edit Service' : 'Add New Service'}
              </h3>
              <p className="text-xs text-slate-500">Configure service name, category, and baseline rate in ₹</p>
            </div>

            <form onSubmit={handleSaveService} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Service Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Steam Press, Starch & Polish"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Category</label>
                  <select
                    value={serviceCategory}
                    onChange={(e) => setServiceCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Laundry">Laundry</option>
                    <option value="Pressing">Pressing</option>
                    <option value="Dry Cleaning">Dry Cleaning</option>
                    <option value="Specialty">Specialty</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Base Rate (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={serviceDefaultPrice}
                    onChange={(e) => setServiceDefaultPrice(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Crisp finish with high temperature steam"
                  value={serviceDesc}
                  onChange={(e) => setServiceDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="serviceActiveCheck"
                  checked={serviceActive}
                  onChange={(e) => setServiceActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <label htmlFor="serviceActiveCheck" className="text-xs font-semibold text-slate-700">
                  Active (appears in order dropdowns)
                </label>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowServiceModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-sm"
                >
                  Save Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Weight Package Modal */}
      {showWeightModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {editingWeightId ? 'Edit Package / Rate' : 'Add New Package / Rate'}
              </h3>
              <p className="text-xs text-slate-500">Configure package name, billing unit (kg, sqft, pcs, meter), and rate in ₹</p>
            </div>

            <form onSubmit={handleSaveWeight} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Package / Service Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Wash & Fold, Carpets / Curtains, Blankets"
                  value={weightName}
                  onChange={(e) => setWeightName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Billing Unit *</label>
                  <select
                    value={weightUnit}
                    onChange={(e) => setWeightUnit(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="kg">kg (Kilogram)</option>
                    <option value="pcs">pcs (Pieces)</option>
                    <option value="sqft">sqft (Square Feet)</option>
                    <option value="meter">meter</option>
                    <option value="g">g (Grams)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Rate (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={weightPrice}
                    onChange={(e) => setWeightPrice(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWeightModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-sm"
                >
                  Save Package
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
