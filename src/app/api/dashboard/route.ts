import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Order } from '@/models/Order';
import { Customer } from '@/models/Customer';
import { Supply } from '@/models/Supply';
import { Payment } from '@/models/Payment';
import { Location } from '@/models/Location';
import { getLocationQueryFilter, requireAuth } from '@/lib/auth-helpers';
import { parseDateBoundaries } from '@/lib/date-utils';

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.user) return auth.response;

    await connectDB();
    const user = auth.user;
    const locationFilter = await getLocationQueryFilter(req);

    const { searchParams } = new URL(req.url);
    const preset = searchParams.get('preset') || 'today';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    // Date boundaries
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;

    if (preset === 'today') {
      periodStart = startOfToday;
      periodEnd = endOfToday;
    } else if (preset === 'custom') {
      const parsed = parseDateBoundaries(startDateParam, endDateParam);
      periodStart = parsed.start;
      periodEnd = parsed.end;
    } else {
      // 'all' -> periodStart and periodEnd are null
    }

    const locationQuery = user.level > 0 && user.locationId 
      ? { _id: user.locationId, active: true } 
      : { active: true };

    // Query in parallel
    const [allOrders, allPayments, customers, supplies, locations] = await Promise.all([
      Order.find({ ...locationFilter, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }),
      Payment.find(locationFilter).sort({ createdAt: -1 }),
      Customer.find(locationFilter),
      Supply.find(locationFilter),
      Location.find(locationQuery),
    ]);

    // Filter data for the active global date period
    const periodPayments = allPayments.filter((p) => {
      if (!periodStart && !periodEnd) return true;
      const d = new Date(p.createdAt);
      if (periodStart && d < periodStart) return false;
      if (periodEnd && d > periodEnd) return false;
      return true;
    });

    const periodOrders = allOrders.filter((o) => {
      if (!periodStart && !periodEnd) return true;
      const d = new Date(o.createdAt);
      if (periodStart && d < periodStart) return false;
      if (periodEnd && d > periodEnd) return false;
      return true;
    });

    const periodCustomers = customers.filter((c) => {
      if (!periodStart && !periodEnd) return true;
      const d = new Date(c.createdAt);
      if (periodStart && d < periodStart) return false;
      if (periodEnd && d > periodEnd) return false;
      return true;
    });

    // 1. Revenue Collected strictly from payments
    const totalRevenue = periodPayments.reduce((acc, p) => acc + (p.amount || 0), 0);

    const todayRevenue = allPayments
      .filter((p) => {
        const d = new Date(p.createdAt);
        return d >= startOfToday && d <= endOfToday;
      })
      .reduce((acc, p) => acc + (p.amount || 0), 0);

    // 2. Pending balances
    // Primary: Outstanding balance on orders placed during this period
    const totalOutstanding = periodOrders.reduce((acc, o) => acc + (o.balance || 0), 0);
    // Lifetime store total outstanding balance for operational context
    const allTimeOutstanding = allOrders.reduce((acc, o) => acc + (o.balance || 0), 0);

    // 3. Active in station
    // Processing orders in period
    const totalProcessing = periodOrders.filter((o) =>
      ['processing', 'pending', 'washing_drying', 'washing', 'drying', 'ironing', 'dry_cleaning', 'folding'].includes(o.status)
    ).length;

    // Ready for pickup in period
    const totalReady = periodOrders.filter((o) => o.status === 'done').length;

    // Total delivered in period (based on timeline.claimedAt falling in period, or fallback to status/createdAt)
    const totalDelivered = (preset === 'all'
      ? allOrders.filter((o) => o.status === 'claimed')
      : allOrders.filter((o) => {
          if (o.status !== 'claimed') return false;
          const delDate = o.timeline?.claimedAt
            ? new Date(o.timeline.claimedAt)
            : new Date(o.updatedAt || o.createdAt);
          if (periodStart && delDate < periodStart) return false;
          if (periodEnd && delDate > periodEnd) return false;
          return true;
        })
    ).length;

    const activeCount = totalProcessing + totalReady;
    const allTimeActive = allOrders.filter((o) =>
      ['processing', 'pending', 'washing_drying', 'washing', 'drying', 'ironing', 'dry_cleaning', 'folding', 'done'].includes(o.status)
    ).length;

    const overdueCount = allOrders.filter(
      (o) => o.status !== 'claimed' && o.expectedDeliveryDate && new Date(o.expectedDeliveryDate) < now
    ).length;

    // 4. Customers
    const allTimeCustomers = customers.length;
    const periodCustomersCount = periodCustomers.length;
    // When filtered by Today or Custom range, totalCustomers represents the customer count for that active period
    const totalCustomers = preset === 'all' ? allTimeCustomers : periodCustomersCount;

    // 5. Status Breakdown Counts
    const statusCounts = {
      processing: totalProcessing,
      done: totalReady,
      claimed: totalDelivered,
    };

    // 6. Payment Methods Distribution for the selected period
    const paymentMethodsDist: Record<string, number> = { Cash: 0, UPI: 0, Card: 0, 'Net Banking': 0 };
    for (const p of periodPayments) {
      const m = p.method || 'Cash';
      paymentMethodsDist[m] = (paymentMethodsDist[m] || 0) + p.amount;
    }

    // 7. Location comparison for the selected period
    const locationComparison = locations.map((loc) => {
      const locOrders = periodOrders.filter((o) => o.locationId?.toString() === loc._id.toString());
      const locPayments = periodPayments.filter((p) => p.locationId?.toString() === loc._id.toString());
      return {
        id: loc._id,
        name: loc.name,
        code: loc.code,
        ordersCount: locOrders.length,
        revenue: locPayments.reduce((sum, p) => sum + p.amount, 0),
        outstanding: locOrders.reduce((sum, o) => sum + (o.balance || 0), 0),
      };
    });

    // 8. Recent orders for the period (fallback to newest orders if period empty)
    const recentOrders = periodOrders.slice(0, 6);

    return NextResponse.json({
      success: true,
      filter: {
        preset,
        startDate: periodStart ? periodStart.toISOString() : null,
        endDate: periodEnd ? periodEnd.toISOString() : null,
      },
      stats: {
        totalRevenue,
        todayRevenue,
        totalOutstanding,
        allTimeOutstanding,
        totalOrders: periodOrders.length,
        allTimeOrders: allOrders.length,
        activeCount,
        allTimeActive,
        completedCount: totalDelivered,
        totalProcessing,
        totalReady,
        totalDelivered,
        overdueCount,
        totalCustomers,
        allTimeCustomers,
        newCustomers: periodCustomersCount,
        lowStockCount: supplies.filter((s) => s.stock < 20).length,
      },
      statusCounts,
      paymentMethodsDist,
      locationComparison,
      recentOrders,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
