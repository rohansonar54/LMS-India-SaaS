import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Campaign } from '@/models/Campaign';
import { requireAuth } from '@/lib/auth-helpers';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(0);
    if (!auth.user) return auth.response;

    const { id } = await params;
    const { action } = await req.json();

    if (!['start', 'pause', 'resume', 'cancel', 'reset'].includes(action)) {
      return NextResponse.json({ success: false, message: 'Invalid campaign action' }, { status: 400 });
    }

    await connectDB();
    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return NextResponse.json({ success: false, message: 'Campaign not found' }, { status: 404 });
    }

    if (action === 'start' || action === 'resume') {
      campaign.status = 'running';
      if (!campaign.startedAt) campaign.startedAt = new Date();
      campaign.nextBatchAt = null;
    } else if (action === 'pause') {
      campaign.status = 'paused';
    } else if (action === 'cancel') {
      campaign.status = 'cancelled';
      campaign.nextBatchAt = null;
    } else if (action === 'reset') {
      campaign.status = 'draft';
      campaign.currentIndex = 0;
      campaign.currentBatch = 1;
      campaign.sentCount = 0;
      campaign.failedCount = 0;
      campaign.startedAt = null;
      campaign.completedAt = null;
      campaign.nextBatchAt = null;
      campaign.recipients.forEach((r) => {
        r.status = 'pending';
        r.sentAt = undefined;
        r.error = undefined;
      });
    }

    await campaign.save();

    return NextResponse.json({
      success: true,
      message: `Campaign ${action}ed successfully`,
      status: campaign.status,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
