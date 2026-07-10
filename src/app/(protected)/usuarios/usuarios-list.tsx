"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, Search, Trash2, Users, X } from "lucide-react";
import { EmptyState, MetricCard, StatusBadge } from "@/components/pqrs/design-system";

interface UserData { id: string; name: string; email: string; role: string; bloque: number | null; apto: number | null; createdAt: string; _count: { pqrsCreated: number } }

const roleLabels: Record<string, string> = { ADMIN: "Administrador", ASISTENTE: "Asistente", CONSEJO: "Consejo", RESIDENTE: "Residente" };

function formatDate(dateStr: string) { return new Date(dateStr).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }); }

export function UsuariosList({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLocationId, setEditLocationId] = useState<string | null>(null);
  const [editBloque, setEditBloque] = useState("");
  const [editApto, setEditApto] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (roleFilter) params.set("role", roleFilter);
    if (search) params.set("search", search);
    const res = await fetch(`/api/users?${params.toString()}`);
    setUsers(await res.json());
    setLoading(false);
  }, [roleFilter, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { const timer = setTimeout(() => setSearch(searchInput), 300); return () => clearTimeout(timer); }, [searchInput]);

  async function patchUser(userId: string, body: Record<string, unknown>) {
    setSaving(true); setError("");
    const res = await fetch(`/api/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) setError((await res.json()).error || "No se pudo actualizar el usuario."); else await fetchUsers();
    setSaving(false); setEditingId(null); setEditLocationId(null);
  }

  async function handleDelete(userId: string) {
    setSaving(true); setError("");
    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error || "No se pudo eliminar el usuario."); else await fetchUsers();
    setSaving(false); setDeleteConfirm(null);
  }

  const counts = { total: users.length, admin: users.filter((u) => u.role === "ADMIN").length, consejo: users.filter((u) => u.role === "CONSEJO").length, residente: users.filter((u) => u.role === "RESIDENTE").length };

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="pqrs-eyebrow">MODULO USUARIOS</p><h1 className="pqrs-title mt-2">Usuarios del tenant</h1><p className="pqrs-subtitle mt-2">Gestiona roles, ubicaciones y usuarios registrados.</p></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Total" value={counts.total} /><MetricCard label="Admins" value={counts.admin} /><MetricCard label="Consejo" value={counts.consejo} /><MetricCard label="Residentes" value={counts.residente} /></div>

      <section className="pqrs-panel p-4"><div className="flex flex-col gap-2 md:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8E8E93]" /><input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Buscar por nombre o correo" className="pqrs-input h-10 pl-9" /></div><select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="pqrs-input h-10 w-full py-0 md:w-[220px]"><option value="">Todos los roles</option><option value="ADMIN">Administrador</option><option value="ASISTENTE">Asistente</option><option value="CONSEJO">Consejo</option><option value="RESIDENTE">Residente</option></select></div></section>

      {error ? <div className="rounded-2xl bg-[#FBEAEA] p-4 text-sm font-bold text-[#B3261E]">{error}</div> : null}
      {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#122545]" /></div> : null}
      {!loading && users.length === 0 ? <EmptyState title="No hay usuarios" description="No se encontraron usuarios con los filtros seleccionados." /> : null}

      {!loading && users.length > 0 ? <section className="pqrs-panel overflow-hidden"><div className="flex items-center justify-between border-b border-black/[0.06] p-5"><div><p className="pqrs-eyebrow">DIRECTORIO</p><h2 className="mt-1 text-lg font-extrabold">Usuarios registrados</h2></div><Users className="h-5 w-5 text-[#8E8E93]" /></div><div className="overflow-x-auto"><table className="pqrs-table"><thead><tr><th>Usuario</th><th>Rol</th><th>Ubicacion</th><th>PQRS</th><th>Desde</th><th>Acciones</th></tr></thead><tbody>{users.map((u) => { const isCurrent = u.id === currentUserId; const isConsejo = u.role === "CONSEJO"; return <tr key={u.id}><td><p className="font-extrabold text-[#1D1D1F]">{u.name}</p><p className="text-xs text-[#6E6E73]">{u.email}</p></td><td>{editingId === u.id ? <select disabled={saving} defaultValue={u.role} onChange={(e) => patchUser(u.id, { role: e.target.value })} className="pqrs-input h-9 min-w-[150px] py-0"><option value="ADMIN">Administrador</option><option value="ASISTENTE">Asistente</option><option value="CONSEJO">Consejo</option><option value="RESIDENTE">Residente</option></select> : <button disabled={isCurrent || isConsejo} onClick={() => setEditingId(u.id)}><StatusBadge status={isConsejo ? "Consejo solo lectura" : roleLabels[u.role] || u.role} /></button>}</td><td>{editLocationId === u.id ? <div className="flex items-center gap-1"><input value={editBloque} onChange={(e) => setEditBloque(e.target.value)} placeholder="B" className="pqrs-input h-8 w-14 px-2" /><input value={editApto} onChange={(e) => setEditApto(e.target.value)} placeholder="Apto" className="pqrs-input h-8 w-20 px-2" /><button onClick={() => patchUser(u.id, { bloque: editBloque ? parseInt(editBloque) : null, apto: editApto ? parseInt(editApto) : null })} className="text-[#1A6B3A]"><Check className="h-4 w-4" /></button><button onClick={() => setEditLocationId(null)} className="text-[#8E8E93]"><X className="h-4 w-4" /></button></div> : <button onClick={() => { setEditLocationId(u.id); setEditBloque(u.bloque ? String(u.bloque) : ""); setEditApto(u.apto ? String(u.apto) : ""); }} className="inline-flex items-center gap-2 text-sm font-bold text-[#424245]">{u.bloque ? `B${u.bloque}-${u.apto}` : "Sin ubicacion"}<Pencil className="h-3 w-3" /></button>}</td><td>{u._count.pqrsCreated}</td><td>{formatDate(u.createdAt)}</td><td>{!isCurrent && !isConsejo ? deleteConfirm === u.id ? <div className="flex gap-2"><button disabled={saving} onClick={() => handleDelete(u.id)} className="text-xs font-extrabold text-[#B3261E]">Confirmar</button><button onClick={() => setDeleteConfirm(null)} className="text-xs font-bold text-[#8E8E93]">No</button></div> : <button onClick={() => setDeleteConfirm(u.id)} className="text-[#8E8E93] hover:text-[#B3261E]"><Trash2 className="h-4 w-4" /></button> : <span className="text-xs text-[#8E8E93]">Protegido</span>}</td></tr>; })}</tbody></table></div></section> : null}
    </div>
  );
}
