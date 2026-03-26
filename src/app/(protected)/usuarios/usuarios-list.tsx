"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Users,
  Search,
  Shield,
  ShieldCheck,
  User as UserIcon,
  Crown,
  Trash2,
  ChevronDown,
  FileText,
  ArrowLeft,
  Pencil,
  Check,
  X,
} from "lucide-react";

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  bloque: number | null;
  apto: number | null;
  createdAt: string;
  _count: { pqrsCreated: number };
}

const roleConfig: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    bg: string;
    text: string;
    border: string;
  }
> = {
  ADMIN: {
    label: "Administrador",
    icon: ShieldCheck,
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
  ASISTENTE: {
    label: "Asistente",
    icon: Shield,
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
  },
  CONSEJO: {
    label: "Consejo",
    icon: Crown,
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  RESIDENTE: {
    label: "Residente",
    icon: UserIcon,
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
  },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function UsuariosList({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
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
    const data = await res.json();
    setUsers(data);
    setLoading(false);
  }, [roleFilter, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function handleRoleChange(userId: string, newRole: string) {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Error al cambiar rol");
    } else {
      await fetchUsers();
    }
    setSaving(false);
    setEditingId(null);
  }

  async function handleLocationSave(userId: string) {
    setSaving(true);
    setError("");
    const bloque = editBloque ? parseInt(editBloque) : null;
    const apto = editApto ? parseInt(editApto) : null;

    if (bloque !== null && (bloque < 1 || bloque > 12)) {
      setError("Bloque debe ser entre 1 y 12");
      setSaving(false);
      return;
    }
    if (apto !== null && (apto < 1 || apto > 999)) {
      setError("Apto debe ser entre 1 y 999");
      setSaving(false);
      return;
    }

    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bloque, apto }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Error al actualizar ubicación");
    } else {
      await fetchUsers();
    }
    setSaving(false);
    setEditLocationId(null);
  }

  async function handleDelete(userId: string) {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Error al eliminar usuario");
    } else {
      await fetchUsers();
    }
    setSaving(false);
    setDeleteConfirm(null);
  }

  const counts = {
    total: users.length,
    admin: users.filter((u) => u.role === "ADMIN").length,
    consejo: users.filter((u) => u.role === "CONSEJO").length,
    residente: users.filter((u) => u.role === "RESIDENTE").length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
          <Users className="h-5 w-5 text-green-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-500">
            {counts.total} usuario{counts.total !== 1 ? "s" : ""} registrado
            {counts.total !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
          <p className="text-xs text-gray-500">Admin</p>
          <p className="text-xl font-bold text-red-700">{counts.admin}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
          <p className="text-xs text-gray-500">Consejo</p>
          <p className="text-xl font-bold text-blue-700">{counts.consejo}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
          <p className="text-xs text-gray-500">Residentes</p>
          <p className="text-xl font-bold text-green-700">{counts.residente}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o correo..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full h-10 text-sm pl-9 pr-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-10 text-sm px-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
        >
          <option value="">Todos los roles</option>
          <option value="ADMIN">Administrador</option>
          <option value="ASISTENTE">Asistente</option>
          <option value="CONSEJO">Consejo</option>
          <option value="RESIDENTE">Residente</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
        </div>
      )}

      {/* No results */}
      {!loading && users.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-gray-500">No se encontraron usuarios.</p>
        </div>
      )}

      {/* User list */}
      {!loading && users.length > 0 && (
        <div className="space-y-3">
          {users.map((u) => {
            const rc = roleConfig[u.role] || roleConfig.RESIDENTE;
            const RoleIcon = rc.icon;
            const isCurrentUser = u.id === currentUserId;
            const isConsejo = u.role === "CONSEJO";

            return (
              <div
                key={u.id}
                className={`bg-white rounded-2xl border p-4 transition-all ${
                  isCurrentUser
                    ? "border-green-300 bg-green-50/30"
                    : isConsejo
                    ? "border-blue-200 bg-blue-50/20"
                    : "border-gray-100"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${rc.bg} ${rc.text}`}
                  >
                    <RoleIcon className="h-6 w-6" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {u.name}
                      </p>
                      {isCurrentUser && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                          Tú
                        </span>
                      )}
                      {isConsejo && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          Solo lectura
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {/* Role badge or selector */}
                      {editingId === u.id ? (
                        <div className="flex items-center gap-1">
                          <select
                            defaultValue={u.role}
                            onChange={(e) =>
                              handleRoleChange(u.id, e.target.value)
                            }
                            disabled={saving}
                            className="h-7 text-xs px-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
                          >
                            <option value="ADMIN">Administrador</option>
                            <option value="ASISTENTE">Asistente</option>
                            <option value="CONSEJO">Consejo</option>
                            <option value="RESIDENTE">Residente</option>
                          </select>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 px-1"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            !isCurrentUser && !isConsejo && setEditingId(u.id)
                          }
                          disabled={isCurrentUser || isConsejo}
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg ${rc.bg} ${rc.text} ${rc.border} border ${
                            isCurrentUser || isConsejo
                              ? "cursor-default"
                              : "hover:opacity-80 cursor-pointer"
                          }`}
                        >
                          {rc.label}
                          {!isCurrentUser && !isConsejo && (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      )}

                      {/* Location: display or edit */}
                      {editLocationId === u.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">B</span>
                          <input
                            type="number"
                            min={1}
                            max={12}
                            value={editBloque}
                            onChange={(e) => setEditBloque(e.target.value)}
                            className="w-12 h-7 text-xs px-1 border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-green-600"
                            placeholder="—"
                          />
                          <span className="text-xs text-gray-500">Apto</span>
                          <input
                            type="number"
                            min={1}
                            max={999}
                            value={editApto}
                            onChange={(e) => setEditApto(e.target.value)}
                            className="w-14 h-7 text-xs px-1 border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-green-600"
                            placeholder="—"
                          />
                          <button
                            onClick={() => handleLocationSave(u.id)}
                            disabled={saving}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-green-600 hover:bg-green-50 transition-colors"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEditLocationId(null)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditLocationId(u.id);
                            setEditBloque(u.bloque ? String(u.bloque) : "");
                            setEditApto(u.apto ? String(u.apto) : "");
                          }}
                          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                          title="Editar ubicación"
                        >
                          {u.bloque ? (
                            <span>B{u.bloque}-{u.apto}</span>
                          ) : (
                            <span className="text-gray-300">Sin ubicación</span>
                          )}
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}

                      {u._count.pqrsCreated > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                          <FileText className="h-3 w-3" />
                          {u._count.pqrsCreated}
                        </span>
                      )}
                      <span className="text-xs text-gray-300">
                        Desde {formatDate(u.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Delete - not for current user or CONSEJO */}
                  {!isCurrentUser && !isConsejo && (
                    <div className="shrink-0">
                      {deleteConfirm === u.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(u.id)}
                            disabled={saving}
                            className="text-xs font-medium px-2 py-1 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                          >
                            {saving ? "..." : "Confirmar"}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 px-1"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(u.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Eliminar usuario"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
