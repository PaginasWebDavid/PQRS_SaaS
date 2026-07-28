import crypto from "crypto";

const DEFAULT_BUCKET = "pqrs-evidencias";

type StorageFolder = "fotos" | "evidencias" | "avatares";

type UploadInput = {
  tenantId: string;
  folder: StorageFolder;
  fileName: string;
  contentType: string;
  buffer: Buffer;
};

export type StoredFile = {
  url: string | null;
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
  const path = buildStoragePath({ tenantId, folder, fileName: safeName });
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeStoragePath(path)}`;

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
    url: folder === "avatares" ? getPublicStorageUrl(path) : null,
    path,
    fileName: safeName,
    contentType,
    size: buffer.length,
  };
}

export async function downloadFromStorage(
  path: string,
  access: { tenantId: string; folders?: StorageFolder[] }
) {
  assertStoragePathForTenant(path, access.tenantId, access.folders);
  const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${bucket}/${encodeStoragePath(path)}`,
    {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`No se pudo descargar archivo de Supabase Storage: ${detail}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function deleteFromStorage(
  path: string,
  access: { tenantId: string; folders?: StorageFolder[] }
) {
  assertStoragePathForTenant(path, access.tenantId, access.folders);
  const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${bucket}/${encodeStoragePath(path)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    const detail = await response.text();
    throw new Error(`No se pudo eliminar archivo de Supabase Storage: ${detail}`);
  }
}

export function getPublicStorageUrl(path: string) {
  const { supabaseUrl, bucket } = getStorageConfig();
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodeStoragePath(path)}`;
}

export function buildStoragePath({
  tenantId,
  folder,
  fileName,
  objectId = crypto.randomUUID(),
}: {
  tenantId: string;
  folder: StorageFolder;
  fileName: string;
  objectId?: string;
}) {
  if (
    !/^[a-zA-Z0-9_-]{1,128}$/.test(tenantId) ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(objectId)
  ) {
    throw new Error("Identificador de Storage invalido");
  }
  return `${tenantId}/${folder}/${objectId}-${sanitizeFileName(fileName)}`;
}

export function assertStoragePathForTenant(
  path: string,
  tenantId: string,
  folders: StorageFolder[] = ["fotos", "evidencias", "avatares"]
) {
  if (!path || path.includes("%") || path.includes("\\") || path.includes("\0")) {
    throw new Error("Ruta de Storage invalida");
  }
  const segments = path.split("/");
  if (
    segments.length !== 3 ||
    segments[0] !== tenantId ||
    !folders.includes(segments[1] as StorageFolder) ||
    !segments[2] ||
    segments[2].includes("..")
  ) {
    throw new Error("Ruta de Storage no autorizada");
  }
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

export function matchesDeclaredType(buffer: Buffer, declaredType: string): boolean {
  if (buffer.length < 12) return false;
  switch (declaredType) {
    case "image/png":
      return buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/webp":
      return (
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    case "application/pdf":
      return buffer.subarray(0, 4).toString("ascii") === "%PDF";
    default:
      return false;
  }
}

export function sanitizeFileName(fileName: string) {
  const normalized = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+|[.-]+$/g, "");

  return normalized || "archivo";
}

const AVATAR_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function assertAvatarFileName(fileName: string, contentType: string) {
  if (
    typeof fileName !== "string" ||
    fileName.length < 1 ||
    fileName.length > 180 ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.includes("\0") ||
    fileName.includes("..")
  ) {
    throw new Error("AVATAR_FILE_INVALID");
  }
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : null;
  const expected = AVATAR_EXTENSIONS[contentType];
  if (!expected || !extension || (expected === "jpg" ? !["jpg", "jpeg"].includes(extension) : extension !== expected)) {
    throw new Error("AVATAR_FILE_INVALID");
  }
}

export function buildGlobalAvatarStoragePath({
  userId,
  contentType,
  objectId = crypto.randomUUID(),
}: {
  userId: string;
  contentType: string;
  objectId?: string;
}) {
  const extension = AVATAR_EXTENSIONS[contentType];
  if (!extension || !/^[a-zA-Z0-9_-]{1,128}$/.test(userId) || !/^[a-zA-Z0-9_-]{1,128}$/.test(objectId)) {
    throw new Error("AVATAR_PATH_INVALID");
  }
  return `users/${userId}/avatar-${objectId}.${extension}`;
}

export function assertGlobalAvatarPath(path: string, userId: string) {
  if (!path || path.includes("%") || path.includes("\\") || path.includes("\0") || path.includes("..")) {
    throw new Error("AVATAR_PATH_INVALID");
  }
  const segments = path.split("/");
  if (
    segments.length !== 3 ||
    segments[0] !== "users" ||
    segments[1] !== userId ||
    !/^avatar-[a-zA-Z0-9_-]{1,128}\.(jpg|png|webp)$/.test(segments[2] || "")
  ) {
    throw new Error("AVATAR_PATH_INVALID");
  }
}

export async function uploadGlobalUserAvatar(input: {
  userId: string;
  contentType: string;
  buffer: Buffer;
}): Promise<StoredFile> {
  const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();
  const path = buildGlobalAvatarStoragePath({ userId: input.userId, contentType: input.contentType });
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${encodeStoragePath(path)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": input.contentType,
      "x-upsert": "false",
    },
    body: new Uint8Array(input.buffer),
  });
  if (!response.ok) throw new Error("AVATAR_STORAGE_UPLOAD_FAILED");
  return {
    url: getPublicStorageUrl(path),
    path,
    fileName: path.split("/").pop() || "avatar",
    contentType: input.contentType,
    size: input.buffer.length,
  };
}

export async function deleteGlobalUserAvatar(path: string, userId: string) {
  assertGlobalAvatarPath(path, userId);
  const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${encodeStoragePath(path)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  });
  if (!response.ok && response.status !== 404) throw new Error("AVATAR_STORAGE_DELETE_FAILED");
}

export function getOwnedGlobalAvatarPathFromUrl(value: string | null, userId: string): string | null {
  if (!value) return null;
  const { supabaseUrl, bucket } = getStorageConfig();
  const prefix = `${supabaseUrl}/storage/v1/object/public/${bucket}/`;
  if (!value.startsWith(prefix)) return null;
  const encodedPath = value.slice(prefix.length);
  if (!encodedPath || encodedPath.includes("?") || encodedPath.includes("#")) return null;
  let path: string;
  try {
    path = encodedPath.split("/").map((segment) => decodeURIComponent(segment)).join("/");
  } catch {
    return null;
  }
  try {
    assertGlobalAvatarPath(path, userId);
    return path;
  } catch {
    return null;
  }
}
function encodeStoragePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}
