import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Campaign } from '@/models/Campaign';
import { Customer } from '@/models/Customer';
import { Location } from '@/models/Location';
import { requireAuth } from '@/lib/auth-helpers';

export async function GET() {
  try {
    const auth = await requireAuth(0); // Admin only
    if (!auth.user) return auth.response;

    await connectDB();
    // Return campaigns sorted by latest, project out recipients array to keep payload compact
    const campaigns = await Campaign.find({}, { recipients: 0 }).sort({ createdAt: -1 });

    return NextResponse.json({ success: true, campaigns });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(0); // Admin only
    if (!auth.user) return auth.response;

    const body = await req.json();
    const {
      title,
      message,
      imageUrl,
      targetLocationId = 'all',
      batchSize = 100,
      delaySeconds = 10,
      cooldownMinutes = 60,
    } = body;

    if (!title?.trim() || !message?.trim()) {
      return NextResponse.json(
        { success: false, message: 'Campaign title and message are required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Determine target location name
    let targetLocationName = 'All Branches (Consolidated)';
    const customerFilter: Record<string, unknown> = {};

    if (targetLocationId && targetLocationId !== 'all') {
      customerFilter.locationId = targetLocationId;
      const loc = await Location.findById(targetLocationId);
      if (loc) {
        targetLocationName = `${loc.name} (${loc.code})`;
      }
    }

    // Fetch matching customers
    const customers = await Customer.find(customerFilter).sort({ createdAt: -1 });

    if (!customers || customers.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No registered customers found for the selected branch / filter.' },
        { status: 400 }
      );
    }

    // Filter valid 10-digit contacts and build recipients
    const recipients = customers
      .filter((c) => {
        const digits = (c.contact || '').replace(/\D/g, '');
        return digits.length >= 10;
      })
      .map((c) => {
        const digits = c.contact.replace(/\D/g, '').slice(-10);
        return {
          customerId: c._id,
          customerName: c.fullname,
          contact: digits,
          status: 'pending' as const,
        };
      });

    if (recipients.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No customers with valid 10-digit mobile numbers found.' },
        { status: 400 }
      );
    }

    const parsedBatchSize = Math.max(5, Math.min(500, Number(batchSize) || 100));
    const parsedDelay = Math.max(5, Math.min(60, Number(delaySeconds) || 10));
    const parsedCooldown = Math.max(1, Math.min(1440, Number(cooldownMinutes) || 60));
    const totalBatches = Math.ceil(recipients.length / parsedBatchSize);

    const campaign = await Campaign.create({
      title: title.trim(),
      message: message.trim(),
      imageUrl: imageUrl || '',
      targetLocationId,
      targetLocationName,
      batchSize: parsedBatchSize,
      delaySeconds: parsedDelay,
      cooldownMinutes: parsedCooldown,
      status: 'draft',
      totalRecipients: recipients.length,
      sentCount: 0,
      failedCount: 0,
      currentIndex: 0,
      currentBatch: 1,
      totalBatches,
      recipients,
    });

    return NextResponse.json({
      success: true,
      message: `Campaign created with ${recipients.length} target recipients across ${totalBatches} batches.`,
      campaign: {
        _id: campaign._id,
        title: campaign.title,
        totalRecipients: campaign.totalRecipients,
        totalBatches: campaign.totalBatches,
        status: campaign.status,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
