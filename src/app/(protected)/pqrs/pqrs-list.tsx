"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, FileText, Loader2 } from "lucide-react";

interface Pqrs {
  id: string;
  numero: number;
  tipoPqrs: string;
  asunto: string;
  descripcion: string;
  estado: string;
  fechaRecibido: string;
  fechaCierre: string | null;
  bloque: number;
  apto: number;
  nombreResidente: string;
  creadoPor: { name: string } | null;
}

const tipoBadgeColor: Record<string, string> = {
  PETICION: "bg-blue-100 text-blue-800",
  QUEJA: "bg-red-100 text-red-800",
  RECLAMO: "bg-orange-100 text-orange-800",
  SUGERENCIA: "bg-green-100 text-green-800",
};

const tipoLabel: Record<string, string> = {
  PETICION: "Petición",
  QUEJA: "Queja",
  RECLAMO: "Reclamo",
  SUGERENCIA: "Sugerencia",
};

const estadoBadge: Record<string, string> = {
  EN_ESPERA: "bg-yellow-100 text-yellow-800",
  EN_PROGRESO: "bg-blue-100 text-blue-800",
  TERMINADO: "bg-green-100 text-green-800",
};

const estadoLabel: Record<string, string> = {
  EN_ESPERA: "En espera",
  EN_PROGRESO: "En progreso",
  TERMINADO: "Terminado",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Generar lista de años (desde 2021 hasta el actual)
function getYears() {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current; y >= 2021; y--) {
    years.push(y);
  }
  return years;
}

interface PqrsListProps {
  role: string;
}

export function PqrsList({ role }: PqrsListProps) {
  const [pqrs, setPqrs] = useState<Pqrs[]>([]);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState("");
  const [tipo, setTipo] = useState("");
  const [year, setYear] = useState("");

  const isResidente = role === "RESIDENTE";
  const canCreate = isResidente || role === "ADMIN";

  const fetchPqrs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (estado) params.set("estado", estado);
    if (tipo) params.set("tipo", tipo);
    if (year) params.set("year", year);

    const res = await fetch(`/api/pqrs?${params.toString()}`);
    const data = await res.json();
    setPqrs(data);
    setLoading(false);
  }, [estado, tipo, year]);

  useEffect(() => {
    fetchPqrs();
  }, [fetchPqrs]);

  // Estado vacío para residente
  if (!loading && pqrs.length === 0 && isResidente && !estado && !tipo && !year) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-semibold mb-2">No tienes PQRS</h2>
        <p className="text-muted-foreground mb-6">
          Crea tu primera solicitud para comenzar
        </p>
        <Link href="/pqrs/nuevo">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Crear mi primera PQRS
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {isResidente ? "Mis PQRS" : "PQRS"}
        </h1>
        {canCreate && (
          <Link href="/pqrs/nuevo">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Nueva
            </Button>
          </Link>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <Select value={year} onValueChange={(v) => v && setYear(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {getYears().map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={estado} onValueChange={(v) => v && setEstado(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="EN_ESPERA">En espera</SelectItem>
            <SelectItem value="EN_PROGRESO">En progreso</SelectItem>
            <SelectItem value="TERMINADO">Terminado</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tipo} onValueChange={(v) => v && setTipo(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="PETICION">Petición</SelectItem>
            <SelectItem value="QUEJA">Queja</SelectItem>
            <SelectItem value="RECLAMO">Reclamo</SelectItem>
            <SelectItem value="SUGERENCIA">Sugerencia</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Sin resultados con filtros */}
      {!loading && pqrs.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No se encontraron PQRS con los filtros seleccionados.
        </div>
      )}

      {!loading && pqrs.length > 0 && (
        <>
          {/* Contador */}
          <p className="text-sm text-muted-foreground">
            {pqrs.length} solicitud{pqrs.length !== 1 ? "es" : ""}
          </p>

          {/* Mobile: Cards */}
          <div className="space-y-3 md:hidden">
            {pqrs.map((p) => (
              <Link key={p.id} href={`/pqrs/${p.id}`}>
                <Card className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">
                          #{p.numero}
                        </span>
                        <Badge
                          variant="secondary"
                          className={tipoBadgeColor[p.tipoPqrs]}
                        >
                          {tipoLabel[p.tipoPqrs]}
                        </Badge>
                      </div>
                      <Badge
                        variant="secondary"
                        className={estadoBadge[p.estado]}
                      >
                        {estadoLabel[p.estado]}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium line-clamp-2 mb-2">
                      {p.asunto}
                    </p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        T{p.bloque}-{p.apto}
                      </span>
                      <span>{formatDate(p.fechaRecibido)}</span>
                    </div>
                    {p.fechaCierre && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Cerrado: {formatDate(p.fechaCierre)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Desktop: Table */}
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[70px]">#</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Asunto</TableHead>
                  {!isResidente && <TableHead>Residente</TableHead>}
                  {!isResidente && <TableHead>Torre</TableHead>}
                  <TableHead>Recibido</TableHead>
                  <TableHead>Cierre</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pqrs.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Link href={`/pqrs/${p.id}`} className="font-mono text-xs">
                        {p.numero}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={tipoBadgeColor[p.tipoPqrs]}
                      >
                        {tipoLabel[p.tipoPqrs]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <Link
                        href={`/pqrs/${p.id}`}
                        className="hover:underline line-clamp-1"
                      >
                        {p.asunto}
                      </Link>
                    </TableCell>
                    {!isResidente && (
                      <TableCell className="text-sm">
                        {p.nombreResidente}
                      </TableCell>
                    )}
                    {!isResidente && (
                      <TableCell className="text-sm">
                        T{p.bloque}-{p.apto}
                      </TableCell>
                    )}
                    <TableCell className="text-xs">
                      {formatDateTime(p.fechaRecibido)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.fechaCierre ? formatDateTime(p.fechaCierre) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={estadoBadge[p.estado]}
                      >
                        {estadoLabel[p.estado]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
