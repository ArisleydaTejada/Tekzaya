import { inflateRawSync } from "node:zlib";

/** Lee las entradas de un `.zip` (como un `.xlsx`) para las pruebas: ruta → texto. */
export function readZip(buffer: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  let offset = 0;

  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    const data = buffer.subarray(start, start + compressedSize);

    entries.set(name, (method === 8 ? inflateRawSync(data) : data).toString("utf8"));
    offset = start + compressedSize;
  }

  return entries;
}
