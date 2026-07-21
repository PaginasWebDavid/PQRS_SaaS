type ResidentPqrsSource = {
  id: string;
  numero: number;
  titulo?: string | null;
  asunto?: string | null;
  descripcion: string;
  estado: "EN_ESPERA" | "EN_PROGRESO" | "TERMINADO";
  fechaRecibido: Date;
  updatedAt: Date;
  fechaPrimerContacto?: Date | null;
  fechaCierre?: Date | null;
  numeroRadicacion?: string | null;
  editadoPorResidente?: boolean;
  accionTomada?: string | null;
  evidenciaCierre?: string | null;
  queSeHizoParaCerrar?: string | null;
  evidenciaArchivoNombre?: string | null;
  evidenciaArchivoTipo?: string | null;
  evidenciaArchivoSize?: number | null;
  creadoPor?: { name: string | null } | null;
  gestionadoPor?: { name: string | null } | null;
  historial?: Array<{
    id: string;
    estadoAntes?: "EN_ESPERA" | "EN_PROGRESO" | "TERMINADO" | null;
    estadoDespues: "EN_ESPERA" | "EN_PROGRESO" | "TERMINADO";
    nota?: string | null;
    creadoAt: Date;
  }>;
  fotos?: Array<{
    id: string;
    nombre: string;
    tipo: string;
    size?: number | null;
    orden: number;
  }>;
};

// Nunca exponer la URL publica de Supabase Storage ni la ruta interna al cliente
// (ni siquiera a ADMIN/CONSEJO): todo acceso a archivos debe pasar por las rutas
// propias (/fotos, /evidencia) que verifican tenant/dueno antes de servir el archivo.
export function withoutStorageUrls<T extends { evidenciaArchivoUrl?: string | null; evidenciaArchivoPath?: string | null }>(pqrs: T) {
  const { evidenciaArchivoUrl: _url, evidenciaArchivoPath: _path, ...rest } = pqrs;
  return rest;
}

export function toResidentPqrsView(pqrs: ResidentPqrsSource) {
  return {
    id: pqrs.id,
    numero: pqrs.numero,
    titulo: pqrs.titulo,
    asunto: pqrs.asunto,
    descripcion: pqrs.descripcion,
    estado: pqrs.estado,
    fechaRecibido: pqrs.fechaRecibido,
    updatedAt: pqrs.updatedAt,
    fechaPrimerContacto: pqrs.fechaPrimerContacto ?? null,
    fechaCierre: pqrs.fechaCierre ?? null,
    numeroRadicacion: pqrs.numeroRadicacion ?? null,
    editadoPorResidente: Boolean(pqrs.editadoPorResidente),
    takenByAdministration: pqrs.estado !== "EN_ESPERA" || Boolean(pqrs.fechaPrimerContacto) || Boolean(pqrs.gestionadoPor),
    responsable: pqrs.gestionadoPor?.name ?? null,
    accionTomada: pqrs.accionTomada ?? null,
    evidenciaCierre: pqrs.evidenciaCierre ?? null,
    queSeHizoParaCerrar: pqrs.queSeHizoParaCerrar ?? null,
    evidenciaArchivo: pqrs.evidenciaArchivoNombre
      ? {
          nombre: pqrs.evidenciaArchivoNombre,
          tipo: pqrs.evidenciaArchivoTipo ?? null,
          size: pqrs.evidenciaArchivoSize ?? null,
        }
      : null,
    creadoPor: pqrs.creadoPor ? { name: pqrs.creadoPor.name } : null,
    historial: pqrs.historial?.map((item) => ({
      id: item.id,
      estadoAntes: item.estadoAntes ?? null,
      estadoDespues: item.estadoDespues,
      nota: item.nota ?? null,
      creadoAt: item.creadoAt,
    })),
    fotos: pqrs.fotos?.map((foto) => ({
      id: foto.id,
      nombre: foto.nombre,
      tipo: foto.tipo,
      size: foto.size ?? null,
      orden: foto.orden,
    })),
  };
}
