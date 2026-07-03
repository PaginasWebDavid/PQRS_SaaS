import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/domains/platform/permissions";
import { getSuperAdminOverview } from "@/domains/platform/super-admin.service";

export default async function SuperAdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  if (!isSuperAdmin(session.user.role)) {
    redirect("/dashboard");
  }

  const { stats, tenants, recentAuditLogs } = await getSuperAdminOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Plataforma</h1>
        <p className="text-sm text-gray-500">Infraestructura SUPER_ADMIN</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Tenant" value={stats.totalTenants} />
        <Stat label="Tenant activos" value={stats.activeTenants} />
        <Stat label="Tenant suspendidos" value={stats.suspendedTenants} />
        <Stat label="Usuarios" value={stats.totalUsers} />
        <Stat label="PQRS" value={stats.totalPqrs} />
        <Stat label="PQRS cerradas" value={stats.closedPqrs} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Tenant registrados</h2>
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Usuarios</th>
                <th className="px-4 py-3 font-medium">PQRS</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{tenant.name}</td>
                  <td className="px-4 py-3 text-gray-600">{tenant.slug}</td>
                  <td className="px-4 py-3 text-gray-600">{tenant.status}</td>
                  <td className="px-4 py-3 text-gray-600">{tenant._count.users}</td>
                  <td className="px-4 py-3 text-gray-600">{tenant._count.pqrs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Auditoría reciente</h2>
        <div className="rounded-lg border bg-white p-4 text-sm text-gray-600">
          {recentAuditLogs.length === 0 ? (
            <p>No hay eventos de auditoría registrados.</p>
          ) : (
            <ul className="space-y-2">
              {recentAuditLogs.map((log) => (
                <li key={log.id} className="flex justify-between gap-4">
                  <span>{log.action}</span>
                  <span className="text-gray-400">{log.createdAt.toLocaleString("es-CO")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}