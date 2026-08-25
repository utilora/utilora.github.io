(() => {
  const u16 = (view, offset) => view.getUint16(offset, true);
  const u32 = (view, offset) => view.getUint32(offset, true);
  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let eocd = bytes.length - 22;
    while (eocd >= 0 && u32(view, eocd) !== 0x06054b50) eocd -= 1;
    if (eocd < 0) throw new Error("不是有效的 XLSX 文件");
    const count = u16(view, eocd + 10);
    let cursor = u32(view, eocd + 16);
    const files = new Map();
    for (let i = 0; i < count; i += 1) {
      if (u32(view, cursor) !== 0x02014b50) throw new Error("XLSX 目录损坏");
      const method = u16(view, cursor + 10);
      const size = u32(view, cursor + 20);
      const nameLen = u16(view, cursor + 28);
      const extraLen = u16(view, cursor + 30);
      const commentLen = u16(view, cursor + 32);
      const localOffset = u32(view, cursor + 42);
      const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLen));
      const localNameLen = u16(view, localOffset + 26);
      const localExtraLen = u16(view, localOffset + 28);
      const start = localOffset + 30 + localNameLen + localExtraLen;
      const compressed = bytes.slice(start, start + size);
      if (method === 0) files.set(name, compressed);
      else if (method === 8) files.set(name, await inflate(compressed));
      cursor += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }
  const xml = (bytes) => new DOMParser().parseFromString(new TextDecoder().decode(bytes), "application/xml");
  const colIndex = (ref) => [...String(ref).replace(/\d/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  async function readFirstSheet(file) {
    if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持直接读取 XLSX，请将文件另存为 CSV 后导入");
    const files = await unzip(await file.arrayBuffer());
    const sharedDoc = files.get("xl/sharedStrings.xml") ? xml(files.get("xl/sharedStrings.xml")) : null;
    const shared = sharedDoc ? [...sharedDoc.querySelectorAll("si")].map((node) => [...node.querySelectorAll("t")].map((t) => t.textContent || "").join("")) : [];
    const sheetName = [...files.keys()].filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort()[0];
    if (!sheetName) throw new Error("XLSX 中没有工作表");
    const doc = xml(files.get(sheetName));
    return [...doc.querySelectorAll("sheetData row")].map((row) => {
      const out = [];
      row.querySelectorAll("c").forEach((cell) => {
        const index = colIndex(cell.getAttribute("r"));
        const type = cell.getAttribute("t");
        const raw = cell.querySelector("v")?.textContent ?? cell.querySelector("is t")?.textContent ?? "";
        out[index] = type === "s" ? (shared[Number(raw)] ?? "") : raw;
      });
      return Array.from({ length: out.length }, (_, index) => out[index] ?? "");
    }).filter((row) => row.some((cell) => String(cell).trim()));
  }
  window.UtiloraXlsx = { readFirstSheet };
})();
