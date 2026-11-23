import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Campaign } from '@/models/Campaign';
import { Setting } from '@/models/Setting';
import { requireAuth } from '@/lib/auth-helpers';

const DEFAULT_GATEWAY_URL = process.env.WHATSAPP_GATEWAY_URL || 'http://localhost:3001';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(0);
    if (!auth.user) return auth.response;

    const { id } = await params;
    await connectDB();

    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return NextResponse.json({ success: false, message: 'Campaign not found' }, { status: 404 });
    }

    // Check if cooldown has finished
    if (campaign.status === 'cooldown') {
      if (campaign.nextBatchAt && new Date() >= new Date(campaign.nextBatchAt)) {
        campaign.status = 'running';
        campaign.nextBatchAt = null;
        await campaign.save();
      } else {
        return NextResponse.json({
          success: true,
          status: 'cooldown',
          message: 'Campaign is resting in automatic cooldown.',
          nextBatchAt: campaign.nextBatchAt,
          campaign: {
            sentCount: campaign.sentCount,
            failedCount: campaign.failedCount,
            totalRecipients: campaign.totalRecipients,
            currentBatch: campaign.currentBatch,
            totalBatches: campaign.totalBatches,
          },
        });
      }
    }

    if (campaign.status !== 'running') {
      return NextResponse.json({
        success: false,
        status: campaign.status,
        message: `Campaign is currently ${campaign.status}. Cannot process messages.`,
      });
    }

    // Check if completed
    if (campaign.currentIndex >= campaign.recipients.length) {
      campaign.status = 'completed';
      campaign.completedAt = new Date();
      await campaign.save();
      return NextResponse.json({
        success: true,
        status: 'completed',
        message: 'Campaign has finished sending to all recipients!',
      });
    }

    // Get current recipient
    const recipient = campaign.recipients[campaign.currentIndex];
    if (!recipient) {
      campaign.status = 'completed';
      campaign.completedAt = new Date();
      await campaign.save();
      return NextResponse.json({ success: true, status: 'completed' });
    }

    // Fetch Gateway URL
    const setting = await Setting.findOne({ key: 'whatsapp_gateway' });
    const gatewayUrl = (setting?.value as { url?: string })?.url || DEFAULT_GATEWAY_URL;

    // Personalize message with customer's name
    const personalizedText = campaign.message
      .replace(/\{\{name\}\}/gi, recipient.customerName || 'Valued Customer')
      .replace(/\{name\}/gi, recipient.customerName || 'Valued Customer');

    let sendSuccess = false;
    let sendError: string | undefined;

    try {
      const waRes = await fetch(`${gatewayUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: recipient.contact,
          text: personalizedText,
          imageUrl: campaign.imageUrl || undefined,
        }),
      });

      const waData = await waRes.json();
      if (waRes.ok && waData.success) {
        sendSuccess = true;
      } else {
        sendError = waData.message || 'WhatsApp Gateway reported delivery failure';
      }
    } catch (err: unknown) {
      sendError = (err as Error).message || 'Failed to connect to WhatsApp Gateway';
    }

    // Update recipient record
    if (sendSuccess) {
      recipient.status = 'sent';
      recipient.sentAt = new Date();
      campaign.sentCount += 1;
    } else {
      recipient.status = 'failed';
      recipient.error = sendError;
      campaign.failedCount += 1;
    }

    // Advance index
    campaign.currentIndex += 1;

    // Check if current batch is finished
    const itemsInCurrentBatch = campaign.currentIndex % campaign.batchSize;
    const isBatchFinished = itemsInCurrentBatch === 0 && campaign.currentIndex < campaign.recipients.length;

    if (isBatchFinished) {
      campaign.status = 'cooldown';
      campaign.currentBatch += 1;
      campaign.nextBatchAt = new Date(Date.now() + campaign.cooldownMinutes * 60 * 1000);
    } else if (campaign.currentIndex >= campaign.recipients.length) {
      campaign.status = 'completed';
      campaign.completedAt = new Date();
    }

    await campaign.save();

    return NextResponse.json({
      success: true,
      status: campaign.status,
      recipient: {
        name: recipient.customerName,
        contact: recipient.contact,
        status: recipient.status,
        error: recipient.error,
      },
      campaign: {
        currentIndex: campaign.currentIndex,
        sentCount: campaign.sentCount,
        failedCount: campaign.failedCount,
        totalRecipients: campaign.totalRecipients,
        currentBatch: campaign.currentBatch,
        totalBatches: campaign.totalBatches,
        nextBatchAt: campaign.nextBatchAt,
        status: campaign.status,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
