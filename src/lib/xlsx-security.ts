const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const MAX_ENTRIES = 1_000;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;

export class XlsxArchiveError extends Error {
  constructor() {
    super("El archivo .xlsx no cumple los limites de seguridad");
    this.name = "XlsxArchiveError";
  }
}

function fail(): never {
  throw new XlsxArchiveError();
}

function endOfCentralDirectory(buffer: Buffer): number {
  const start = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

// ExcelJS descomprime el ZIP completo al abrir un workbook. Esta lectura del
// directorio central aplica limites antes de llegar a esa operacion costosa.
export function assertSafeXlsxArchive(input: Buffer | ArrayBuffer): void {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length < 22) fail();

  const eocd = endOfCentralDirectory(buffer);
  if (eocd < 0) fail();

  const diskNumber = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocd + 8);
  const entries = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entries || entries > MAX_ENTRIES) fail();
  if (centralOffset + centralSize > eocd) fail();

  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > eocd || buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) fail();
    const flags = buffer.readUInt16LE(offset + 8);
    const compressed = buffer.readUInt32LE(offset + 20);
    const uncompressed = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const next = offset + 46 + fileNameLength + extraLength + commentLength;

    if ((flags & 0x0001) !== 0 || next > eocd) fail();
    if (uncompressed === 0xffffffff || compressed === 0xffffffff) fail();
    if (uncompressed > MAX_ENTRY_UNCOMPRESSED_BYTES) fail();
    if (uncompressed > 0 && compressed === 0) fail();
    if (compressed > 0 && uncompressed / compressed > MAX_COMPRESSION_RATIO) fail();

    totalUncompressed += uncompressed;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) fail();
    offset = next;
  }
  if (offset !== centralOffset + centralSize) fail();
}
