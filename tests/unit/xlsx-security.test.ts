import test from "node:test";
import assert from "node:assert/strict";
import { assertSafeXlsxArchive, XlsxArchiveError } from "../../src/lib/xlsx-security";

function zipCentralEntry(compressed: number, uncompressed: number) {
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(compressed, 20);
  central.writeUInt32LE(uncompressed, 24);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(0, 16);
  return Buffer.concat([central, eocd]);
}

test("accepts a bounded ZIP central directory", () => {
  assert.doesNotThrow(() => assertSafeXlsxArchive(zipCentralEntry(100, 1_000)));
});

test("rejects a suspicious compression ratio before ExcelJS opens it", () => {
  assert.throws(() => assertSafeXlsxArchive(zipCentralEntry(1, 1_000_000)), XlsxArchiveError);
});

test("rejects malformed archives", () => {
  assert.throws(() => assertSafeXlsxArchive(Buffer.alloc(22)), XlsxArchiveError);
});
