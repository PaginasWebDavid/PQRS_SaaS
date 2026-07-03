import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/domains/platform/permissions";
import { getSuperAdminOverview } from "@/domains/platform/super-admin.service";
import { formatMoneyFromCents, getSubscriptionStatusLabel, renewSubscriptionWithSimulatedPayment } from "@/domains/billing/billing.service";
import {
  createTenantWithAdmin,
  normalizeSlug,
  updateTenantStatusForSuperAdmin,
} from "@/domains/platform/tenant-admin.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Eye,
  PauseCircle,
  PlayCircle,
  Shield,
  Users,
} from "lucide-react";

type SearchParams = {
  tenantId?: string;
  createdTenant?: string;
  adminEmail?: string;
  tempPassword?: string;
};

export default async function SuperAdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/login");
  }

  if (!isSuperAdmin(session.user.role)) {
    redirect("/dashboard");
  }

  const { stats, tenants, selectedTenant, recentAuditLogs, billing } = await getSuperAdminOverview(
    searchParams.tenantId
  );

  async function createTenantAction(formData: FormData) {
    "use server";

    const actionSession = await auth();
    if (!actionSession?.user || !isSuperAdmin(actionSession.user.role)) {
      redirect("/dashboard");
    }

    const name = readText(formData, "name");
    const slug = normalizeSlug(readText(formData, "slug") || name);
    const city = readText(formData, "city");
    const address = readText(formData, "address");
    const units = Number(readText(formData, "units"));
    const adminName = readText(formData, "adminName");
    const adminEmail = readText(formData, "adminEmail");
    const adminPhone = readText(formData, "adminPhone");

    if (!name || !slug || !adminName || !adminEmail || !Number.isInteger(units) || units < 1) {
      redirect("/super-admin?error=invalid-create");
    }

    const result = await createTenantWithAdmin(actionSession.user.id, {
      name,
      slug,
      city,
      address,
      units,
      adminName,
      adminEmail,
      adminPhone,
    });

    revalidatePath("/super-admin");
    redirect(
      `/super-admin?tenantId=${result.tenantId}&createdTenant=${encodeURIComponent(
        result.tenantSlug
      )}&adminEmail=${encodeURIComponent(result.adminEmail)}&tempPassword=${encodeURIComponent(
        result.temporaryPassword
      )}`
    );
  }

  async function suspendTenantAction(formData: FormData) {
    "use server";

    const actionSession = await auth();
    if (!actionSession?.user || !isSuperAdmin(actionSession.user.role)) {
      redirect("/dashboard");
    }

    const tenantId = readText(formData, "tenantId");
    if (tenantId) {
      await updateTenantStatusForSuperAdmin(actionSession.user.id, tenantId, "SUSPENDED");
    }

    revalidatePath("/super-admin");
    redirect(`/super-admin?tenantId=${tenantId}`);
  }


  async function renewSubscriptionAction(formData: FormData) {
    "use server";

    const actionSession = await auth();
    if (!actionSession?.user || !isSuperAdmin(actionSession.user.role)) {
      redirect("/dashboard");
    }

    const tenantId = readText(formData, "tenantId");
    if (tenantId) {
      await renewSubscriptionWithSimulatedPayment({
        actorUserId: actionSession.user.id,
        tenantId,
      });
    }

    revalidatePath("/super-admin");
    redirect(`/super-admin?tenantId=${tenantId}`);
  }
  async function reactivateTenantAction(formData: FormData) {
    "use server";

    const actionSession = await auth();
    if (!actionSession?.user || !isSuperAdmin(actionSession.user.role)) {
      redirect("/dashboard");
    }

    const tenantId = readText(formData, "tenantId");
    if (tenantId) {
      await updateTenantStatusForSuperAdmin(actionSession.user.id, tenantId, "ACTIVE");
    }

    revalidatePath("/super-admin");
    redirect(`/super-admin?tenantId=${tenantId}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plataforma</h1>
          <p className="text-sm text-gray-500">Dashboard SUPER_ADMIN</p>
        </div>
      </div>

      {searchParams.createdTenant && searchParams.adminEmail && searchParams.tempPassword && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-semibold">Tenant creado: {searchParams.createdTenant}</p>
          <p className="mt-1">ADMIN: {searchParams.adminEmail}</p>
          <p className="mt-1 font-mono">Contraseña temporal: {searchParams.tempPassword}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <Stat label="Tenant" value={stats.totalTenants} icon={Building2} />
        <Stat label="Activos" value={stats.activeTenants} icon={CheckCircle2} />
        <Stat label="Trial" value={stats.trialTenants} icon={CalendarClock} />
        <Stat label="Suspendidos" value={stats.suspendedTenants} icon={PauseCircle} />
        <Stat label="Usuarios" value={stats.totalUsers} icon={Users} />
        <Stat label="PQRS" value={stats.totalPqrs} icon={Shield} />
        <Stat label="Cerradas" value={stats.closedPqrs} icon={CheckCircle2} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyStat label="Ingreso mensual" value={billing.monthlyRevenueCents} icon={DollarSign} />
        <Stat label="Pagos pendientes" value={billing.pendingPayments} icon={CreditCard} />
        <Stat label="Renovaciones próximas" value={billing.upcomingRenewals} icon={CalendarClock} />
        <Stat label="Licencias activas" value={billing.activeLicenses} icon={CheckCircle2} />
      </div>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Gestión de Tenant</h2>
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Unidades</th>
                  <th className="px-4 py-3 font-medium">Administrador</th>
                  <th className="px-4 py-3 font-medium">Licencia</th>
                  <th className="px-4 py-3 font-medium">Precio</th>
                  <th className="px-4 py-3 font-medium">Renueva</th>
                  <th className="px-4 py-3 font-medium">Creado</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tenants.map((tenant) => {
                  const admin = tenant.users[0];
                  return (
                    <tr key={tenant.id}>
                      <td className="px-4 py-3 font-medium text-gray-900">{tenant.name}</td>
                      <td className="px-4 py-3 text-gray-600">{tenant.slug}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={tenant.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-600">{tenant.units}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {admin ? `${admin.name} · ${admin.email}` : "Sin ADMIN"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {tenant.subscription ? getSubscriptionStatusLabel(tenant.subscription.status) : "Sin licencia"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {tenant.subscription ? formatMoneyFromCents(tenant.subscription.priceCents, tenant.subscription.currency) : "N/A"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {tenant.subscription ? tenant.subscription.currentPeriodEnd.toLocaleDateString("es-CO") : "N/A"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {tenant.createdAt.toLocaleDateString("es-CO")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/super-admin?tenantId=${tenant.id}`}
                            className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium text-gray-700 transition-colors hover:bg-gray-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Ver
                          </Link>
                          {tenant.subscription && (
                            <form action={renewSubscriptionAction}>
                              <input type="hidden" name="tenantId" value={tenant.id} />
                              <Button size="sm" variant="outline" type="submit">
                                <CreditCard className="h-3.5 w-3.5" />
                                Renovar
                              </Button>
                            </form>
                          )}
                          {tenant.status === "SUSPENDED" ? (
                            <form action={reactivateTenantAction}>
                              <input type="hidden" name="tenantId" value={tenant.id} />
                              <Button size="sm" variant="outline" type="submit">
                                <PlayCircle className="h-3.5 w-3.5" />
                                Reactivar
                              </Button>
                            </form>
                          ) : (
                            <form action={suspendTenantAction}>
                              <input type="hidden" name="tenantId" value={tenant.id} />
                              <Button size="sm" variant="destructive" type="submit">
                                <PauseCircle className="h-3.5 w-3.5" />
                                Suspender
                              </Button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <form action={createTenantAction} className="space-y-4 rounded-lg border bg-white p-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Crear Tenant</h2>
          </div>
          <Field name="name" label="Nombre del conjunto" required />
          <Field name="slug" label="Slug" />
          <Field name="city" label="Ciudad" />
          <Field name="address" label="Dirección" />
          <Field name="units" label="Número de unidades" type="number" min="1" required />
          <Field name="adminName" label="Nombre del administrador" required />
          <Field name="adminEmail" label="Correo del administrador" type="email" required />
          <Field name="adminPhone" label="Teléfono del administrador" />
          <Button type="submit" className="w-full">
            Crear Tenant
          </Button>
        </form>
      </section>

      {selectedTenant && (
        <section className="space-y-3 rounded-lg border bg-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Detalle de Tenant</h2>
              <p className="text-sm text-gray-500">
                {selectedTenant.name} · {selectedTenant.slug}
              </p>
            </div>
            <StatusBadge status={selectedTenant.status} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Ciudad" value={selectedTenant.city || "N/A"} />
            <Detail label="Dirección" value={selectedTenant.address || "N/A"} />
            <Detail label="Usuarios" value={selectedTenant._count.users} />
            <Detail label="PQRS" value={selectedTenant._count.pqrs} />
          </div>

          {selectedTenant.subscription && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="Licencia" value={getSubscriptionStatusLabel(selectedTenant.subscription.status)} />
              <Detail label="Precio mensual" value={formatMoneyFromCents(selectedTenant.subscription.priceCents, selectedTenant.subscription.currency)} />
              <Detail label="Unidades facturadas" value={selectedTenant.subscription.unitsSnapshot} />
              <Detail label="Próximo pago" value={selectedTenant.subscription.currentPeriodEnd.toLocaleDateString("es-CO")} />
            </div>
          )}

          {selectedTenant.subscription && (
            <div className="space-y-2">
              <h3 className="font-medium text-gray-900">Pagos recientes</h3>
              <div className="divide-y rounded-lg border">
                {selectedTenant.subscription.payments.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-gray-500">Sin pagos registrados.</p>
                ) : (
                  selectedTenant.subscription.payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-gray-900">{formatMoneyFromCents(payment.amountCents, payment.currency)}</p>
                        <p className="text-gray-500">{payment.provider} · {payment.createdAt.toLocaleDateString("es-CO")}</p>
                      </div>
                      <span className="text-xs font-medium text-gray-500">{getSubscriptionStatusLabel(payment.status)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <h3 className="font-medium text-gray-900">Usuarios</h3>
              <div className="divide-y rounded-lg border">
                {selectedTenant.users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-gray-900">{user.name}</p>
                      <p className="text-gray-500">{user.email}</p>
                    </div>
                    <span className="text-xs font-medium text-gray-500">{user.role}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-medium text-gray-900">PQRS recientes</h3>
              <div className="divide-y rounded-lg border">
                {selectedTenant.pqrs.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-gray-500">Sin PQRS registradas.</p>
                ) : (
                  selectedTenant.pqrs.map((pqrs) => (
                    <div key={pqrs.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-gray-900">#{pqrs.numero} · {pqrs.asunto || "Sin asunto"}</p>
                        <p className="text-gray-500">{pqrs.nombreResidente}</p>
                      </div>
                      <span className="text-xs font-medium text-gray-500">{pqrs.estado}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Auditoría reciente</h2>
        <div className="rounded-lg border bg-white p-4 text-sm text-gray-600">
          {recentAuditLogs.length === 0 ? (
            <p>No hay eventos de auditoría registrados.</p>
          ) : (
            <ul className="space-y-2">
              {recentAuditLogs.map((log) => (
                <li key={log.id} className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
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

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{label}</p>
        <Icon className="h-4 w-4 text-green-700" />
      </div>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}


function MoneyStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{label}</p>
        <Icon className="h-4 w-4 text-green-700" />
      </div>
      <p className="mt-1 text-2xl font-bold text-gray-900">{formatMoneyFromCents(value)}</p>
    </div>
  );
}
function Field({ label, name, type = "text", ...props }: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} {...props} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-gray-50 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 font-medium text-gray-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "ACTIVE"
      ? "bg-green-50 text-green-700 ring-green-200"
      : status === "SUSPENDED"
        ? "bg-red-50 text-red-700 ring-red-200"
        : "bg-gray-50 text-gray-700 ring-gray-200";

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${className}`}>
      {status}
    </span>
  );
}

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}