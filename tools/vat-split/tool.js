(() => {
  const F = window.UtiloraFinance;
  const modes = document.getElementById("modes");
  const ratesEl = document.getElementById("rates");
  const customRate = document.getElementById("customRate");
  const amount = document.getElementById("amount");
  const amountLabel = document.getElementById("amountLabel");
  const singlePane = document.getElementById("singlePane");
  const batchPane = document.getElementById("batchPane");
  const batch = document.getElementById("batch");
  const batchTable = document.getElementById("batchTable");
  const message = document.getElementById("message");
  let mode = "inclusive";
  let rate = 0.13;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  function parseRate(raw) {
    const text = String(raw || "").trim().replace(/%/g, "");
    if (!text) return null;
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    return n > 1 ? n / 100 : n === 1 ? 0.01 : n;
  }

  function activeRate() {
    return customRate.value.trim() ? parseRate(customRate.value) ?? rate : rate;
  }

  function paintChips() {
    ratesEl.innerHTML = "";
    F.VAT_RATES.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      if (!customRate.value.trim() && item.value === rate) button.classList.add("active");
      button.addEventListener("click", () => {
        rate = item.value;
        customRate.value = "";
        render();
      });
      ratesEl.append(button);
    });
  }

  function split(value, lineRate) {
    return mode === "exclusive" ? F.vatFromExclusive(value, lineRate) : F.vatFromInclusive(value, lineRate);
  }

  function say(text, isError) {
    message.className = isError ? "message error" : "message";
    message.textContent = text || "";
  }

  function renderSingle() {
    amountLabel.textContent = mode === "exclusive" ? "不含税金额" : "含税金额";
    const parsed = F.parseAmount(amount.value);
    if (parsed.error) {
      ["exOut", "taxOut", "inOut", "rateOut"].forEach((id) => {
        document.getElementById(id).textContent = "—";
      });
      document.getElementById("moneyOut").textContent = "—";
      say(parsed.error === "空行" ? "" : "请输入有效金额", true);
      return null;
    }
    const result = split(parsed.value, activeRate());
    document.getElementById("exOut").textContent = F.formatRmb(result.exclusive);
    document.getElementById("taxOut").textContent = F.formatRmb(result.tax);
    document.getElementById("inOut").textContent = F.formatRmb(result.inclusive);
    document.getElementById("rateOut").textContent = `${F.roundFen(result.rate * 100)}%`;
    document.getElementById("moneyOut").textContent = F.toMoney(result.inclusive);
    say("");
    return result;
  }

  function batchRows() {
    return batch.value.split(/\r?\n/).map((line) => {
      const text = line.trim();
      if (!text) return null;
      const rateMatch = text.match(/^(.*)[,，\t]\s*(\d+(?:\.\d+)?)%$/);
      const left = rateMatch ? rateMatch[1] : text;
      const right = rateMatch ? rateMatch[2] : "";
      const parsed = F.parseAmount(left ?? "");
      const lineRate = right ? parseRate(right) : activeRate();
      if (parsed.error || lineRate == null) return { raw: text, error: "无法解析" };
      return { raw: text, error: "", ...split(parsed.value, lineRate) };
    }).filter(Boolean);
  }

  function renderBatch() {
    const rows = batchRows();
    const sum = rows.reduce((acc, row) => {
      if (row.error) return acc;
      return {
        exclusive: F.roundFen(acc.exclusive + row.exclusive),
        tax: F.roundFen(acc.tax + row.tax),
        inclusive: F.roundFen(acc.inclusive + row.inclusive),
      };
    }, { exclusive: 0, tax: 0, inclusive: 0 });
    batchTable.innerHTML = `
      <thead><tr><th>输入</th><th>税率</th><th>不含税</th><th>税额</th><th>价税合计</th></tr></thead>
      <tbody>${rows.map((row) => row.error
        ? `<tr><td>${esc(row.raw)}</td><td colspan="4" class="error">${esc(row.error)}</td></tr>`
        : `<tr><td>${esc(row.raw)}</td><td>${F.roundFen(row.rate * 100)}%</td><td>${F.formatRmb(row.exclusive)}</td><td>${F.formatRmb(row.tax)}</td><td>${F.formatRmb(row.inclusive)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="2">合计</td><td>${F.formatRmb(sum.exclusive)}</td><td>${F.formatRmb(sum.tax)}</td><td>${F.formatRmb(sum.inclusive)}</td></tr></tfoot>`;
    document.getElementById("batchMoney").textContent = F.toMoney(sum.inclusive);
    say("");
    return { rows, sum };
  }

  function render() {
    paintChips();
    const isBatch = mode === "batch";
    singlePane.hidden = isBatch;
    batchPane.hidden = !isBatch;
    return isBatch ? renderBatch() : renderSingle();
  }

  modes.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    mode = button.dataset.mode;
    [...modes.children].forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
  customRate.addEventListener("input", render);
  amount.addEventListener("input", render);
  batch.addEventListener("input", render);
  document.getElementById("sample").onclick = () => {
    amount.value = mode === "exclusive" ? "10000" : "11300";
    render();
  };
  document.getElementById("copy").onclick = async () => {
    const result = renderSingle();
    if (!result) return;
    await navigator.clipboard.writeText(`不含税 ${F.formatRmb(result.exclusive)}\n税额 ${F.formatRmb(result.tax)}\n价税合计 ${F.formatRmb(result.inclusive)}\n大写 ${F.toMoney(result.inclusive)}`);
    say("已复制价税结果");
  };
  document.getElementById("copyMoney").onclick = async () => {
    const result = renderSingle();
    if (!result) return;
    await navigator.clipboard.writeText(F.toMoney(result.inclusive));
    say("已复制大写");
  };
  document.getElementById("copySum").onclick = async () => {
    const { sum } = renderBatch();
    await navigator.clipboard.writeText(`不含税 ${F.formatRmb(sum.exclusive)}　税额 ${F.formatRmb(sum.tax)}　合计 ${F.formatRmb(sum.inclusive)}`);
    say("已复制合计");
  };
  document.getElementById("downloadCsv").onclick = () => {
    const { rows } = renderBatch();
    const lines = [["输入", "税率", "不含税", "税额", "价税合计"], ...rows.map((row) => (
      row.error
        ? [row.raw, "", "", "", row.error]
        : [row.raw, `${F.roundFen(row.rate * 100)}%`, row.exclusive.toFixed(2), row.tax.toFixed(2), row.inclusive.toFixed(2)]
    ))];
    const text = "\uFEFF" + lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    a.download = "vat-split.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  render();
})();
