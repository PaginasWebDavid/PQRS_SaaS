"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
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

            return (
              <div
                key={u.id}
                className={`bg-white rounded-2xl border p-4 transition-all ${
                  isCurrentUser
                    ? "border-green-300 bg-green-50/30"
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
                            !isCurrentUser && setEditingId(u.id)
                          }
                          disabled={isCurrentUser}
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg ${rc.bg} ${rc.text} ${rc.border} border ${
                            isCurrentUser
                              ? "cursor-default"
                              : "hover:opacity-80 cursor-pointer"
                          }`}
                        >
                          {rc.label}
                          {!isCurrentUser && (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      )}

                      {u.bloque && (
                        <span className="text-xs text-gray-400">
                          B{u.bloque}-{u.apto}
                        </span>
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

                  {/* Delete */}
                  {!isCurrentUser && (
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
