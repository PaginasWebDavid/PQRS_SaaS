import crypto from "crypto";

const DEFAULT_BUCKET = "pqrs-evidencias";

type UploadInput = {
  tenantId: string;
  folder: "fotos" | "evidencias" | "avatares";
  fileName: string;
  contentType: string;
  buffer: Buffer;
};

export type StoredFile = {
  url: string;
  path: string;
  fileName: string;
  contentType: string;
  size: number;
};

export async function uploadToStorage({
  tenantId,
  folder,
  fileName,
  contentType,
  buffer,
}: UploadInput): Promise<StoredFile> {
  const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();
  const safeName = sanitizeFileName(fileName);
  const path = `${tenantId}/${folder}/${crypto.randomUUID()}-${safeName}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": contentType || "application/octet-stream",
      "x-upsert": "false",
    },
    body: new Uint8Array(buffer),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`No se pudo subir archivo a Supabase Storage: ${detail}`);
  }

  return {
    url: getPublicStorageUrl(path),
    path,
    fileName: safeName,
    contentType,
    size: buffer.length,
  };
}

export async function downloadFromStorage(path: string) {
  const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`No se pudo descargar archivo de Supabase Storage: ${detail}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export function getPublicStorageUrl(path: string) {
  const { supabaseUrl, bucket } = getStorageConfig();
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

export function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return {
      contentType: "application/octet-stream",
      buffer: Buffer.from(dataUrl, "base64"),
    };
  }

  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function getStorageConfig() {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para Supabase Storage");
  }

  return { supabaseUrl, serviceRoleKey, bucket };
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "archivo";
}