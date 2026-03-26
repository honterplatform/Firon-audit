import { prisma } from '@audit/db';
import { AdminDashboard } from './AdminDashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VALID_STATUSES = ['completed', 'running', 'queued', 'partial', 'failed'] as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusFilter } = await searchParams;
  const activeTab =
    statusFilter && VALID_STATUSES.includes(statusFilter as any)
      ? statusFilter
      : 'all';

  const where =
    activeTab === 'all'
      ? {}
      : { status: activeTab as any };

  const runs = await prisma.auditRun.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
    where,
    include: {
      _count: {
        select: {
          findings: true,
        },
      },
      salesContacts: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  // Compute stats for the header
  const allContacts = runs.flatMap((r) => r.salesContacts);
  const stats = {
    totalRuns: runs.length,
    totalContacts: allContacts.length,
    newLeads: allContacts.filter((c) => c.contactStatus === 'new_lead').length,
    contacted: allContacts.filter((c) => c.contactStatus === 'contacted').length,
    noResponse: allContacts.filter((c) => c.contactStatus === 'no_response').length,
    responded: allContacts.filter((c) => c.contactStatus === 'responded').length,
    closed: allContacts.filter((c) => c.contactStatus === 'closed').length,
  };

  const serialized = runs.map((run) => ({
    id: run.id,
    target: run.target,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    findingsCount: run._count.findings,
    salesContacts: run.salesContacts.map((sc) => ({
      id: sc.id,
      name: sc.name,
      email: sc.email,
      phone: sc.phone,
      contactStatus: sc.contactStatus as string,
      notes: sc.notes,
      createdAt: sc.createdAt.toISOString(),
    })),
  }));

  return <AdminDashboard runs={serialized} activeTab={activeTab} stats={stats} />;
}
