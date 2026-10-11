// Convert the bundled WOFF fonts to TTF for resvg (its font loader reads only sfnt TTF/OTF).
// WOFF = sfnt with per-table zlib compression; this rebuilds the sfnt container.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const dir = path.join(process.cwd(), "src/lib/render/templates/fonts");
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".woff"))) {
  const w = fs.readFileSync(path.join(dir, file));
  if (w.toString("ascii", 0, 4) !== "wOFF") throw new Error(`${file}: not a WOFF file`);
  const flavor = w.readUInt32BE(4);
  const numTables = w.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = w.subarray(o, o + 4);
    const offset = w.readUInt32BE(o + 4);
    const compLength = w.readUInt32BE(o + 8);
    const origLength = w.readUInt32BE(o + 12);
    const checksum = w.readUInt32BE(o + 16);
    const raw = w.subarray(offset, offset + compLength);
    const data = compLength < origLength ? zlib.inflateSync(raw) : Buffer.from(raw);
    if (data.length !== origLength) throw new Error(`${file}: table ${tag} length mismatch`);
    tables.push({ tag, checksum, data });
  }
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 2 ** entrySelector * 16;
  const header = Buffer.alloc(12);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(searchRange, 6);
  header.writeUInt16BE(entrySelector, 8);
  header.writeUInt16BE(numTables * 16 - searchRange, 10);
  const dirBuf = Buffer.alloc(numTables * 16);
  let offset = 12 + numTables * 16;
  const parts = [];
  tables.forEach((t, i) => {
    t.tag.copy(dirBuf, i * 16);
    dirBuf.writeUInt32BE(t.checksum, i * 16 + 4);
    dirBuf.writeUInt32BE(offset, i * 16 + 8);
    dirBuf.writeUInt32BE(t.data.length, i * 16 + 12);
    const padded = Buffer.alloc(Math.ceil(t.data.length / 4) * 4);
    t.data.copy(padded);
    parts.push(padded);
    offset += padded.length;
  });
  const out = Buffer.concat([header, dirBuf, ...parts]);
  const ttf = path.join(dir, file.replace(/\.woff$/, ".ttf"));
  fs.writeFileSync(ttf, out);
  console.log(`${file} -> ${path.basename(ttf)} (${out.length} bytes, ${numTables} tables)`);
}
