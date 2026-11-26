'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Sidebar from '@/components/Sidebar';
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  QrCode,
  Settings as SettingsIcon,
  Upload,
  Image as ImageIcon,
  Users,
  Eye,
  X,
  ExternalLink,
  Wifi,
  WifiOff,
  Building2,
  Smartphone,
  Search,
} from 'lucide-react';

interface CampaignSummary {
  _id: string;
  title: string;
  message: string;
  imageUrl?: string;
  targetLocationId: string;
  targetLocationName: string;
  batchSize: number;
  delaySeconds: number;
  cooldownMinutes: number;
  status: 'draft' | 'running' | 'cooldown' | 'paused' | 'completed' | 'cancelled';
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  currentIndex: number;
  currentBatch: number;
  totalBatches: number;
  nextBatchAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

interface CampaignDetail extends CampaignSummary {
  recipients: {
    customerId: string;
    customerName: string;
    contact: string;
    status: 'pending' | 'sent' | 'failed';
    sentAt?: string;
    error?: string;
  }[];
}

interface WhatsAppStatus {
  gatewayUrl: string;
  apiKey?: string;
  sessionId?: string;
  online?: boolean;
  connected: boolean;
  phone?: string | null;
  pushName?: string | null;
  qr?: string | null;
  sessions?: { id: string; name: string; sessionId: string; status: string; phone?: string }[];
  message?: string;
  offline?: boolean;
}

interface LocationOption {
  _id: string;
  name: string;
  code: string;
}

export default function MarketingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignDetail | null>(null);
  const [gatewayInputUrl, setGatewayInputUrl] = useState('https://whatsapp-gateway-vqk0.onrender.com');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [sessionIdInput, setSessionIdInput] = useState('');

  // New Campaign Form
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [audienceType, setAudienceType] = useState<'branch' | 'custom_numbers' | 'selected_customers'>('branch');
  const [customNumbers, setCustomNumbers] = useState('');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [availableCustomers, setAvailableCustomers] = useState<{ _id: string; fullname: string; contact: string; locationName?: string }[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [targetLocationId, setTargetLocationId] = useState('all');
  const [batchSize, setBatchSize] = useState(100);
  const [delaySeconds, setDelaySeconds] = useState(10);
  const [cooldownMinutes, setCooldownMinutes] = useState(60);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchAllCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/customers');
      const data = await res.json();
      if (data.success && Array.isArray(data.customers)) {
        setAvailableCustomers(data.customers);
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleCustomer = (id: string) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(id) ? prev.filter((cId) => cId !== id) : [...prev, id]
    );
  };

  const parsedCustomCount = customNumbers
    .split(/[,\n;]+/)
    .map((n) => n.replace(/\D/g, '').slice(-10))
    .filter((n) => n.length === 10).length;

  const filteredAvailableCustomers = availableCustomers.filter((c) => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return c.fullname.toLowerCase().includes(q) || c.contact.includes(q);
  });

  // Processing state
  const isProcessingRef = useRef(false);

  // Fetch initial data
  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/campaigns');
      const data = await res.json();
      if (data.success) {
        setCampaigns(data.campaigns || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWaStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/campaigns/whatsapp');
      const data = await res.json();
      if (data.success) {
        setWaStatus(data);
        if (data.gatewayUrl) setGatewayInputUrl(data.gatewayUrl);
        if (data.apiKey && !apiKeyInput) setApiKeyInput(data.apiKey);
        if (data.sessionId && !sessionIdInput) setSessionIdInput(data.sessionId);
      }
    } catch {
      // ignore
    }
  }, [apiKeyInput, sessionIdInput]);

  useEffect(() => {
    fetchCampaigns();
    fetchWaStatus();

    // Fetch active locations
    fetch('/api/locations')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.locations)) {
          setLocations(data.locations.filter((l: any) => l.active !== false));
        }
      })
      .catch(() => {});
  }, [fetchCampaigns, fetchWaStatus]);

  // Periodic poll for WhatsApp status (every 10s if QR modal is open or disconnected)
  useEffect(() => {
    const timer = setInterval(() => {
      fetchWaStatus();
    }, 10000);
    return () => clearInterval(timer);
  }, [fetchWaStatus]);

  // Client-side execution loop for running campaigns
  useEffect(() => {
    const runningCampaign = campaigns.find((c) => c.status === 'running' || c.status === 'cooldown');
    if (!runningCampaign) return;

    let timeoutId: NodeJS.Timeout;

    const runStep = async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        const res = await fetch(`/api/campaigns/${runningCampaign._id}/process`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          // Update local campaign list state
          setCampaigns((prev) =>
            prev.map((c) =>
              c._id === runningCampaign._id
                ? {
                    ...c,
                    ...data.campaign,
                    status: data.status,
                  }
                : c
            )
          );
        }
      } catch {
        // ignore
      } finally {
        isProcessingRef.current = false;
      }
    };

    if (runningCampaign.status === 'running') {
      // Pace with delaySeconds (default 10s)
      const delayMs = (runningCampaign.delaySeconds || 10) * 1000;
      timeoutId = setTimeout(runStep, delayMs);
    } else if (runningCampaign.status === 'cooldown') {
      // Check cooldown every 15s
      timeoutId = setTimeout(runStep, 15000);
    }

    return () => clearTimeout(timeoutId);
  }, [campaigns]);

  // Handle Image File Upload (Convert to base64)
  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size exceeds 5MB. Please choose a smaller photo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Create Campaign
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!title.trim() || !message.trim()) {
      setFormError('Please enter both a campaign title and promotional message.');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          message,
          imageUrl,
          audienceType,
          customNumbers,
          selectedCustomerIds,
          targetLocationId,
          batchSize,
          delaySeconds,
          cooldownMinutes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setFormError(data.message || 'Failed to create campaign');
      } else {
        setShowCreateModal(false);
        // Reset form
        setTitle('');
        setMessage('');
        setImageUrl('');
        setAudienceType('branch');
        setCustomNumbers('');
        setSelectedCustomerIds([]);
        setTargetLocationId('all');
        fetchCampaigns();
      }
    } catch (err: unknown) {
      setFormError((err as Error).message || 'Server error occurred');
    } finally {
      setCreating(false);
    }
  };

  // Campaign Actions (Start, Pause, Resume, Cancel)
  const handleAction = async (campaignId: string, action: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        fetchCampaigns();
      }
    } catch {
      // ignore
    }
  };

  // Delete Campaign
  const handleDelete = async (campaignId: string, campaignTitle: string) => {
    if (!confirm(`Are you sure you want to delete campaign "${campaignTitle}"?`)) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setCampaigns((prev) => prev.filter((c) => c._id !== campaignId));
        if (selectedCampaign?._id === campaignId) setSelectedCampaign(null);
      }
    } catch {
      // ignore
    }
  };

  // View Campaign Details / Logs
  const handleViewDetails = async (campaignId: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedCampaign(data.campaign);
      }
    } catch {
      // ignore
    }
  };

  // Save Gateway Settings
  const handleSaveGateway = async () => {
    if (!gatewayInputUrl.trim()) return;
    try {
      const res = await fetch('/api/campaigns/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: gatewayInputUrl,
          apiKey: apiKeyInput,
          sessionId: sessionIdInput,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowSettingsModal(false);
        fetchWaStatus();
      }
    } catch {
      // ignore
    }
  };

  // Active / Running campaign
  const activeCampaign = campaigns.find((c) => c.status === 'running' || c.status === 'cooldown');

  // Cooldown countdown calculation
  const getCooldownRemaining = (nextBatchAt?: string | null) => {
    if (!nextBatchAt) return null;
    const diff = new Date(nextBatchAt).getTime() - Date.now();
    if (diff <= 0) return 'Resuming momentarily...';
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}m ${secs}s remaining`;
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          title="Advertise & Marketing"
          subtitle="Automated WhatsApp Campaigns with Smart Batches & Cooldown"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="p-3 sm:p-5 md:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          {/* Top Banner: WhatsApp Connection Status */}
          <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  waStatus?.connected
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    : 'bg-rose-50 text-rose-600 border border-rose-200'
                }`}
              >
                {waStatus?.connected ? <Wifi className="w-6 h-6" /> : <WifiOff className="w-6 h-6" />}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                    WhatsApp Gateway Status:
                  </h3>
                  {waStatus?.connected ? (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Connected</span>
                    </span>
                  ) : waStatus?.online ? (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      <span>Gateway Online (Need Setup)</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      <span>Offline / Sleeping</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {waStatus?.connected
                    ? `Logged in as: +${waStatus.phone || ''} (${waStatus.pushName || 'Bot'})`
                    : waStatus?.online
                    ? (waStatus.message || 'Render Gateway is live! Add your API Key in Settings to link your sessions.')
                    : 'WhatsApp Gateway is currently offline or sleeping. Open the dashboard to wake it up.'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2.5 self-stretch md:self-auto justify-end">
              {!waStatus?.connected && (
                <button
                  type="button"
                  onClick={() => setShowQrModal(true)}
                  className="flex-1 md:flex-none flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-xs cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Scan QR Code</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                title="Gateway Configuration"
                className="p-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 transition cursor-pointer"
              >
                <SettingsIcon className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="flex-1 md:flex-none flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Create Campaign</span>
              </button>
            </div>
          </div>

          {/* Active Campaign Monitor Banner */}
          {activeCampaign && (
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 rounded-3xl shadow-lg border border-blue-800 animate-in fade-in">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase bg-white/20 text-white">
                      Active Campaign
                    </span>
                    {activeCampaign.status === 'running' ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        <span>Sending Batch {activeCampaign.currentBatch} of {activeCampaign.totalBatches}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                        <Clock className="w-3 h-3" />
                        <span>Auto-Cooldown Resting</span>
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold">{activeCampaign.title}</h2>
                  <p className="text-xs text-blue-200">
                    Target: <strong>{activeCampaign.targetLocationName}</strong> •{' '}
                    Batch size: <strong>{activeCampaign.batchSize}</strong> •{' '}
                    Cooldown: <strong>{activeCampaign.cooldownMinutes}m</strong>
                  </p>
                </div>

                {/* Progress Stats */}
                <div className="flex items-center space-x-4 bg-white/10 backdrop-blur-xs px-4 py-2.5 rounded-2xl border border-white/15">
                  <div className="text-center">
                    <p className="text-[10px] uppercase font-bold text-blue-200">Delivered</p>
                    <p className="text-lg font-mono font-bold text-emerald-400">{activeCampaign.sentCount}</p>
                  </div>
                  <div className="w-px h-8 bg-white/20" />
                  <div className="text-center">
                    <p className="text-[10px] uppercase font-bold text-blue-200">Failed</p>
                    <p className="text-lg font-mono font-bold text-rose-400">{activeCampaign.failedCount}</p>
                  </div>
                  <div className="w-px h-8 bg-white/20" />
                  <div className="text-center">
                    <p className="text-[10px] uppercase font-bold text-blue-200">Remaining</p>
                    <p className="text-lg font-mono font-bold text-cyan-300">
                      {Math.max(0, activeCampaign.totalRecipients - activeCampaign.currentIndex)}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2">
                  {activeCampaign.status === 'running' ? (
                    <button
                      type="button"
                      onClick={() => handleAction(activeCampaign._id, 'pause')}
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs transition flex items-center space-x-1"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAction(activeCampaign._id, 'resume')}
                      className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs transition flex items-center space-x-1"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume Now</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleAction(activeCampaign._id, 'cancel')}
                    className="px-3.5 py-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-4 space-y-1.5">
                <div className="flex justify-between text-xs text-blue-200">
                  <span>
                    Progress: {activeCampaign.sentCount + activeCampaign.failedCount} / {activeCampaign.totalRecipients} recipients
                  </span>
                  <span>
                    {activeCampaign.status === 'cooldown'
                      ? `⏳ Cooldown: ${getCooldownRemaining(activeCampaign.nextBatchAt)}`
                      : `${Math.round(((activeCampaign.sentCount + activeCampaign.failedCount) / (activeCampaign.totalRecipients || 1)) * 100)}%`}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-500"
                    style={{
                      width: `${Math.round(
                        ((activeCampaign.sentCount + activeCampaign.failedCount) / (activeCampaign.totalRecipients || 1)) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Campaigns History */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">Marketing Campaigns</h3>
                <p className="text-xs text-slate-500">History of automated promotional flyers and announcements</p>
              </div>
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                {campaigns.length} Total
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px] tracking-wider">
                    <th className="py-3 px-4">Campaign</th>
                    <th className="py-3 px-4">Target Branch</th>
                    <th className="py-3 px-4">Flyer / Image</th>
                    <th className="py-3 px-4">Delivered / Total</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">Loading campaigns...</td>
                    </tr>
                  ) : campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <Megaphone className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-bold text-slate-600">No campaigns launched yet.</p>
                        <p className="text-xs text-slate-400 mt-0.5">Click &quot;Create Campaign&quot; above to blast your first flyer!</p>
                      </td>
                    </tr>
                  ) : (
                    campaigns.map((c) => (
                      <tr key={c._id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900">{c.title}</p>
                          <p className="text-[11px] text-slate-400">
                            Created: {new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700">
                          {c.targetLocationName}
                        </td>
                        <td className="py-3 px-4">
                          {c.imageUrl ? (
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={c.imageUrl} alt="Flyer" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Text only</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-slate-800">
                            {c.sentCount} / {c.totalRecipients}
                          </span>
                          {c.failedCount > 0 && (
                            <span className="ml-1.5 text-[10px] text-rose-600 font-semibold">
                              ({c.failedCount} failed)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {c.status === 'completed' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Completed</span>
                            </span>
                          )}
                          {c.status === 'running' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                              <span>Sending Batch {c.currentBatch}</span>
                            </span>
                          )}
                          {c.status === 'cooldown' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Cooldown</span>
                            </span>
                          )}
                          {c.status === 'paused' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-800 text-[10px] font-bold">
                              <Pause className="w-3 h-3 text-slate-600" />
                              <span>Paused</span>
                            </span>
                          )}
                          {c.status === 'draft' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                              <span>Draft</span>
                            </span>
                          )}
                          {c.status === 'cancelled' && (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                              <span>Cancelled</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              type="button"
                              onClick={() => handleViewDetails(c._id)}
                              title="View Recipients Log"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {c.status === 'draft' && (
                              <button
                                type="button"
                                onClick={() => handleAction(c._id, 'start')}
                                title="Start Campaign"
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 transition flex items-center space-x-1 cursor-pointer"
                              >
                                <Play className="w-3 h-3" />
                                <span>Start</span>
                              </button>
                            )}

                            {c.status === 'paused' && (
                              <button
                                type="button"
                                onClick={() => handleAction(c._id, 'resume')}
                                title="Resume Campaign"
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 transition flex items-center space-x-1 cursor-pointer"
                              >
                                <Play className="w-3 h-3" />
                                <span>Resume</span>
                              </button>
                            )}

                            {(c.status === 'completed' || c.status === 'cancelled') && (
                              <button
                                type="button"
                                onClick={() => handleAction(c._id, 'reset')}
                                title="Restart Campaign"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 transition cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDelete(c._id, c.title)}
                              title="Delete Campaign"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
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
        </main>
      </div>

      {/* CREATE CAMPAIGN MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <Megaphone className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-800 text-base">Create WhatsApp Advertisement</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/50 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Campaign Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Campaign Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Test Flyer Run / Monsoon 25% Off"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                />
              </div>

              {/* Target Audience Mode Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Who should receive this? *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAudienceType('branch')}
                    className={`p-2.5 rounded-2xl border text-left transition flex items-center space-x-2.5 cursor-pointer ${
                      audienceType === 'branch'
                        ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">By Branch / All</p>
                      <p className="text-[10px] text-slate-500 truncate">Entire customer base</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudienceType('custom_numbers')}
                    className={`p-2.5 rounded-2xl border text-left transition flex items-center space-x-2.5 cursor-pointer ${
                      audienceType === 'custom_numbers'
                        ? 'border-amber-600 bg-amber-50 text-amber-900 ring-2 ring-amber-500/20'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-amber-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">🧪 Test Mode</p>
                      <p className="text-[10px] text-slate-500 truncate">2-3 Custom Numbers</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAudienceType('selected_customers');
                      if (availableCustomers.length === 0) fetchAllCustomers();
                    }}
                    className={`p-2.5 rounded-2xl border text-left transition flex items-center space-x-2.5 cursor-pointer ${
                      audienceType === 'selected_customers'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">👥 Pick Customers</p>
                      <p className="text-[10px] text-slate-500 truncate">Select individually</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Mode 1: By Branch */}
              {audienceType === 'branch' && (
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Select Target Branch *</label>
                  <select
                    value={targetLocationId}
                    onChange={(e) => setTargetLocationId(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="all">🌐 All Branches (Consolidated)</option>
                    {locations.map((loc) => (
                      <option key={loc._id} value={loc._id}>
                        📍 {loc.name} ({loc.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Mode 2: Test Mode (Custom Numbers) */}
              {audienceType === 'custom_numbers' && (
                <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-amber-900 flex items-center space-x-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-amber-600" />
                      <span>Enter Test Mobile Numbers:</span>
                    </label>
                    <span className="text-[11px] font-mono font-bold text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded-full">
                      {parsedCustomCount} number{parsedCustomCount !== 1 ? 's' : ''} detected
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Enter 10-digit numbers separated by comma, space or newline (e.g. 9762861286, 9876543210)"
                    value={customNumbers}
                    onChange={(e) => setCustomNumbers(e.target.value)}
                    className="w-full p-2.5 text-xs font-mono rounded-xl border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <p className="text-[10px] text-amber-800">
                    💡 <strong>Test Safe:</strong> Perfect for testing flyer delivery on 2-3 personal/staff phone numbers first before broadcasting to real customers.
                  </p>
                </div>
              )}

              {/* Mode 3: Specific Selected Customers */}
              {audienceType === 'selected_customers' && (
                <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900 flex items-center space-x-1.5">
                      <Users className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Select Customers from Directory:</span>
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-emerald-800 bg-emerald-200/60 px-2.5 py-0.5 rounded-full">
                        {selectedCustomerIds.length} Selected
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedCustomerIds.length === availableCustomers.length) {
                            setSelectedCustomerIds([]);
                          } else {
                            setSelectedCustomerIds(availableCustomers.map((c) => c._id));
                          }
                        }}
                        className="text-[11px] text-emerald-800 underline font-bold cursor-pointer"
                      >
                        {selectedCustomerIds.length === availableCustomers.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search customers by name or contact number..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-emerald-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="max-h-44 overflow-y-auto divide-y divide-emerald-100 border border-emerald-200 rounded-xl bg-white">
                    {filteredAvailableCustomers.length === 0 ? (
                      <p className="p-3 text-center text-xs text-slate-400">
                        {availableCustomers.length === 0 ? 'Loading customers...' : 'No customers match your search.'}
                      </p>
                    ) : (
                      filteredAvailableCustomers.map((cust) => {
                        const checked = selectedCustomerIds.includes(cust._id);
                        return (
                          <label
                            key={cust._id}
                            className={`flex items-center justify-between px-3 py-2 text-xs hover:bg-emerald-50/50 cursor-pointer transition ${
                              checked ? 'bg-emerald-50/40' : ''
                            }`}
                          >
                            <div className="flex items-center space-x-2.5">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCustomer(cust._id)}
                                className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                              <div>
                                <p className="font-bold text-slate-800">{cust.fullname}</p>
                                <p className="text-[10px] text-slate-400 font-mono">{cust.contact}</p>
                              </div>
                            </div>
                            {cust.locationName && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                                {cust.locationName}
                              </span>
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Flyer Image Upload */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Promotional Flyer / Photo (Optional)</label>
                {imageUrl ? (
                  <div className="relative rounded-2xl border border-slate-200 p-2 bg-slate-50 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl} alt="Uploaded flyer" className="w-16 h-16 object-cover rounded-xl border border-slate-200" />
                      <div>
                        <p className="text-xs font-bold text-slate-800">Flyer image attached</p>
                        <p className="text-[11px] text-slate-400">Will be sent as image with caption</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-xl transition font-semibold"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer transition bg-slate-50 hover:bg-blue-50/50">
                    <Upload className="w-6 h-6 text-slate-400 mb-1" />
                    <span className="text-xs font-bold text-slate-700">Click to upload flyer image</span>
                    <span className="text-[10px] text-slate-400">PNG, JPG, or WEBP up to 5MB</span>
                    <input type="file" accept="image/*" onChange={handleImageFile} className="hidden" />
                  </label>
                )}
              </div>

              {/* Message Description */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">Promotional Message *</label>
                  <span className="text-[10px] text-slate-400 font-medium">Use tag <code className="bg-slate-200 px-1 py-0.5 rounded text-blue-700">{'{{name}}'}</code> for customer name</span>
                </div>
                <textarea
                  required
                  rows={4}
                  placeholder="Dear {{name}}, this festive season enjoy 20% flat discount on all dry cleaning orders! Visit your nearest LMS branch today."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full p-3 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                />
              </div>

              {/* Safety & Batch Controls */}
              <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-3">
                <div className="flex items-center space-x-1.5 text-amber-900 font-bold text-xs">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>Anti-Ban Safety Controls (Automatic Batches & Cooldown)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Batch Size</label>
                    <input
                      type="number"
                      min={5}
                      max={500}
                      value={batchSize}
                      onChange={(e) => setBatchSize(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                    <span className="text-[10px] text-slate-400">Sends 100 per batch</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Delay Between Msgs</label>
                    <input
                      type="number"
                      min={5}
                      max={60}
                      value={delaySeconds}
                      onChange={(e) => setDelaySeconds(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                    <span className="text-[10px] text-slate-400">Human-like ~10s pause</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Auto-Cooldown</label>
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      value={cooldownMinutes}
                      onChange={(e) => setCooldownMinutes(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 bg-white"
                    />
                    <span className="text-[10px] text-slate-400">Auto-rests 60m between batches</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-xs disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{creating ? 'Creating Campaign...' : 'Create Campaign'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WHATSAPP QR MODAL */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 text-center space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-base">Link WhatsApp Account</h3>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {waStatus?.qr ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl inline-block mx-auto shadow-inner">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={waStatus.qr} alt="Scan QR Code" className="w-56 h-56 mx-auto rounded-xl" />
              </div>
            ) : waStatus?.connected ? (
              <div className="p-6 bg-emerald-50 rounded-2xl text-emerald-800">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
                <p className="font-bold text-sm">WhatsApp is Successfully Connected!</p>
                <p className="text-xs text-emerald-600 mt-0.5">Logged in as: +{waStatus.phone}</p>
              </div>
            ) : (
              <div className="p-6 bg-slate-50 rounded-2xl text-slate-500">
                <QrCode className="w-12 h-12 text-slate-300 mx-auto mb-2 animate-pulse" />
                <p className="font-bold text-sm text-slate-700">Connecting to WhatsApp Gateway...</p>
                <p className="text-xs text-slate-400 mt-1">
                  Ensure the microservice is running on <code className="bg-slate-200 px-1 py-0.5 rounded">{waStatus?.gatewayUrl || 'http://localhost:3001'}</code>
                </p>
              </div>
            )}

            <div className="text-left text-xs text-slate-600 space-y-1 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <p className="font-bold text-slate-700 mb-1">How to link:</p>
              <p>1. Open WhatsApp on your phone</p>
              <p>2. Tap <strong>Linked Devices</strong> (in Settings or Menu)</p>
              <p>3. Tap <strong>Link a Device</strong> and point your camera at the QR code above</p>
            </div>

            <button
              type="button"
              onClick={() => {
                fetchWaStatus();
                if (waStatus?.connected) setShowQrModal(false);
              }}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition cursor-pointer"
            >
              {waStatus?.connected ? 'Done' : 'Refresh Status'}
            </button>
          </div>
        </div>
      )}

      {/* GATEWAY SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <SettingsIcon className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-800 text-base">WhatsApp Gateway Settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Configure your cloud-deployed WhatsApp Gateway on Render to handle automated broadcasts and flyer delivery.
            </p>

            {/* Gateway URL */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">Gateway URL</label>
                {gatewayInputUrl && (
                  <a
                    href={gatewayInputUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-1"
                  >
                    <span>Open Dashboard</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                type="text"
                placeholder="https://whatsapp-gateway-vqk0.onrender.com"
                value={gatewayInputUrl}
                onChange={(e) => setGatewayInputUrl(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* API Key */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Gateway API Key (X-API-Key)</label>
              <input
                type="password"
                placeholder="Paste your API Key (e.g. ak_...)"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Copy this from your Render Gateway dashboard under <strong>Settings ➔ API Keys</strong>.
              </p>
            </div>

            {/* Session ID / Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Session Name / ID (Optional)</label>
              <input
                type="text"
                placeholder="e.g. lms-bot (leave blank to auto-use first connected session)"
                value={sessionIdInput}
                onChange={(e) => setSessionIdInput(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-900 text-xs space-y-1">
              <p className="font-bold">Live Cloud Gateway:</p>
              <p>• Your gateway is live at <code className="font-mono bg-emerald-100 px-1 rounded">https://whatsapp-gateway-vqk0.onrender.com</code>.</p>
              <p>• Log in to the gateway dashboard, create or scan your session, copy the API key, and paste it here.</p>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveGateway}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition cursor-pointer"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CAMPAIGN RECIPIENTS LOG MODAL */}
      {selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-800 text-base">{selectedCampaign.title}</h3>
                <p className="text-xs text-slate-500">
                  Target: {selectedCampaign.targetLocationName} • Total Recipients: {selectedCampaign.totalRecipients}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCampaign(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/50 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 uppercase font-bold text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Customer Name</th>
                    <th className="py-2.5 px-3">Phone</th>
                    <th className="py-2.5 px-3">Delivery Status</th>
                    <th className="py-2.5 px-3">Sent Time / Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedCampaign.recipients?.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-2 px-3 font-bold text-slate-800">{r.customerName}</td>
                      <td className="py-2 px-3 font-mono text-slate-600">{r.contact}</td>
                      <td className="py-2 px-3">
                        {r.status === 'sent' && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Sent</span>
                          </span>
                        )}
                        {r.status === 'failed' && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            <span>Failed</span>
                          </span>
                        )}
                        {r.status === 'pending' && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>Pending</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-slate-500">
                        {r.status === 'sent' && r.sentAt
                          ? new Date(r.sentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                          : r.error || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
