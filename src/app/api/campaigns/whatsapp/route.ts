import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Setting } from '@/models/Setting';
import { requireAuth } from '@/lib/auth-helpers';

const DEFAULT_GATEWAY_URL = process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001';

export async function GET() {
  try {
    const auth = await requireAuth(0); // Admin only
    if (!auth.user) return auth.response;

    await connectDB();
    const setting = await Setting.findOne({ key: 'whatsapp_gateway' });
    const gatewayUrl = (setting?.value as { url?: string })?.url || DEFAULT_GATEWAY_URL;

    // Check gateway status
    try {
      const res = await fetch(`${gatewayUrl}/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      const data = await res.json();
      return NextResponse.json({
        success: true,
        gatewayUrl,
        connected: !!data.connected,
        phone: data.phone || null,
        pushName: data.pushName || null,
        qr: data.qr || null,
      });
    } catch {
      return NextResponse.json({
        success: true,
        gatewayUrl,
        connected: false,
        offline: true,
        message: 'WhatsApp Microservice Gateway is offline or unreachable.',
      });
    }
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(0); // Admin only
    if (!auth.user) return auth.response;

    const { url } = await req.json();
    if (!url || !url.trim()) {
      return NextResponse.json({ success: false, message: 'Gateway URL is required' }, { status: 400 });
    }

    const cleanUrl = url.trim().replace(/\/+$/, '');

    await connectDB();
    await Setting.findOneAndUpdate(
      { key: 'whatsapp_gateway' },
      { key: 'whatsapp_gateway', value: { url: cleanUrl }, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, message: 'WhatsApp Gateway URL updated', gatewayUrl: cleanUrl });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
