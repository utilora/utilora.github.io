(() => {
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const src = text.replace(/^\uFEFF/, "");
    const firstLine = src.split(/\r?\n/, 1)[0] || "";
    const delimiter = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? "\t" : ",";
    for (let i = 0; i < src.length; i += 1) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"') {
          if (src[i + 1] === '"') { cell += '"'; i += 1; }
          else quoted = false;
        } else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delimiter) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && src[i + 1] === "\n") i += 1;
        row.push(cell);
        if (row.some((item) => item.length)) rows.push(row);
        row = [];
        cell = "";
      } else cell += ch;
    }
    row.push(cell);
    if (row.some((item) => item.length)) rows.push(row);
    return rows;
  }

  function csvCell(value) {
    if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  }

  function csvToObjects(text) {
    const rows = parseCsv(text);
    if (!rows.length) return [];
    const headers = rows[0].map((item, index) => item.trim() || `列${index + 1}`);
    return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  }

  function objectsToCsv(value) {
    const rows = Array.isArray(value) ? value : [value];
    const records = rows.filter((item) => item && typeof item === "object");
    if (!records.length) return "";
    const headers = [...new Set(records.flatMap((item) => Object.keys(item)))];
    return [headers.map(csvCell).join(","), ...records.map((item) => headers.map((header) => csvCell(item[header] == null ? "" : String(item[header]))).join(","))].join("\n");
  }

  window.UtiloraCsv = { parseCsv, csvToObjects, objectsToCsv };
})();
