import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Setting } from '@/models/Setting';
import { requireAuth } from '@/lib/auth-helpers';

export const DEFAULT_GATEWAY_URL = 'https://whatsapp-gateway-vqk0.onrender.com';

export async function GET() {
  try {
    const auth = await requireAuth(0); // Admin only
    if (!auth.user) return auth.response;

    await connectDB();
    const setting = await Setting.findOne({ key: 'whatsapp_gateway' });
    const config = (setting?.value as { url?: string; apiKey?: string; sessionId?: string }) || {};

    const gatewayUrl = (config.url || DEFAULT_GATEWAY_URL).replace(/\/+$/, '');
    const apiKey = config.apiKey || '';
    const sessionId = config.sessionId || '';

    let isServerOnline = false;
    let connected = false;
    let phone: string | null = null;
    let pushName: string | null = null;
    let qr: string | null = null;
    let sessionsList: { id: string; name: string; sessionId: string; status: string; phone?: string }[] = [];

    // 1. Check WA-AKG Health Endpoint
    try {
      const healthRes = await fetch(`${gatewayUrl}/api/health`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        if (healthData.ok || healthData.status) {
          isServerOnline = true;
        }
      }
    } catch {
      // not WA-AKG or offline
    }

    // 2. If API Key is present, query WA-AKG Sessions
    if (isServerOnline && apiKey) {
      try {
        const sessRes = await fetch(`${gatewayUrl}/api/sessions`, {
          method: 'GET',
          headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        });

        if (sessRes.ok) {
          const sessData = await sessRes.json();
          const list = Array.isArray(sessData.data) ? sessData.data : [];
          sessionsList = list.map((s: any) => ({
            id: s.id,
            name: s.name,
            sessionId: s.sessionId,
            status: s.status,
            phone: s.phone || null,
          }));

          // Find targeted or active session (by sessionId, id, or name)
          const activeSess = sessionId
            ? list.find(
                (s: any) =>
                  s.sessionId === sessionId ||
                  s.id === sessionId ||
                  s.name?.toLowerCase() === sessionId.toLowerCase()
              )
            : list.find((s: any) => s.status === 'CONNECTED') || list[0];

          if (activeSess) {
            if (activeSess.status === 'CONNECTED') {
              connected = true;
              const rawPhone = activeSess.phone || activeSess.me?.id || '';
              phone = rawPhone ? rawPhone.split(':')[0].replace(/\D/g, '') : activeSess.name;
              pushName = `${activeSess.name} (${activeSess.sessionId})`;
            } else if (activeSess.qr || activeSess.qrCode) {
              qr = activeSess.qr || activeSess.qrCode;
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // 3. Fallback: Check simple express microservice status
    if (!isServerOnline) {
      try {
        const statusRes = await fetch(`${gatewayUrl}/status`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          isServerOnline = true;
          connected = !!statusData.connected;
          phone = statusData.phone || null;
          pushName = statusData.pushName || null;
          qr = statusData.qr || null;
        }
      } catch {
        // offline
      }
    }

    return NextResponse.json({
      success: true,
      gatewayUrl,
      apiKey,
      sessionId,
      online: isServerOnline,
      connected,
      phone,
      pushName,
      qr,
      sessions: sessionsList,
      message: !isServerOnline
        ? 'WhatsApp Gateway server is currently offline or sleeping on Render.'
        : !apiKey
        ? 'Gateway is online! Please configure your API Key in Settings to link your sessions.'
        : connected
        ? 'WhatsApp Gateway is connected and ready!'
        : 'Session is disconnected or waiting for QR scan.',
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(0); // Admin only
    if (!auth.user) return auth.response;

    const { url, apiKey, sessionId } = await req.json();
    if (!url || !url.trim()) {
      return NextResponse.json({ success: false, message: 'Gateway URL is required' }, { status: 400 });
    }

    const cleanUrl = url.trim().replace(/\/+$/, '');

    await connectDB();
    await Setting.findOneAndUpdate(
      { key: 'whatsapp_gateway' },
      {
        key: 'whatsapp_gateway',
        value: {
          url: cleanUrl,
          apiKey: (apiKey || '').trim(),
          sessionId: (sessionId || '').trim(),
        },
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      message: 'WhatsApp Gateway settings saved successfully.',
      gatewayUrl: cleanUrl,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
