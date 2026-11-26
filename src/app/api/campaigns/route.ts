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
      audienceType = 'branch',
      customNumbers = '',
      selectedCustomerIds = [],
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

    let targetLocationName = 'All Branches (Consolidated)';
    let recipients: {
      customerId?: any;
      customerName: string;
      contact: string;
      status: 'pending';
    }[] = [];

    // Mode 1: Custom Test Mobile Numbers (e.g. 2-3 personal/staff numbers)
    if (audienceType === 'custom_numbers') {
      const rawNumbers = typeof customNumbers === 'string' ? customNumbers : (customNumbers || []).join(',');
      const parsedNums = rawNumbers
        .split(/[,\n;]+/)
        .map((n: string) => n.replace(/\D/g, '').slice(-10))
        .filter((n: string) => n.length === 10);

      const uniqueNums = Array.from(new Set(parsedNums)) as string[];

      if (uniqueNums.length === 0) {
        return NextResponse.json(
          { success: false, message: 'Please enter at least one valid 10-digit mobile number for test mode.' },
          { status: 400 }
        );
      }

      recipients = uniqueNums.map((num, idx) => ({
        customerId: null,
        customerName: `Test Recipient ${idx + 1}`,
        contact: num,
        status: 'pending' as const,
      }));

      targetLocationName = `🧪 Test Mode (${recipients.length} Custom Number${recipients.length > 1 ? 's' : ''})`;
    }
    // Mode 2: Specific Selected Customers (picked from customer list)
    else if (audienceType === 'selected_customers') {
      if (!Array.isArray(selectedCustomerIds) || selectedCustomerIds.length === 0) {
        return NextResponse.json(
          { success: false, message: 'Please select at least one customer from the list.' },
          { status: 400 }
        );
      }

      const customers = await Customer.find({ _id: { $in: selectedCustomerIds } }).sort({ fullname: 1 });
      recipients = customers
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
          { success: false, message: 'None of the selected customers have a valid 10-digit mobile number.' },
          { status: 400 }
        );
      }

      targetLocationName = `👥 Selected Customers (${recipients.length})`;
    }
    // Mode 3: By Branch / All Customers
    else {
      const customerFilter: Record<string, unknown> = {};
      if (targetLocationId && targetLocationId !== 'all') {
        customerFilter.locationId = targetLocationId;
        const loc = await Location.findById(targetLocationId);
        if (loc) {
          targetLocationName = `${loc.name} (${loc.code})`;
        }
      }

      const customers = await Customer.find(customerFilter).sort({ createdAt: -1 });

      if (!customers || customers.length === 0) {
        return NextResponse.json(
          { success: false, message: 'No registered customers found for the selected branch / filter.' },
          { status: 400 }
        );
      }

      recipients = customers
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
