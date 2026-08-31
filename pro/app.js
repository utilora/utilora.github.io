(() => {
  const F = window.UtiloraFinance;
  const LEGACY_KEY = "utilora_crater_v1";
  const DB_NAME = "utilora_finance_v2";
  const DB_VERSION = 2;
  const STORE_WORKSPACES = "workspaces";
  const STORE_SETTINGS = "settings";
  const STORE_RECOVERY = "recovery";
  const view = document.getElementById("view");
  const sheet = document.getElementById("sheet");
  const titleEl = document.getElementById("page-title");
  const primary = document.getElementById("primary-action");
  const saveState = document.getElementById("save-state");
  let idb = null;
  let workspaceId = "";
  let db = null;
  let demoMode = false;

  const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const esc = (v) => String(v || "").replace(/[&<>"]/g, (ch) => ({ "&": "\u0026amp;", "<": "\u0026lt;", ">": "\u0026gt;", '"': "\u0026quot;" }[ch]));
  const money = (n) => F.formatRmb(F.roundFen(Number(n) || 0));
  const agingConfig = () => window.UtiloraAgingBounds || undefined;
  const agingLabels = (short = false) => {
    const Rec = window.UtiloraReceivables;
    if (short && Rec?.agingBucketShortLabels) return Rec.agingBucketShortLabels(agingConfig());
    if (Rec?.agingBucketLabels) return Rec.agingBucketLabels(agingConfig());
    return { current: "未到期", d30: "逾期 1–30 天", d60: "逾期 31–60 天", d90: "逾期 61–90 天", over90: "逾期 90 天以上" };
  };

  const empty = (name = "我的企业") => ({
    schemaVersion: 3,
    company: { name, taxId: "", address: "", phone: "", email: "", payInfo: "", theme: "navy" },
    customers: [], items: [], estimates: [], invoices: [], payments: [], expenses: [], reimbursements: [], assets: [], bankTransactions: [], payrollRows: [], accounts: [], vouchers: [], voucherTemplates: [], collectionNotes: [], monthEndCloses: [], closedMonths: [],
  });
  const normalizeData = (source) => {
    const next = { ...empty(), ...(source || {}) };
    next.company = { ...empty().company, ...(source?.company || {}) };
    ["customers", "items", "estimates", "invoices", "payments", "expenses", "reimbursements", "assets", "bankTransactions", "payrollRows", "accounts", "vouchers", "voucherTemplates", "collectionNotes", "monthEndCloses"].forEach((key) => {
      next[key] = Array.isArray(source?.[key]) ? source[key] : [];
    });
    next.closedMonths = Array.isArray(source?.closedMonths) ? source.closedMonths : [];
    const estimateStatus = { sent: "issued", viewed: "issued", accepted: "converted", rejected: "void" };
    const invoiceStatusMap = { sent: "issued", viewed: "issued", accepted: "issued", rejected: "void" };
    next.estimates = next.estimates.map((item) => ({ ...item, status: estimateStatus[item.status] || item.status || "draft" }));
    next.invoices = next.invoices.map((item) => ({ ...item, status: invoiceStatusMap[item.status] || item.status || "draft" }));
    const Bank = window.UtiloraBank;
    next.bankTransactions = next.bankTransactions.map((tx) => ({
      ...tx,
      fingerprint: tx.fingerprint || (Bank ? Bank.transactionFingerprint(tx) : tx.fingerprint),
      allocations: Array.isArray(tx.allocations) ? tx.allocations : [],
      paymentId: tx.paymentId || ""
    }));
    next.schemaVersion = 3;
    return next;
  };

  const demo = () => {
    const sample = empty("演示商行（示例数据）");
    sample.company = { name: "演示商行（示例数据）", taxId: "91310000MA0000000X", address: "上海市静安区", phone: "021-00000000", email: "demo@example.com", payInfo: "示例收款账户", theme: "navy" };
    sample.customers = [
      { id: "c1", name: "星海贸易", taxId: "91310115MA1KXXXXXX", email: "a@example.com", phone: "021-58880000", address: "浦东新区世纪大道 1 号" },
      { id: "c2", name: "北岸工作室", taxId: "", email: "b@example.com", phone: "13800000000", address: "静安区" },
      { id: "c3", name: "林间咖啡", taxId: "", email: "c@example.com", phone: "13600000000", address: "徐汇区" },
    ];
    sample.items = [
      { id: "i1", name: "品牌顾问", spec: "按项目", unit: "项", price: 8000, rate: 6 },
      { id: "i2", name: "门店物料", spec: "A-12", unit: "批", price: 1260, rate: 13 },
      { id: "i3", name: "上门安装", spec: "市区", unit: "次", price: 300, rate: 6 },
    ];
    sample.estimates = [
      { id: "e1", number: "EST-00001", customerId: "c1", date: today(), validUntil: addDays(7), status: "issued", notes: "含税报价，有效期 7 天。", rows: [{ name: "品牌顾问", spec: "按项目", qty: 1, unit: "项", price: 8000, rate: 6 }] },
      { id: "e2", number: "EST-00002", customerId: "c3", date: today(), validUntil: addDays(10), status: "draft", notes: "", rows: [{ name: "门店物料", spec: "A-12", qty: 2, unit: "批", price: 1260, rate: 13 }] },
    ];
    sample.invoices = [
      { id: "v1", number: "AR-00001", customerId: "c2", date: addDays(-20), dueDate: addDays(-5), status: "issued", notes: "月结。", rows: [{ name: "上门安装", spec: "市区", qty: 2, unit: "次", price: 300, rate: 6 }] },
      { id: "v2", number: "AR-00002", customerId: "c1", date: today(), dueDate: addDays(15), status: "issued", notes: "", rows: [{ name: "品牌顾问", spec: "按项目", qty: 1, unit: "项", price: 8000, rate: 6 }] },
      { id: "v3", number: "AR-00003", customerId: "c3", date: addDays(-3), dueDate: addDays(12), status: "draft", notes: "", rows: [{ name: "门店物料", spec: "A-12", qty: 1, unit: "批", price: 1260, rate: 13 }] },
    ];
    sample.payments = [{ id: "p1", invoiceId: "v2", date: today(), amount: 3000, method: "转账", note: "预付" }];
    sample.expenses = [
      { id: "x1", date: today(), vendor: "办公用品", category: "办公", amount: 268, note: "" },
      { id: "x2", date: addDays(-12), vendor: "地铁", category: "交通", amount: 120, note: "" },
    ];
    sample.reimbursements = [{ id: "r1", date: today(), claimant: "演示员工", category: "差旅", amount: 680, hasInvoice: true, status: "reviewed", note: "示例数据" }];
    sample.assets = [{ id: "a1", name: "演示办公电脑", category: "电子设备", cost: 9000, residualRate: 5, years: 3, startDate: addDays(-180), note: "示例数据" }];
    sample.bankTransactions = [{ id:"b1", date:today(), summary:"星海贸易转账", amount:3000, paymentId:"p1" }, { id:"b2", date:addDays(-2), summary:"客户回款待匹配", amount:600, paymentId:"" }];
    sample.collectionNotes = [
      { id: "n1", customerId: "c2", contactedOn: today(), promisedOn: today(), result: "promised", note: "下午再打" },
      { id: "n2", customerId: "c1", contactedOn: addDays(-2), result: "missed", note: "" }
    ];
    return sample;
  };

  const request = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("本地数据库操作失败"));
  });
  const txStore = (name, mode = "readonly") => idb.transaction(name, mode).objectStore(name);
  const openDatabase = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE_WORKSPACES)) database.createObjectStore(STORE_WORKSPACES, { keyPath: "id" });
      if (!database.objectStoreNames.contains(STORE_SETTINGS)) database.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
      if (!database.objectStoreNames.contains(STORE_RECOVERY)) database.createObjectStore(STORE_RECOVERY, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("无法打开本地数据库"));
  });
  const workspaceRecord = (data = db) => ({ id: workspaceId, name: data.company.name || "未命名公司", updatedAt: new Date().toISOString(), data });
  const setSaveState = (text, error = false) => {
    if (!saveState) return;
    saveState.textContent = text;
    saveState.classList.toggle("error", error);
  };
  const save = async (recordUndo = true) => {
    if (!idb || !workspaceId || !db) return;
    if (demoMode) { setSaveState("演示模式 · 改动不保存"); return; }
    setSaveState("保存中…");
    try {
      if (recordUndo) {
        const previous = await request(txStore(STORE_WORKSPACES).get(workspaceId));
        if (previous?.data) await setSetting(`undo:${workspaceId}`, previous.data);
      }
      await request(txStore(STORE_WORKSPACES, "readwrite").put(workspaceRecord()));
      setSaveState("已保存到本机 · " + (db.company.name || "未命名公司"));
    } catch (error) {
      setSaveState("本地保存失败，请立即导出备份", true);
    }
  };
  const setActiveWorkspace = async (id) => request(txStore(STORE_SETTINGS, "readwrite").put({ key: "activeWorkspace", value: id }));
  const getSetting = async (key) => request(txStore(STORE_SETTINGS).get(key));
  const setSetting = async (key, value) => request(txStore(STORE_SETTINGS, "readwrite").put({ key, value }));
  const backupKey = () => `lastBackup:${workspaceId}`;
  const recoveryPoint = async (reason) => {
    if (demoMode || !db || !workspaceId) return;
    const createdAt = new Date().toISOString();
    await request(txStore(STORE_RECOVERY, "readwrite").put({ id: `${workspaceId}:${createdAt}`, workspaceId, createdAt, reason, data: db }));
  };
  const latestRecovery = async () => {
    const rows = await request(txStore(STORE_RECOVERY).getAll());
    return rows.filter((item) => item.workspaceId === workspaceId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
  };
  const listWorkspaces = async () => request(txStore(STORE_WORKSPACES).getAll());
  const switchWorkspace = async (id) => {
    const record = await request(txStore(STORE_WORKSPACES).get(id));
    if (!record) return;
    workspaceId = id;
    db = normalizeData(record.data);
    if (new URLSearchParams(location.search).get("demo") === "1") {
      db = demo(); demoMode = true;
      document.getElementById("local-notice").innerHTML = `<b>演示模式</b> 当前是可操作的示例数据，任何改动都不会写入真实公司。<a href="./">退出演示</a>`;
    }
    await setActiveWorkspace(id);
    setSaveState(demoMode ? "演示模式 · 改动不保存" : "已保存到本机 · " + (db.company.name || "未命名公司"));
    location.hash = "#/dashboard";
    draw();
  };
  const createWorkspace = async (name, data = null) => {
    const id = uid("ws");
    const next = data ? normalizeData(data) : empty(name || "我的企业");
    next.company = { ...empty().company, ...(next.company || {}), name: name || next.company?.name || "我的企业" };
    workspaceId = id;
    db = next;
    await request(txStore(STORE_WORKSPACES, "readwrite").put(workspaceRecord(next)));
    await setActiveWorkspace(id);
    return id;
  };
  const initStorage = async () => {
    idb = await openDatabase();
    let records = await listWorkspaces();
    if (!records.length) {
      let legacy = null;
      try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null"); } catch { /* ignore */ }
      await createWorkspace(legacy?.company?.name || "我的企业", legacy?.company ? legacy : null);
      if (legacy) localStorage.removeItem(LEGACY_KEY);
      records = await listWorkspaces();
    }
    const active = await request(txStore(STORE_SETTINGS).get("activeWorkspace"));
    const record = records.find((item) => item.id === active?.value) || records[0];
    workspaceId = record.id;
    db = normalizeData(record.data);
    if (new URLSearchParams(location.search).get("demo") === "1") {
      db = demo(); demoMode = true;
      document.getElementById("local-notice").innerHTML = `<b>演示模式</b> 当前是可操作的示例数据，任何改动都不会写入真实公司。<a href="./">退出演示</a>`;
    }
    await setActiveWorkspace(workspaceId);
    setSaveState(demoMode ? "演示模式 · 改动不保存" : "已保存到本机 · " + (db.company.name || "未命名公司"));
  };
  const customer = (id) => db.customers.find((c) => c.id === id) || {};
  const nextNo = (prefix, list) => {
    const max = list.reduce((value, item) => Math.max(value, Number(String(item.number || "").match(/(\d+)$/)?.[1] || 0)), 0);
    return `${prefix}-${String(max + 1).padStart(5, "0")}`;
  };

  function compute(doc) {
    const items = (doc.rows || []).map((line) => {
      const qty = Number(line.qty) || 0;
      const price = Number(line.price) || 0;
      const rate = (Number(line.rate) || 0) / 100;
      return { ...line, ...F.vatFromExclusive(F.roundFen(qty * price), rate) };
    });
    const exclusive = F.roundFen(items.reduce((s, i) => s + i.exclusive, 0));
    const tax = F.roundFen(items.reduce((s, i) => s + i.tax, 0));
    return { items, exclusive, tax, inclusive: F.roundFen(exclusive + tax) };
  }
  const paidOf = (id) => F.roundFen(db.payments.filter((p) => p.invoiceId === id).reduce((s, p) => s + Number(p.amount || 0), 0));
  const isClosedDate = (date) => db.closedMonths.includes(String(date || "").slice(0, 7));
  const guardOpen = (date) => isClosedDate(date) ? (window.alert(`${String(date).slice(0, 7)} 已月结，请先在“月结与检查”中重开。`), false) : true;
  function openDrawer(title, fields, onSave) {
    const drawer = document.getElementById("edit-drawer");
    document.getElementById("drawer-title").textContent = title;
    document.getElementById("drawer-fields").innerHTML = fields.map((f) => `<div class="field"><label>${esc(f.label)}</label>${f.type === "select" ? `<select data-drawer="${f.key}">${f.options.map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(f.value) ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select>` : `<input data-drawer="${f.key}" type="${f.type || "text"}" value="${esc(f.value)}">`}</div>`).join("");
    drawer.hidden = false;
    const close = () => { drawer.hidden = true; };
    document.getElementById("drawer-close").onclick = close; document.getElementById("drawer-mask").onclick = close;
    document.getElementById("drawer-save").onclick = async () => { const values = Object.fromEntries([...document.querySelectorAll("[data-drawer]")].map((x) => [x.dataset.drawer, x.value])); if (await onSave(values) !== false) close(); };
  }
  function invoiceStatus(inv) {
    const total = compute(inv).inclusive;
    const paid = paidOf(inv.id);
    if (paid >= total && total > 0) return "paid";
    if (paid > 0) return "partial";
    if (inv.dueDate && inv.dueDate < today() && inv.status !== "draft") return "overdue";
    return inv.status || "draft";
  }
  const EST_LABEL = { draft: "草稿", issued: "已确认", expired: "已过期", converted: "已转应收单", void: "已作废" };
  const INV_LABEL = { draft: "草稿", issued: "已确认", overdue: "逾期", partial: "部分收款", paid: "已结清", void: "已作废" };
  const pill = (s, map) => `<span class="pill ${s}">${map[s] || s}</span>`;
  const route = () => { const h = (location.hash.replace(/^#\/?/, "") || "dashboard").split("/"); return { name: h[0], id: h[1] || "" }; };
  const go = (name, id) => { location.hash = id ? `#/${name}/${id}` : `#/${name}`; };
  const bankAllocated = (tx) => tx.paymentId ? Number(tx.amount || 0) : (tx.allocations || []).reduce((s, a) => s + Number(a.amount || 0), 0);
  const bankRemaining = (tx) => F.roundFen(Math.max(0, Number(tx.amount || 0) - bankAllocated(tx)));
  const invoiceBalance = (inv) => F.roundFen(Math.max(0, compute(inv).inclusive - paidOf(inv.id)));
  const isCollectable = (inv) => {
    const status = invoiceStatus(inv);
    return status !== "draft" && status !== "void" && status !== "paid" && invoiceBalance(inv) > 0;
  };
  const receivableRows = () => db.invoices.map((inv) => ({
    id: inv.id,
    number: inv.number,
    customerId: inv.customerId || "",
    customerName: customer(inv.customerId).name || "未选客户",
    dueDate: inv.dueDate || "",
    status: invoiceStatus(inv),
    total: compute(inv).inclusive,
    paid: paidOf(inv.id)
  }));
  function collectAnomalies() {
    const anomalies = [];
    db.invoices.forEach((inv) => {
      const total = compute(inv).inclusive;
      if (!customer(inv.customerId).id) anomalies.push({ where: `应收单 ${inv.number}`, issue: "未关联客户", fix: "编辑应收单并选择客户" });
      if (!(total > 0)) anomalies.push({ where: `应收单 ${inv.number}`, issue: "金额为 0", fix: "检查数量和单价" });
      if (paidOf(inv.id) > total) anomalies.push({ where: `应收单 ${inv.number}`, issue: "收款超额", fix: "检查或删除错误收款" });
    });
    db.payments.filter((p) => !db.invoices.some((inv) => inv.id === p.invoiceId)).forEach((p) => anomalies.push({ where: `收款 ${p.date}`, issue: "未关联应收单", fix: "重新导入或删除记录" }));
    db.reimbursements.filter((r) => !r.hasInvoice && r.amount > 0).forEach((r) => anomalies.push({ where: `报销 ${r.date} ${r.claimant}`, issue: "未标记票据", fix: "核实票据或补充附件" }));
    return anomalies;
  }
  const monthEndSnapshot = (month) => {
    const Bank = window.UtiloraBank;
    const Rec = window.UtiloraReceivables;
    const remainingOfTx = (tx) => Bank ? Bank.fromFen(Bank.bankRemainingFen(tx)) : bankRemaining(tx);
    const openReceivables = Rec
      ? Rec.openReceivables(receivableRows()).map((row) => ({
        id: row.id,
        number: row.number,
        customerName: row.customerName,
        dueDate: row.dueDate || "",
        remaining: Rec.remainingOf(row)
      }))
      : db.invoices.filter((inv) => isCollectable(inv)).map((inv) => ({
        id: inv.id,
        number: inv.number,
        customerName: customer(inv.customerId).name || "未选客户",
        dueDate: inv.dueDate || "",
        remaining: invoiceBalance(inv)
      }));
    return {
      month,
      closed: db.closedMonths.includes(month),
      bankImported: db.bankTransactions.length > 0,
      bankCount: db.bankTransactions.length,
      unmatchedBank: db.bankTransactions.filter((tx) => remainingOfTx(tx) > 0).map((tx) => ({
        id: tx.id, date: tx.date, summary: tx.summary, remaining: remainingOfTx(tx)
      })),
      openReceivables,
      anomalies: collectAnomalies(),
      expenses: [
        ...db.expenses.filter((item) => String(item.date || "").startsWith(month)).map((item) => ({
          id: item.id, date: item.date, kind: "费用", party: item.vendor || item.category || "", amount: Number(item.amount || 0)
        })),
        ...db.reimbursements.filter((item) => String(item.date || "").startsWith(month)).map((item) => ({
          id: item.id, date: item.date, kind: "报销", party: item.claimant || "", amount: Number(item.amount || 0)
        }))
      ]
    };
  };
  const monthEndPack = (month) => {
    const Close = window.UtiloraMonthEnd;
    const input = monthEndSnapshot(month);
    return Close ? { input, result: Close.buildMonthEnd(input) } : {
      input,
      result: { month, closed: input.closed, steps: [], done: 0, total: 1, percent: 0, openReceivableTotal: 0, unmatchedTotal: 0, expenseTotal: 0 }
    };
  };
  const workflowStrip = (labels = {}) => `<div class="workflow-strip" aria-label="快捷工作流">
      <button data-go="bank" type="button"${labels.bankWarn ? ' class="warn"' : ""}><b>1. 银行流水</b><span>${esc(labels.bank || "导入并匹配回款")}</span></button>
      <button data-go="invoices" type="button"${labels.arWarn ? ' class="warn"' : ""}><b>2. 应收/回款</b><span>${esc(labels.ar || "跟进本月待收")}</span></button>
      <button data-go="checks" type="button"${labels.checkWarn ? ' class="warn"' : ""}><b>3. 月结检查</b><span>${esc(labels.check || "处理异常并月结")}</span></button>
      <button data-go="reports" type="button"><b>4. 经营报表</b><span>${esc(labels.report || "查看经营结果")}</span></button>
    </div>`;

  function monthSeries() {
    return Array.from({ length: 8 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - 7 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const sales = db.invoices.filter((inv) => (inv.date || "").startsWith(key)).reduce((s, inv) => s + compute(inv).inclusive, 0);
      const expenses = db.expenses.filter((e) => (e.date || "").startsWith(key)).reduce((s, e) => s + Number(e.amount || 0), 0);
      return { key, label: `${d.getMonth() + 1}月`, sales, expenses };
    });
  }
  function svgChart(series) {
    const w = 640, h = 220, p = 28;
    const max = Math.max(1, ...series.flatMap((s) => [s.sales, s.expenses]));
    const x = (i) => p + (i * (w - 2 * p)) / Math.max(1, series.length - 1);
    const y = (v) => h - p - (v / max) * (h - 2 * p);
    const line = (key) => series.map((s, i) => `${x(i)},${y(s[key])}`).join(" ");
    const area = `${x(0)},${h - p} ${line("expenses")} ${x(series.length - 1)},${h - p}`;
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <polyline fill="none" stroke="#c7d2fe" stroke-width="1" points="${p},${y(max / 2)} ${w - p},${y(max / 2)}" />
      <polygon fill="#fb718522" points="${area}"></polygon>
      <polyline fill="none" stroke="#5851d8" stroke-width="3" points="${line("sales")}"></polyline>
      <polyline fill="none" stroke="#fb7185" stroke-width="3" points="${line("expenses")}"></polyline>
      ${series.map((s, i) => `<text x="${x(i)}" y="${h - 8}" text-anchor="middle" fill="#9ca3af" font-size="11">${s.label}</text>`).join("")}
    </svg>`;
  }

  function paper(doc, kind) {
    const c = customer(doc.customerId);
    const co = db.company;
    const sum = compute(doc);
    return `<div class="inv-paper">
      <div class="inv-banner">
        <div class="brand">${esc(co.name || "本地财务台")}</div>
        <div class="meta"><b>${esc(kind)}</b><div>${esc(doc.number)}</div><div>${esc(doc.date)}</div></div>
      </div>
      <div class="inv-body">
        <div class="inv-fromto">
          <div>卖方<br><b>${esc(co.name)}</b>${esc(co.address)}<br>${esc(co.phone)} ${esc(co.taxId)}</div>
          <div>买方<br><b>${esc(c.name || "—")}</b>${esc(c.address || "")}<br>${esc(c.phone || "")}</div>
        </div>
        <table class="inv-table">
          <thead><tr><th>项目</th><th>数量</th><th>单价</th><th>税率</th><th>金额</th></tr></thead>
          <tbody>${sum.items.map((it) => `<tr><td>${esc(it.name)}<div>${esc(it.spec)}</div></td><td>${esc(it.qty)}${esc(it.unit || "")}</td><td>${money(it.price)}</td><td>${it.rate}%</td><td>${money(it.inclusive)}</td></tr>`).join("")}</tbody>
        </table>
        <div class="inv-total">
          <p><span>不含税</span><span>${money(sum.exclusive)}</span></p>
          <p><span>税额</span><span>${money(sum.tax)}</span></p>
          <p class="pay"><span>应付</span><span>${money(sum.inclusive)}</span></p>
        </div>
        ${doc.notes ? `<p style="color:#6b7280;margin-top:18px">${esc(doc.notes)}</p>` : ""}
        ${co.payInfo ? `<p style="color:#6b7280">收款 ${esc(co.payInfo)}</p>` : ""}
      </div>
    </div>`;
  }

  function printDoc(doc, kind) {
    if (!doc) return;
    const c = customer(doc.customerId);
    const co = db.company;
    const sum = compute(doc);
    sheet.innerHTML = `<div class="quote-card theme-navy">${paper(doc, kind)}</div>`;
    sheet.querySelector(".inv-paper").style.width = "100%";
    window.print();
    void c; void co; void sum;
  }

  function renderDashboard() {
    const month = today().slice(0, 7);
    const Rec = window.UtiloraReceivables;
    const Queue = window.UtiloraBankQueue;
    const asOf = today();
    const unmatched = Queue ? Queue.pendingBankTransactions(db.bankTransactions) : db.bankTransactions.filter((tx) => bankRemaining(tx) > 0);
    const unmatchedAmount = unmatched.reduce((s, tx) => s + bankRemaining(tx), 0);
    const receivable = receivableRows();
    const dueToday = Rec ? Rec.collectToday(receivable, asOf) : db.invoices.filter((inv) => isCollectable(inv) && inv.dueDate && inv.dueDate <= asOf);
    const weekDue = Rec ? Rec.dueThisWeek(receivable, asOf) : db.invoices.filter((inv) => isCollectable(inv) && inv.dueDate && inv.dueDate >= asOf && inv.dueDate <= asOf);
    const dueTodayAmount = dueToday.reduce((s, inv) => s + (Rec ? Rec.remainingOf(inv) : invoiceBalance(inv)), 0);
    const weekAmount = weekDue.reduce((s, inv) => s + (Rec ? Rec.remainingOf(inv) : invoiceBalance(inv)), 0);
    const notes = Array.isArray(db.collectionNotes) ? db.collectionNotes : [];
    const promised = Rec && Rec.promisedOnDay ? Rec.promisedOnDay(notes, asOf) : notes.filter((item) => item.result === "promised" && item.promisedOn === asOf);
    const resultLabel = Rec && Rec.COLLECTION_RESULT_LABEL ? Rec.COLLECTION_RESULT_LABEL : { missed: "未接", promised: "已答应", paid: "已付" };
    const monthPendingInvoices = db.invoices.filter((inv) => isCollectable(inv) && String(inv.dueDate || today()) <= `${month}-31`);
    const monthPendingAmount = monthPendingInvoices.reduce((s, inv) => s + invoiceBalance(inv), 0);
    const recentPayments = db.payments.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);
    const anomalies = collectAnomalies();
    const { result: closePack } = monthEndPack(month);
    const closeSteps = closePack.steps;
    const closeDone = closePack.done;
    const closePct = closePack.percent;
    const todoCards = [
      { go: "bank", title: "待匹配流水", count: unmatched.length, detail: unmatched.length ? `${unmatched.length} 笔 · ${money(unmatchedAmount)}` : "没有待匹配流水", warn: unmatched.length > 0 },
      { go: "invoices", title: "今日该催", count: dueToday.length, detail: dueToday.length ? `${dueToday.length} 张 · ${money(dueTodayAmount)}` : "今天没有该催的应收", warn: dueToday.length > 0 },
      { go: "invoices", title: "本周到期", count: weekDue.length, detail: weekDue.length ? `${weekDue.length} 张 · ${money(weekAmount)}` : "本周没有到期应收", warn: weekDue.length > 0 },
      { go: "settings", title: "备份过期", count: 0, detail: "正在检查本地备份…", warn: false, backup: true }
    ];
    const urgent = (unmatched.length ? 1 : 0) + (dueToday.length ? 1 : 0) + (weekDue.length ? 1 : 0);
    const lead = urgent
      ? `今天有 ${urgent} 类待办需要处理`
      : "今天没有紧急待办，可以查看经营报表或继续录入。";
    const strip = workflowStrip({
      bank: db.bankTransactions.length ? (unmatched.length ? `${unmatched.length} 笔待匹配 · ${money(unmatchedAmount)}` : "已全部匹配") : "尚未导入流水",
      bankWarn: unmatched.length > 0 || !db.bankTransactions.length,
      ar: monthPendingAmount > 0 ? `待收 ${money(monthPendingAmount)}` : "本月无待收",
      arWarn: monthPendingAmount > 0,
      check: anomalies.length ? `${anomalies.length} 项异常待处理` : (db.closedMonths.includes(month) ? "本月已月结" : "去完成月结检查"),
      checkWarn: anomalies.length > 0 || !db.closedMonths.includes(month),
      report: "查看利润、现金流和账龄",
    });
    const dueRow = (inv) => {
      const name = inv.customerName || customer(inv.customerId).name;
      const due = inv.dueDate || "";
      const amt = Rec ? Rec.remainingOf(inv) : invoiceBalance(inv);
      return `<div class="mini-row" data-go="invoices/${inv.id}"><div><b>${esc(name)}</b><small>${esc(due)} · ${esc(inv.number)}</small></div><b>${money(amt)}</b></div>`;
    };

    const body = `
      <div class="today-work-lead">
        <h2>今天有什么财务工作需要处理？</h2>
        <p>${esc(lead)}</p>
      </div>
      ${strip}
      <div class="stat-row dash-today">
        ${todoCards.map((card) => `<div class="stat-card${card.warn ? " warn" : ""}" data-go="${card.go}" ${card.backup ? 'id="dashboard-backup-card"' : ""}><div><b>${card.backup ? "—" : (card.count || "0")}</b><span>${esc(card.title)}</span><small>${esc(card.detail)}</small></div></div>`).join("")}
      </div>
      <div class="split-lists">
        <div class="list-card">
          <h2 data-go="invoices">今日该催</h2>
          ${dueToday.length ? dueToday.slice(0, 8).map(dueRow).join("") : `<p class="empty">今天没有该催的应收</p>`}
        </div>
        <div class="list-card">
          <h2 data-go="invoices">本周到期</h2>
          ${weekDue.length ? weekDue.slice(0, 8).map(dueRow).join("") : `<p class="empty">本周没有到期应收</p>`}
        </div>
      </div>
      <div class="split-lists">
        <div class="list-card">
          <h2 data-go="customers">今日承诺还款</h2>
          ${promised.length ? promised.slice(0, 8).map((item) => `<div class="mini-row" data-go="customer/${item.customerId}"><div><b>${esc(customer(item.customerId).name)}</b><small>${esc(item.promisedOn)} · ${esc(resultLabel[item.result] || item.result)}</small></div><b>去跟进</b></div>`).join("") : `<p class="empty">今天没有承诺还款</p>`}
        </div>
        <div class="list-card">
          <h2 data-go="bank">待匹配流水</h2>
          ${unmatched.length ? unmatched.slice(0, 8).map((tx) => `<div class="mini-row" data-go="bank"><div><b>${esc(tx.summary || "银行流水")}</b><small>${esc(tx.date)} · 待匹配 ${money(bankRemaining(tx))}</small></div><b>${money(tx.amount)}</b></div>`).join("") : `<p class="empty">没有待匹配流水</p>`}
        </div>
      </div>
      <div class="split-lists">
        <div class="list-card">
          <h2 data-go="payments">最近收款</h2>
          ${recentPayments.map((p) => { const inv = db.invoices.find((i) => i.id === p.invoiceId) || {}; return `<div class="mini-row" data-go="payments"><div><b>${esc(customer(inv.customerId).name || "未关联客户")}</b><small>${esc(p.date)} · ${esc(inv.number)}</small></div><b>${money(p.amount)}</b></div>`; }).join("") || `<p class="empty">还没有收款记录</p>`}
        </div>
      </div>
      <div class="month-progress" aria-label="月结完成度"><i style="width:${closePct}%"></i></div>
      <p class="empty">月结完成度 ${closePct}% · ${closeDone}/${closeSteps.length} 项</p>`;

    if (!db.customers.length && !db.estimates.length && !db.invoices.length && !db.expenses.length) {
      view.innerHTML = `<div class="today-work-lead"><h2>今天有什么财务工作需要处理？</h2><p>还没有业务数据。先建立账套，或载入演示查看完整工作流。</p></div>
        <div class="stat-row dash-today">
          <div class="stat-card" data-go="bank"><div><b>0</b><span>待匹配流水</span><small>没有待匹配流水</small></div></div>
          <div class="stat-card" data-go="invoices"><div><b>0</b><span>今日该催</span><small>今天没有该催的应收</small></div></div>
          <div class="stat-card" data-go="invoices"><div><b>0</b><span>本周到期</span><small>本周没有到期应收</small></div></div>
          <div class="stat-card" data-go="settings" id="dashboard-backup-card"><div><b>—</b><span>备份过期</span><small>正在检查本地备份…</small></div></div>
        </div>
        <div class="welcome-panel"><span>3 分钟上手</span><h2>建立你的第一个本地财务账套</h2><div class="onboarding-steps"><b>1. 填写公司信息</b><b>2. 建立第一个客户</b><b>3. 录入应收或导入银行流水</b></div><p>如果只想看效果，可先载入明确标记的演示数据，不会上传。</p><div class="actions"><button data-start="settings">开始第 1 步</button><button class="secondary" data-start="customers">创建客户</button><button class="secondary" data-start="demo">先看演示</button></div><small>数据仅保存在当前浏览器，请定期导出备份。</small></div>`;
      view.querySelector('[data-start="settings"]').onclick = () => go("settings");
      view.querySelector('[data-start="customers"]').onclick = () => go("customers");
      view.querySelector('[data-start="demo"]').onclick = async () => { if (window.confirm("在当前空公司中载入演示数据？")) { db = demo(); await save(); draw(); } };
      view.querySelectorAll("[data-go]").forEach((el) => { el.onclick = () => { location.hash = `#/${el.dataset.go}`; }; });
      paintBackupCard();
      return;
    }

    view.innerHTML = body;
    view.querySelectorAll("[data-go]").forEach((el) => el.onclick = () => { location.hash = `#/${el.dataset.go}`; });
    paintBackupCard();
  }

  function paintBackupCard() {
    getSetting(backupKey()).then((item) => {
      const node = document.getElementById("dashboard-backup-card");
      if (!node) return;
      const status = window.UtiloraBackup ? window.UtiloraBackup.backupStatus(item?.value || null) : { stale: !item?.value, reminder: item?.value ? `最近备份：${new Date(item.value).toLocaleString("zh-CN")}` : "尚未导出备份 · 建议立即备份" };
      node.classList.toggle("warn", status.stale);
      const b = node.querySelector("b");
      const small = node.querySelector("small");
      if (b) b.textContent = status.stale ? "过期" : "正常";
      if (small) small.textContent = status.reminder;
      node.onclick = () => go("settings");
    });
  }

  function renderPeople(kind) {
    const isCust = kind === "customers";
    const list = db[kind];
    const Rec = window.UtiloraReceivables;
    const resultLabel = Rec && Rec.COLLECTION_RESULT_LABEL ? Rec.COLLECTION_RESULT_LABEL : { missed: "未接", promised: "已答应", paid: "已付" };
    const latest = (id) => Rec && Rec.latestNote ? Rec.latestNote(db.collectionNotes || [], id) : (db.collectionNotes || []).filter((item) => item.customerId === id)[0];
    view.innerHTML = `<div class="panel">${list.length ? `<table class="sheet-table"><thead><tr>${isCust ? "<th>客户</th><th>未收金额</th><th>最近催收</th><th>电话 / 邮箱</th><th></th>" : "<th>项目</th><th>单价</th><th>税率</th><th></th>"}</tr></thead><tbody>${list.map((row) => `<tr>
      <td><b>${esc(row.name)}</b><div style="color:#9ca3af;font-size:12px">${esc(isCust ? row.address : row.spec)}</div></td>
      <td>${isCust ? money(db.invoices.filter((inv) => inv.customerId === row.id).reduce((sum, inv) => sum + Math.max(0, compute(inv).inclusive - paidOf(inv.id)), 0)) : money(row.price)}</td>
      ${isCust ? `<td>${(() => { const note = latest(row.id); return note ? `${esc(resultLabel[note.result] || note.result)}<div style="color:#9ca3af;font-size:12px">${esc(note.contactedOn)}${note.promisedOn ? ` · 承诺 ${esc(note.promisedOn)}` : ""}</div>` : "尚无备忘"; })()}</td>` : ""}
      <td>${isCust ? `${esc(row.phone)}<div style="color:#9ca3af;font-size:12px">${esc(row.email)}</div>` : `${row.rate}%`}</td>
      <td class="actions">${isCust ? `<button class="secondary" data-customer-detail="${row.id}">往来</button>` : ""}<button class="secondary" data-edit="${row.id}">编辑</button><button class="secondary" data-del="${row.id}">删除</button></td>
    </tr>`).join("")}</tbody></table>` : `<p class="empty">${isCust ? "还没有客户" : "还没有项目"}</p>`}</div>
    <div class="panel" id="box" hidden style="margin-top:14px"><div class="form-grid" id="form"></div><div class="actions"><button id="save">保存</button><button class="secondary" id="cancel">取消</button></div></div>`;
    const fields = isCust ? [["name", "名称"], ["taxId", "税号"], ["phone", "电话"], ["email", "邮箱"], ["address", "地址"]] : [["name", "名称"], ["spec", "规格"], ["unit", "单位"], ["price", "单价"], ["rate", "税率%"]];
    let current = null;
    const open = (row) => {
      current = row;
      document.getElementById("form").innerHTML = fields.map(([k, l]) => `<div class="field"><label>${l}</label><input data-k="${k}" value="${esc(row[k] || "")}"></div>`).join("");
      document.getElementById("box").hidden = false;
    };
    primary.onclick = () => open(isCust ? { name: "" } : { name: "", unit: "项", rate: 13 });
    view.querySelectorAll("[data-customer-detail]").forEach((b) => b.onclick = () => go("customer", b.dataset.customerDetail));
    view.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => open(list.find((r) => r.id === b.dataset.edit)));
    view.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => { db[kind] = db[kind].filter((r) => r.id !== b.dataset.del); save(); draw(); });
    document.getElementById("cancel").onclick = () => { document.getElementById("box").hidden = true; };
    document.getElementById("save").onclick = () => {
      const payload = { ...(current || {}) };
      document.querySelectorAll("#form [data-k]").forEach((i) => { payload[i.dataset.k] = i.value.trim(); });
      if (!payload.name) return;
      payload.price = Number(payload.price || 0);
      payload.rate = Number(payload.rate || 0);
      if (!payload.id) payload.id = uid(isCust ? "c" : "i");
      const idx = db[kind].findIndex((r) => r.id === payload.id);
      if (idx >= 0) db[kind][idx] = payload; else db[kind].unshift(payload);
      save(); draw();
    };
  }

  function renderCustomerDetail(id) {
    const c = customer(id);
    if (!c.id) return go("customers");
    const invoices = db.invoices.filter((item) => item.customerId === id);
    const payments = db.payments.filter((p) => invoices.some((inv) => inv.id === p.invoiceId));
    const Rec = window.UtiloraReceivables;
    const rows = receivableRows().filter((row) => row.customerId === id);
    const progress = Rec ? Rec.collectionProgress(rows, today(), agingConfig()) : null;
    const billed = invoices.reduce((sum, inv) => sum + compute(inv).inclusive, 0);
    const received = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const notes = Rec && Rec.notesForCustomer ? Rec.notesForCustomer(db.collectionNotes || [], id) : (db.collectionNotes || []).filter((item) => item.customerId === id);
    const resultLabel = Rec && Rec.COLLECTION_RESULT_LABEL ? Rec.COLLECTION_RESULT_LABEL : { missed: "未接", promised: "已答应", paid: "已付" };
    view.innerHTML = `<div class="panel"><div class="preview-actions"><button class="secondary" id="customer-back">返回客户</button><button id="customer-new-invoice">新建应收单</button></div><h2>${esc(c.name)}</h2><p class="data-note">${esc(c.taxId || "未填税号")} · ${esc(c.phone || "未填电话")} · ${esc(c.email || "未填邮箱")}</p><div class="data-health"><span><b>未收</b>${money(progress ? progress.openTotal : Math.max(0, billed - received))}</span><span><b>逾期</b>${money(progress ? progress.overdueTotal : 0)}</span><span><b>回款进度</b>${progress ? `${progress.collectedRate}%` : money(received)}</span></div><p class="data-note">未收和逾期不含草稿、作废和已结清单据。</p></div>
      <div class="panel" style="margin-top:14px">
        <h2>催收备忘</h2>
        <div class="form-grid" id="collection-form">
          <div class="field"><label>联系日</label><input id="note-contacted" type="date" value="${esc(today())}"></div>
          <div class="field"><label>承诺还款日</label><input id="note-promised" type="date"></div>
          <div class="field"><label>结果</label><select id="note-result"><option value="missed">未接</option><option value="promised">已答应</option><option value="paid">已付</option></select></div>
          <div class="field"><label>备注</label><input id="note-text" maxlength="120" placeholder="可选"></div>
        </div>
        <div class="actions"><button id="note-save" type="button">记下这次催收</button></div>
        <p id="note-message" class="data-note"></p>
        <div class="table-wrap" style="margin-top:12px"><table class="sheet-table"><thead><tr><th>联系日</th><th>承诺还款日</th><th>结果</th><th>备注</th><th></th></tr></thead><tbody>${notes.length ? notes.map((item) => `<tr><td>${esc(item.contactedOn)}</td><td>${esc(item.promisedOn || "—")}</td><td>${esc(resultLabel[item.result] || item.result)}</td><td>${esc(item.note || "")}</td><td class="actions"><button class="secondary" data-del-note="${esc(item.id)}">删除</button></td></tr>`).join("") : `<tr><td colspan="5">还没有催收备忘</td></tr>`}</tbody></table></div>
      </div>
      <div class="panel" style="margin-top:14px"><h2>应收与收款明细</h2><table class="sheet-table"><thead><tr><th>日期</th><th>类型</th><th>单号</th><th>金额</th></tr></thead><tbody>${[...invoices.map((inv) => ({ date: inv.date, type: "应收", number: inv.number, amount: compute(inv).inclusive })), ...payments.map((p) => ({ date: p.date, type: "收款", number: db.invoices.find((inv) => inv.id === p.invoiceId)?.number || "", amount: -Number(p.amount) }))].sort((a,b) => String(b.date).localeCompare(String(a.date))).map((row) => `<tr><td>${esc(row.date)}</td><td>${row.type}</td><td>${esc(row.number)}</td><td>${money(row.amount)}</td></tr>`).join("") || `<tr><td colspan="4">暂无往来</td></tr>`}</tbody></table></div>`;
    primary.hidden = true;
    document.getElementById("customer-back").onclick = () => go("customers");
    document.getElementById("customer-new-invoice").onclick = () => go("invoice", "new");
    document.getElementById("note-save").onclick = () => {
      const payload = {
        id: uid("n"),
        customerId: id,
        contactedOn: document.getElementById("note-contacted").value,
        promisedOn: document.getElementById("note-promised").value,
        result: document.getElementById("note-result").value,
        note: document.getElementById("note-text").value
      };
      const checked = Rec && Rec.validateCollectionNote ? Rec.validateCollectionNote(payload) : { ok: Boolean(payload.contactedOn && payload.result), note: payload, error: "请填写联系日和结果" };
      const msg = document.getElementById("note-message");
      if (!checked.ok) {
        if (msg) msg.textContent = checked.error || "备忘未保存";
        return;
      }
      db.collectionNotes = [checked.note, ...(db.collectionNotes || [])];
      save();
      draw();
    };
    view.querySelectorAll("[data-del-note]").forEach((btn) => {
      btn.onclick = () => {
        db.collectionNotes = (db.collectionNotes || []).filter((item) => item.id !== btn.dataset.delNote);
        save();
        draw();
      };
    });
  }

  function convertEstimate(id) {
    const est = db.estimates.find((e) => e.id === id);
    if (!est || !guardOpen(today())) return;
    est.status = "converted";
    const inv = { id: uid("v"), number: nextNo("AR", db.invoices), customerId: est.customerId, estimateId: est.id, date: today(), dueDate: addDays(15), status: "draft", notes: est.notes, rows: est.rows.map((r) => ({ ...r })) };
    db.invoices.unshift(inv); save(); go("invoices", inv.id);
  }
  function quickPay(id) {
    const inv = db.invoices.find((i) => i.id === id);
    if (!inv) return;
    const left = Math.max(0, compute(inv).inclusive - paidOf(inv.id));
    const amount = Number(window.prompt("收到多少？", String(left)) || 0);
    if (!amount || amount < 0 || amount > left) return window.alert("收款金额必须大于 0，且不能超过剩余应收金额。");
    if (!guardOpen(today())) return;
    db.payments.unshift({ id: uid("p"), invoiceId: id, date: today(), amount, method: "转账", note: "" });
    postVoucher("payment", db.payments[0].id, today(), `收到 ${customer(inv.customerId).name || "客户"} 货款`, amount);
    save(); draw();
  }

  function renderDocs(kind) {
    const isEst = kind === "estimates";
    const list = db[kind];
    const map = isEst ? EST_LABEL : INV_LABEL;
    const selectedId = route().id || (list[0] && list[0].id) || "";
    const selected = list.find((d) => d.id === selectedId) || list[0];
    const statusOf = (d) => (isEst ? d.status : invoiceStatus(d));
    const Rec = window.UtiloraReceivables;
    const asOf = today();
    const rows = isEst || !Rec ? [] : receivableRows();
    const progress = Rec && !isEst ? Rec.collectionProgress(rows, asOf, agingConfig()) : null;
    const aging = Rec && !isEst ? Rec.summarizeAging(rows, asOf, agingConfig()) : null;
    const debts = Rec && !isEst ? Rec.customerDebts(rows, asOf, agingConfig()) : [];
    const labels = agingLabels();
    const short = agingLabels(true);
    const overview = !isEst && progress && aging ? `
      <div class="panel ar-overview">
        <h2>应收回款概览</h2>
        <p class="data-note">不含草稿和作废单据。账龄按到期日未收余额统计，与客户欠款合计一致。</p>
        <div class="stat-row">
          <div class="stat-card"><div><b>${money(progress.openTotal)}</b><span>未收总额</span><small>${progress.openCount} 张未结清</small></div></div>
          <div class="stat-card${progress.overdueTotal > 0 ? " warn" : ""}"><div><b>${money(progress.overdueTotal)}</b><span>逾期总额</span><small>${progress.overdueCount} 张逾期</small></div></div>
          <div class="stat-card"><div><b>${progress.collectedRate}%</b><span>回款进度</span><small>已收 ${money(progress.collectedTotal)} / 应收 ${money(progress.issuedTotal)}</small></div></div>
          <div class="stat-card"><div><b>${progress.settledCount}</b><span>已结清</span><small>不含草稿和作废</small></div></div>
        </div>
        <div class="table-wrap"><table class="sheet-table"><thead><tr><th>${labels.current}</th><th>${labels.d30}</th><th>${labels.d60}</th><th>${labels.d90}</th><th>${labels.over90}</th></tr></thead>
        <tbody><tr><td>${money(aging.current)}</td><td>${money(aging.d30)}</td><td>${money(aging.d60)}</td><td>${money(aging.d90)}</td><td>${money(aging.over90)}</td></tr></tbody></table></div>
      </div>
      <div class="panel" style="margin-top:14px">
        <h2>客户欠款</h2>
        <div class="table-wrap"><table class="sheet-table"><thead><tr><th>客户</th><th>未收</th><th>逾期</th><th>${short.current}</th><th>${short.d30}</th><th>${short.d60}</th><th>${short.d90}</th><th>${short.over90}</th></tr></thead>
        <tbody>${debts.map((row) => `<tr data-ar-customer="${esc(row.customerId)}" class="${row.overdueAmount > 0 ? "warn-row" : ""}"><td>${esc(row.customerName)}</td><td>${money(row.openAmount)}</td><td>${money(row.overdueAmount)}</td><td>${money(row.aging.current)}</td><td>${money(row.aging.d30)}</td><td>${money(row.aging.d60)}</td><td>${money(row.aging.d90)}</td><td>${money(row.aging.over90)}</td></tr>`).join("") || `<tr><td colspan="8">没有未收应收</td></tr>`}</tbody></table></div>
      </div>` : "";
    view.innerHTML = `${overview}<div class="split-app${overview ? " ar-docs" : ""}">
      <div class="doc-list">
        <div class="tools"><input id="q" placeholder="搜索客户或单号"></div>
        <div class="tabs">
          <button class="on" data-f="all">全部</button>
          <button data-f="draft">草稿</button>
          <button data-f="${isEst ? "issued" : "overdue"}">${isEst ? "已确认" : "逾期"}</button>
          ${isEst ? "" : `<button data-f="paid">已付清</button>`}
        </div>
        <div class="doc-scroll" id="rows"></div>
      </div>
      <div class="preview-pane" id="preview">${selected ? "" : `<p class="empty">${isEst ? "还没有报价" : "还没有应收单"}</p>`}</div>
    </div>`;
    let filter = "all";
    const paintList = () => {
      const q = (document.getElementById("q").value || "").toLowerCase();
      const filtered = list.filter((d) => {
        const st = statusOf(d);
        if (filter !== "all" && st !== filter) return false;
        const name = (customer(d.customerId).name || "") + d.number;
        return name.toLowerCase().includes(q);
      });
      document.getElementById("rows").innerHTML = filtered.map((d) => `<div class="doc-item${d.id === selectedId ? " on" : ""}" data-id="${d.id}">
        <div><b>${esc(customer(d.customerId).name || "未选客户")}</b>${pill(statusOf(d), map)}<small>${esc(d.number)} · ${esc(d.date)}${isEst || !d.dueDate ? "" : ` · 到期 ${esc(d.dueDate)}`}</small></div>
        <b>${money(isEst ? compute(d).inclusive : invoiceBalance(d))}</b>
      </div>`).join("") || `<p class="empty">没有匹配单据</p>`;
      document.querySelectorAll(".doc-item").forEach((el) => el.onclick = () => go(kind, el.dataset.id));
    };
    const paintPreview = () => {
      if (!selected) return;
      const Bank = window.UtiloraBank;
      let matchHint = "";
      if (!isEst && Bank && invoiceBalance(selected) > 0) {
        const unmatched = db.bankTransactions.filter((tx) => Bank.bankRemainingFen(tx) > 0);
        const suggestion = Bank.suggestMatches
          ? Bank.suggestMatches(unmatched, db.invoices.filter((inv) => isCollectable(inv)).map((inv) => ({
            id: inv.id,
            number: inv.number,
            balance: invoiceBalance(inv),
            customerName: customer(inv.customerId).name || "",
            dueDate: inv.dueDate || "",
            date: inv.date || ""
          }))).find((item) => item.invoiceId === selected.id)
          : Bank.suggestExactMatches(unmatched, [{ id: selected.id, number: selected.number, balance: invoiceBalance(selected) }])[0];
        if (suggestion) matchHint = `<p class="data-note match-hint"><b>可解释匹配建议</b> ${esc(suggestion.reason)}。<a href="#/bank">去银行流水确认</a></p>`;
      }
      document.getElementById("preview").innerHTML = `
        <div class="preview-actions">
          ${isEst ? `<button class="main" data-act="convert">转为应收单</button>` : `<button class="main" data-act="pay">记录收款</button>`}
          <button data-act="edit">编辑</button>
          <button data-act="issued">标为已确认</button>
          <button data-act="print">打印 / PDF</button>
        </div>
        ${matchHint}
        ${paper(selected, isEst ? "报价单" : "应收单")}`;
      document.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => {
        if (b.dataset.act === "print") printDoc(selected, isEst ? "报价单" : "应收单");
        if (b.dataset.act === "edit") go(isEst ? "estimate" : "invoice", selected.id);
        if (b.dataset.act === "convert") convertEstimate(selected.id);
        if (b.dataset.act === "pay") quickPay(selected.id);
        if (b.dataset.act === "issued" && guardOpen(selected.date)) { selected.status = "issued"; postVoucher("invoice",selected.id,selected.date,`确认应收 ${selected.number}`,compute(selected).inclusive); save(); draw(); }
      });
    };
    document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => {
      filter = b.dataset.f;
      document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
      paintList();
    });
    document.getElementById("q").oninput = paintList;
    view.querySelectorAll("[data-ar-customer]").forEach((row) => {
      row.onclick = () => { if (row.dataset.arCustomer) go("customer", row.dataset.arCustomer); };
    });
    primary.onclick = () => go(isEst ? "estimate" : "invoice", "new");
    paintList();
    paintPreview();
  }

  function renderPayments() {
    view.innerHTML = `<div class="panel">${db.payments.length ? `<table class="sheet-table"><thead><tr><th>日期</th><th>应收单</th><th>客户</th><th>金额</th><th>方式</th><th></th></tr></thead><tbody>${db.payments.map((p) => {
      const inv = db.invoices.find((i) => i.id === p.invoiceId) || {};
      return `<tr><td>${esc(p.date)}</td><td>${esc(inv.number)}</td><td>${esc(customer(inv.customerId).name)}</td><td>${money(p.amount)}</td><td>${esc(p.method)}</td><td class="actions"><button class="secondary" data-edit-payment="${p.id}">编辑</button><button class="secondary" data-delete-payment="${p.id}">删除</button></td></tr>`;
    }).join("")}</tbody></table>` : `<p class="empty">还没有收款</p>`}</div>`;
    primary.onclick = () => { if (db.invoices[0]) quickPay(db.invoices[0].id); };
    view.querySelectorAll("[data-edit-payment]").forEach((button) => button.onclick = async () => {
      const p = db.payments.find((item) => item.id === button.dataset.editPayment); if (!p || !guardOpen(p.date)) return;
      openDrawer("编辑收款", [{ key: "date", label: "收款日期", type: "date", value: p.date }, { key: "amount", label: "收款金额", value: p.amount }, { key: "method", label: "收款方式", value: p.method || "转账" }], async ({ date, amount, method }) => { amount = Number(amount); const inv = db.invoices.find((i) => i.id === p.invoiceId); const otherPaid = paidOf(p.invoiceId) - Number(p.amount || 0); if (!date || !guardOpen(date) || !(amount > 0) || !inv || amount + otherPaid > compute(inv).inclusive) { window.alert("请检查日期和金额，收款不能超过应收。"); return false; } Object.assign(p, { date, amount: F.roundFen(amount), method: method || "转账" }); await save(); draw(); });
    });
    view.querySelectorAll("[data-delete-payment]").forEach((button) => button.onclick = async () => {
      const current = db.payments.find((p) => p.id === button.dataset.deletePayment); if (!current || !guardOpen(current.date) || !window.confirm("删除这条收款记录？应收状态会自动重新计算。")) return;
      db.payments = db.payments.filter((p) => p.id !== button.dataset.deletePayment);
      await save(); draw();
    });
  }

  function renderExpenses() {
    view.innerHTML = `<div class="panel">
      <div class="form-grid">
        <div class="field"><label>日期</label><input id="x-date" type="date" value="${today()}"></div>
        <div class="field"><label>对象</label><input id="x-vendor" placeholder="供应商"></div>
        <div class="field"><label>类别</label><input id="x-cat" placeholder="办公 / 交通"></div>
        <div class="field"><label>金额</label><input id="x-amount" inputmode="decimal"></div>
      </div>
      <div class="actions"><button id="x-save" type="button">记一笔</button></div>
    </div>
    <div class="panel" style="margin-top:14px">${db.expenses.length ? `<table class="sheet-table"><thead><tr><th>日期</th><th>对象</th><th>类别</th><th>金额</th><th></th></tr></thead><tbody>${db.expenses.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.vendor)}</td><td>${esc(e.category)}</td><td>${money(e.amount)}</td><td class="actions"><button class="secondary" data-xedit="${e.id}">编辑</button><button class="secondary" data-xdel="${e.id}">删除</button></td></tr>`).join("")}</tbody></table>` : `<p class="empty">还没有费用</p>`}</div>`;
    primary.hidden = true;
    document.getElementById("x-save").onclick = () => {
      const amount = Number(document.getElementById("x-amount").value);
      const date = document.getElementById("x-date").value; if (!amount || !guardOpen(date)) return;
      db.expenses.unshift({ id: uid("x"), date, vendor: document.getElementById("x-vendor").value.trim(), category: document.getElementById("x-cat").value.trim(), amount, note: "" });
      postVoucher("expense",db.expenses[0].id,date,`费用 ${db.expenses[0].vendor}`,amount);
      save(); draw();
    };
    view.querySelectorAll("[data-xedit]").forEach((button) => button.onclick = () => { const e = db.expenses.find((x) => x.id === button.dataset.xedit); if (!e || !guardOpen(e.date)) return; openDrawer("编辑费用", [{key:"date",label:"日期",type:"date",value:e.date},{key:"vendor",label:"对象",value:e.vendor},{key:"category",label:"类别",value:e.category},{key:"amount",label:"金额",value:e.amount}], async (v) => { const amount=Number(v.amount); if(!v.date||!guardOpen(v.date)||!(amount>0)) return false; Object.assign(e,{...v,amount:F.roundFen(amount)}); await save(); draw(); }); });
    view.querySelectorAll("[data-xdel]").forEach((button) => button.onclick = async () => { const e = db.expenses.find((x) => x.id === button.dataset.xdel); if (!e || !guardOpen(e.date) || !window.confirm("删除这条费用？")) return; db.expenses = db.expenses.filter((x) => x.id !== e.id); await save(); draw(); });
  }

  function renderReimbursements() {
    const labels = { draft: "待审核", reviewed: "已审核", paid: "已报销" };
    view.innerHTML = `<div class="panel"><div class="form-grid">
      <div class="field"><label>日期</label><input id="r-date" type="date" value="${today()}"></div>
      <div class="field"><label>报销人</label><input id="r-person" placeholder="姓名"></div>
      <div class="field"><label>费用类别</label><input id="r-category" placeholder="差旅 / 办公 / 招待"></div>
      <div class="field"><label>金额</label><input id="r-amount" inputmode="decimal"></div>
      <div class="field"><label>票据</label><select id="r-invoice"><option value="yes">有票据</option><option value="no">无票据</option></select></div>
      <div class="field"><label>备注</label><input id="r-note"></div>
      <div class="field"><label>本地附件（图片/PDF，最大 2MB）</label><input id="r-attachment" type="file" accept="image/*,application/pdf"></div>
    </div><div class="actions"><button id="r-save">新增报销</button></div></div>
    <div class="panel" style="margin-top:14px">${db.reimbursements.length ? `<table class="sheet-table"><thead><tr><th>日期</th><th>报销人</th><th>类别</th><th>金额</th><th>票据 / 附件</th><th>状态</th><th></th></tr></thead><tbody>${db.reimbursements.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.claimant)}</td><td>${esc(r.category)}</td><td>${money(r.amount)}</td><td>${r.hasInvoice ? "有" : "无"}${r.attachment ? ` · <a href="${r.attachment.data}" download="${esc(r.attachment.name)}">查看附件</a>` : ""}</td><td>${labels[r.status] || r.status}</td><td class="actions"><button class="secondary" data-redit="${r.id}">编辑</button><button class="secondary" data-review="${r.id}">${r.status === "draft" ? "审核" : "标为已报销"}</button><button class="secondary" data-rdel="${r.id}">删除</button></td></tr>`).join("")}</tbody></table>` : `<p class="empty">还没有报销记录</p>`}</div>`;
    primary.hidden = true;
    document.getElementById("r-save").onclick = async () => {
      const amount = Number(document.getElementById("r-amount").value);
      const claimant = document.getElementById("r-person").value.trim();
      if (!amount || !claimant) return window.alert("请填写报销人和有效金额。");
      const date = document.getElementById("r-date").value; if (!guardOpen(date)) return;
      const file = document.getElementById("r-attachment").files?.[0]; if (file && file.size > 2 * 1024 * 1024) return window.alert("附件不能超过 2MB。");
      const attachment = file ? { name: file.name, type: file.type, size: file.size, data: await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); }) } : null;
      db.reimbursements.unshift({ id: uid("r"), date, claimant, category: document.getElementById("r-category").value.trim(), amount: F.roundFen(amount), hasInvoice: document.getElementById("r-invoice").value === "yes", status: "draft", note: document.getElementById("r-note").value.trim(), attachment });
      await save(); draw();
    };
    view.querySelectorAll("[data-redit]").forEach((button) => button.onclick = () => { const r=db.reimbursements.find((x)=>x.id===button.dataset.redit); if(!r||!guardOpen(r.date)) return; openDrawer("编辑报销",[{key:"date",label:"日期",type:"date",value:r.date},{key:"claimant",label:"报销人",value:r.claimant},{key:"category",label:"类别",value:r.category},{key:"amount",label:"金额",value:r.amount}],async(v)=>{const amount=Number(v.amount);if(!v.date||!v.claimant||!guardOpen(v.date)||!(amount>0))return false;Object.assign(r,{...v,amount:F.roundFen(amount)});await save();draw();}); });
    view.querySelectorAll("[data-review]").forEach((button) => button.onclick = async () => {
      const item = db.reimbursements.find((r) => r.id === button.dataset.review);
      if (!item || !guardOpen(item.date)) return;
      item.status = item.status === "draft" ? "reviewed" : "paid";
      if(item.status==="paid")postVoucher("reimbursement",item.id,item.date,`报销 ${item.claimant}`,item.amount);
      await save(); draw();
    });
    view.querySelectorAll("[data-rdel]").forEach((button) => button.onclick = async () => {
      const item = db.reimbursements.find((r) => r.id === button.dataset.rdel); if (!item || !guardOpen(item.date) || !window.confirm("删除这条报销记录？")) return;
      db.reimbursements = db.reimbursements.filter((r) => r.id !== button.dataset.rdel);
      await save(); draw();
    });
  }

  const assetDepreciation = (asset, asOf = today()) => {
    const cost = Number(asset.cost) || 0;
    const residual = F.roundFen(cost * (Number(asset.residualRate) || 0) / 100);
    const months = Math.max(1, Math.round((Number(asset.years) || 1) * 12));
    const monthly = F.roundFen((cost - residual) / months);
    const start = new Date(`${asset.startDate || asOf}T00:00:00`);
    const end = new Date(`${asOf}T00:00:00`);
    const elapsed = Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth());
    const usedMonths = Math.min(months, elapsed);
    const accumulated = F.roundFen(Math.min(cost - residual, monthly * usedMonths));
    return { residual, months, monthly, usedMonths, accumulated, net: F.roundFen(cost - accumulated) };
  };

  function renderAssets() {
    const presets = { "房屋、建筑物": 20, "机器及生产设备": 10, "器具、工具、家具": 5, "运输工具": 4, "电子设备": 3 };
    view.innerHTML = `<div class="panel"><p class="data-note"><b>直线法辅助计算：</b>默认年限采用企业所得税实施条例最低年限。会计折旧应结合预计使用寿命、残值和企业政策确定；本页不判断一次性扣除或加速折旧资格。</p><div class="form-grid">
      <div class="field"><label>资产名称</label><input id="a-name"></div>
      <div class="field"><label>类别</label><select id="a-category">${Object.entries(presets).map(([name, years]) => `<option value="${name}" data-years="${years}">${name}（${years} 年）</option>`).join("")}</select></div>
      <div class="field"><label>原值</label><input id="a-cost" inputmode="decimal"></div>
      <div class="field"><label>预计净残值率 %</label><input id="a-residual" value="5" inputmode="decimal"></div>
      <div class="field"><label>折旧年限</label><input id="a-years" value="20" inputmode="decimal"></div>
      <div class="field"><label>开始使用日期</label><input id="a-start" type="date" value="${today()}"></div>
    </div><div class="actions"><button id="a-save">新增固定资产</button></div></div>
      <div class="panel" style="margin-top:14px">${db.assets.length ? `<table class="sheet-table"><thead><tr><th>资产</th><th>原值</th><th>月折旧</th><th>累计折旧</th><th>账面净值</th><th></th></tr></thead><tbody>${db.assets.map((a) => { const d = assetDepreciation(a); return `<tr><td><b>${esc(a.name)}</b><small>${esc(a.category)} · ${a.years} 年</small></td><td>${money(a.cost)}</td><td>${money(d.monthly)}</td><td>${money(d.accumulated)}</td><td>${money(d.net)}</td><td class="actions"><button class="secondary" data-aedit="${a.id}">编辑</button><button class="secondary" data-adel="${a.id}">删除</button></td></tr>`; }).join("")}</tbody></table>` : `<p class="empty">还没有固定资产</p>`}</div>
    <div class="policy-source"><b>政策依据</b><a href="https://www.mof.gov.cn/zhengwuxinxi/zhengcefabu/2006zcfb/200805/t20080519_23104.htm" target="_blank" rel="noopener">财政部《企业会计准则第4号——固定资产》</a><a href="https://tianjin.chinatax.gov.cn/nsrxt/11200000000/0500/050004/20230626142020719.shtml" target="_blank" rel="noopener">国家税务总局：固定资产最低折旧年限</a></div>`;
    primary.hidden = true;
    document.getElementById("a-category").onchange = (event) => { document.getElementById("a-years").value = event.target.selectedOptions[0].dataset.years; };
    document.getElementById("a-save").onclick = async () => {
      const name = document.getElementById("a-name").value.trim();
      const cost = Number(document.getElementById("a-cost").value);
      const years = Number(document.getElementById("a-years").value);
      const residualRate = Number(document.getElementById("a-residual").value);
      if (!name || cost <= 0 || years <= 0 || residualRate < 0 || residualRate >= 100) return window.alert("请检查资产名称、原值、年限和残值率。");
      db.assets.unshift({ id: uid("a"), name, category: document.getElementById("a-category").value, cost: F.roundFen(cost), residualRate, years, startDate: document.getElementById("a-start").value, note: "" });
      await save(); draw();
    };
    view.querySelectorAll("[data-aedit]").forEach((button) => button.onclick = () => { const a=db.assets.find((x)=>x.id===button.dataset.aedit);if(!a)return;openDrawer("编辑固定资产",[{key:"name",label:"资产名称",value:a.name},{key:"cost",label:"原值",value:a.cost},{key:"years",label:"折旧年限",value:a.years},{key:"residualRate",label:"残值率 %",value:a.residualRate}],async(v)=>{const cost=Number(v.cost),years=Number(v.years),residualRate=Number(v.residualRate);if(!v.name||!(cost>0)||!(years>0)||residualRate<0||residualRate>=100)return false;Object.assign(a,{...v,cost:F.roundFen(cost),years,residualRate});await save();draw();}); });
    view.querySelectorAll("[data-adel]").forEach((button) => button.onclick = async () => {
      if (!window.confirm("删除这项固定资产？")) return;
      db.assets = db.assets.filter((a) => a.id !== button.dataset.adel);
      await save(); draw();
    });
  }

  function renderBank() {
    const Bank = window.UtiloraBank;
    if (!Bank) {
      view.innerHTML = `<div class="panel"><p class="data-note">银行流水模块未能加载，请刷新页面。</p></div>`;
      primary.hidden = true;
      return;
    }
    const remainingOf = (tx) => Bank.fromFen(Bank.bankRemainingFen(tx));
    const allocatedOf = (tx) => Bank.fromFen(Bank.bankAllocatedFen(tx));
    const unmatched = db.bankTransactions.filter((tx) => Bank.bankRemainingFen(tx) > 0);
    const collectables = db.invoices.filter((inv) => isCollectable(inv)).map((inv) => ({
      id: inv.id,
      number: inv.number,
      balance: invoiceBalance(inv),
      customerName: customer(inv.customerId).name || "",
      dueDate: inv.dueDate || "",
      date: inv.date || ""
    }));
    const suggestions = Bank.suggestMatches ? Bank.suggestMatches(unmatched, collectables) : Bank.suggestExactMatches(unmatched, collectables);
    const counts = { matched: 0, partial: 0, unmatched: 0 };
    db.bankTransactions.forEach((tx) => { counts[Bank.bankMatchState(tx)] += 1; });

    view.innerHTML = `
      <div class="panel">
        <h2>导入银行流水</h2>
        <p class="data-note">支持 .xlsx / CSV / TSV。导入前会预览新增、重复和无效行；同一文件再次导入不会重复入账。匹配建议会说明原因；金额唯一或摘要含客户名默认勾选，日期接近的中等把握需手动确认。</p>
        <input id="bank-file" type="file" accept=".xlsx,.csv,.tsv">
        <p id="bank-progress" class="bank-progress" aria-live="polite"></p>
        <p id="bank-msg" class="data-note"></p>
        <div id="bank-preview" class="bank-preview" hidden></div>
      </div>
      <div class="stat-row" style="margin-top:14px">
        <div class="stat-card"><div><b>${counts.unmatched}</b><span>未匹配</span></div></div>
        <div class="stat-card"><div><b>${counts.partial}</b><span>部分匹配</span></div></div>
        <div class="stat-card"><div><b>${counts.matched}</b><span>已匹配</span></div></div>
        <div class="stat-card"><div><b>${suggestions.length}</b><span>可自动建议</span></div></div>
      </div>
      ${suggestions.length ? `<div class="panel" style="margin-top:14px">
        <h2>匹配建议</h2>
        <p class="data-note">优先匹配金额唯一的应收；金额重复时，再用摘要中的客户名或接近的到期日。勾选后才会写入收款，可撤销，不会超额分配。</p>
        <div class="table-wrap"><table class="sheet-table"><thead><tr><th></th><th>流水</th><th>建议应收单</th><th>金额</th><th>把握</th><th>原因</th></tr></thead>
        <tbody>${suggestions.map((item, index) => {
          const tx = db.bankTransactions.find((row) => row.id === item.txId) || {};
          const checked = item.confidence === "high" ? " checked" : "";
          return `<tr><td><input type="checkbox" data-suggest="${index}" data-tx="${esc(item.txId)}" data-invoice="${esc(item.invoiceId)}" data-amount="${item.amount}"${checked}></td><td>${esc(tx.date)} · ${esc(tx.summary)}</td><td>${esc(item.invoiceNumber)}</td><td>${money(item.amount)}</td><td>${item.confidence === "high" ? "高" : "中"}</td><td>${esc(item.reason)}</td></tr>`;
        }).join("")}</tbody></table></div>
        <div class="actions"><button id="bank-apply-suggest" type="button">确认勾选匹配</button></div>
      </div>` : ""}
      <div class="panel" style="margin-top:14px">
        <h2>流水明细</h2>
        <div class="table-wrap"><table class="sheet-table"><thead><tr><th>日期</th><th>摘要</th><th>金额</th><th>已匹配</th><th>待匹配</th><th>状态</th><th></th></tr></thead>
        <tbody>${db.bankTransactions.map((tx) => {
          const state = Bank.bankMatchState(tx);
          const actions = [];
          if (Bank.bankRemainingFen(tx) > 0) actions.push(`<button class="secondary" data-bank-match="${tx.id}" type="button">人工匹配 / 拆分</button>`);
          if (allocatedOf(tx) > 0) actions.push(`<button class="secondary" data-bank-unmatch="${tx.id}" type="button">撤销匹配</button>`);
          return `<tr><td>${esc(tx.date)}</td><td>${esc(tx.summary)}</td><td>${money(tx.amount)}</td><td>${money(allocatedOf(tx))}</td><td>${money(remainingOf(tx))}</td><td><span class="pill ${state}">${Bank.MATCH_STATE_LABEL[state]}</span></td><td>${actions.join(" ")}</td></tr>`;
        }).join("") || `<tr><td colspan="7">尚未导入银行流水</td></tr>`}</tbody></table></div>
      </div>`;
    primary.hidden = true;

    const msg = document.getElementById("bank-msg");
    const progress = document.getElementById("bank-progress");
    const previewBox = document.getElementById("bank-preview");
    const setProgress = (text) => { if (progress) progress.textContent = text || ""; };
    const setMsg = (text) => { if (msg) msg.textContent = text || ""; };

    const applyMatches = async (tx, allocations, redraw = true) => {
      if (!tx || !guardOpen(tx.date)) return false;
      const invoices = db.invoices.filter((inv) => isCollectable(inv)).map((inv) => ({
        id: inv.id,
        balance: invoiceBalance(inv)
      }));
      const planned = Bank.planAllocations(remainingOf(tx), invoices, allocations);
      if (!planned.ok) {
        window.alert(planned.error);
        return false;
      }
      if (redraw) await recoveryPoint("银行流水匹配前");
      planned.allocations.forEach((allocation) => {
        const payment = { id: uid("p"), invoiceId: allocation.invoiceId, date: tx.date, amount: allocation.amount, method: "银行流水匹配", note: tx.summary };
        db.payments.push(payment);
        tx.allocations = [...(tx.allocations || []), { paymentId: payment.id, invoiceId: allocation.invoiceId, amount: allocation.amount }];
        postVoucher("payment", payment.id, payment.date, tx.summary, allocation.amount);
      });
      tx.paymentId = "";
      if (redraw) { await save(); draw(); }
      return true;
    };

    const applyMatch = (tx, invoiceId, amount, redraw = true) =>
      applyMatches(tx, [{ invoiceId, amount }], redraw);

    document.getElementById("bank-file").onchange = async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      setMsg("");
      setProgress("正在读取文件…");
      try {
        const rows = file.name.toLowerCase().endsWith(".xlsx")
          ? await window.UtiloraXlsx.readFirstSheet(file)
          : window.UtiloraCsv.parseCsv(await file.text());
        if (!rows.length) throw new Error("文件没有可读取的内容");
        setProgress(`正在解析 ${Math.max(0, rows.length - 1)} 行…`);
        const parsed = Bank.parseBankTable(rows[0], rows.slice(1));
        const preview = Bank.previewBankImport(parsed, db.bankTransactions);
        const tally = Bank.countPreview(preview);
        setProgress(`已解析 ${parsed.length} 行 · 新增 ${tally.new} · 重复 ${tally.duplicate} · 无效 ${tally.invalid}`);
        previewBox.hidden = false;
        previewBox.innerHTML = `
          <div class="table-wrap"><table class="sheet-table"><thead><tr><th>行</th><th>日期</th><th>摘要</th><th>金额</th><th>结果</th></tr></thead>
          <tbody>${preview.map((row) => `<tr><td>${row.row}</td><td>${esc(row.date || "—")}</td><td>${esc(row.summary || "—")}</td><td>${row.error ? "—" : money(row.amount)}</td><td><span class="pill ${row.status}">${row.status === "new" ? "新增" : row.status === "duplicate" ? "重复" : row.error || "无效"}</span></td></tr>`).join("") || `<tr><td colspan="5">没有可导入的数据行</td></tr>`}</tbody></table></div>
          <div class="actions"><button id="bank-commit" type="button" ${tally.new ? "" : "disabled"}>确认导入新增 ${tally.new} 笔</button></div>`;
        const commit = document.getElementById("bank-commit");
        if (commit) commit.onclick = async () => {
          const incoming = preview.filter((row) => row.status === "new");
          if (!incoming.length) return;
          setProgress("正在写入新增流水…");
          await recoveryPoint("导入银行流水前");
          incoming.forEach((row) => {
            db.bankTransactions.push({
              id: uid("b"),
              date: row.date,
              summary: row.summary,
              amount: row.amount,
              fingerprint: row.fingerprint,
              paymentId: "",
              allocations: []
            });
          });
          await save();
          draw();
        };
      } catch (error) {
        setProgress("");
        previewBox.hidden = true;
        setMsg(error.message || "导入失败");
      }
    };

    view.querySelectorAll("[data-bank-match]").forEach((button) => {
      button.onclick = () => {
        const tx = db.bankTransactions.find((item) => item.id === button.dataset.bankMatch);
        if (!tx) return;
        const options = collectables.filter((inv) => inv.balance > 0);
        if (!options.length) {
          window.alert("没有可匹配的应收单");
          return;
        }
        openDrawer(`拆分匹配流水（待匹配 ${money(remainingOf(tx))}）`, options.map((inv) => ({
          key: `allocation:${inv.id}`,
          label: `${inv.number} · ${inv.customerName || "未选客户"} · 应收余额 ${money(inv.balance)}`,
          type: "number",
          value: ""
        })), (values) => {
          const allocations = Object.entries(values)
            .filter(([key, value]) => key.startsWith("allocation:") && String(value).trim() !== "")
            .map(([key, amount]) => ({ invoiceId: key.slice("allocation:".length), amount }));
          return applyMatches(tx, allocations);
        });
      };
    });

    view.querySelectorAll("[data-bank-unmatch]").forEach((button) => {
      button.onclick = async () => {
        const tx = db.bankTransactions.find((item) => item.id === button.dataset.bankUnmatch);
        if (!tx || !guardOpen(tx.date) || !window.confirm("撤销该流水的匹配？相关收款会删除，应收余额会恢复。")) return;
        await recoveryPoint("撤销银行匹配前");
        const paymentIds = tx.paymentId ? [tx.paymentId] : (tx.allocations || []).map((item) => item.paymentId).filter(Boolean);
        db.payments = db.payments.filter((payment) => !paymentIds.includes(payment.id));
        db.vouchers = db.vouchers.filter((voucher) => !(voucher.sourceType === "payment" && paymentIds.includes(voucher.sourceId)));
        tx.paymentId = "";
        tx.allocations = [];
        await save();
        draw();
      };
    });

    const applySuggest = document.getElementById("bank-apply-suggest");
    if (applySuggest) applySuggest.onclick = async () => {
      const selected = [...view.querySelectorAll("[data-suggest]:checked")];
      if (!selected.length) return;
      setProgress(`正在匹配 0/${selected.length}`);
      await recoveryPoint("自动匹配银行流水前");
      let done = 0;
      for (const box of selected) {
        setProgress(`正在匹配 ${done + 1}/${selected.length}`);
        const tx = db.bankTransactions.find((item) => item.id === box.dataset.tx);
        if (await applyMatch(tx, box.dataset.invoice, Number(box.dataset.amount), false)) done += 1;
      }
      await save();
      draw();
    };
  }

  function renderPayroll() {
    const cityOptions=F.CITY_PRESETS.map((c)=>`<option value="${c.id}">${c.name}${c.verified?" · 已核验":" · 参考"}</option>`).join("");
    const calculate=(row)=>{const preset=F.CITY_PRESETS.find((c)=>c.id===row.city)||F.CITY_PRESETS[0],gross=Number(row.gross)||0,extra=Number(row.extra)||0,socialBase=F.clampBase(Number(row.socialBase)||gross,preset.socialMin,preset.socialMax),fundBase=F.clampBase(Number(row.fundBase)||gross,preset.fundMin,preset.fundMax),si=F.calcSocial({socialBase,fundBase,employee:preset.employee,employer:preset.employer}),tax=F.withholdingSchedule({incomes:[gross],specialMonthly:si.employee.total,extraMonthly:extra})[0]?.tax||0;return{si,tax,net:F.roundFen(gross-si.employee.total-extra-tax),cost:F.roundFen(gross+si.employer.total)};};
    view.innerHTML=`<div class="panel"><h2>工资表批量测算</h2><p class="data-note">可直接新增，或导入 .xlsx / CSV / TSV。表头建议：姓名、税前工资、专项附加、社保基数、公积金基数。</p><div class="form-grid"><div class="field"><label>城市参数</label><select id="pay-city">${cityOptions}</select></div><div class="field"><label>工资表文件</label><input id="pay-file" type="file" accept=".xlsx,.csv,.tsv"></div></div><div class="actions"><button id="pay-add">新增员工</button><button id="pay-export" class="secondary">导出测算结果</button></div><p id="pay-msg" class="data-note"></p></div><div class="panel" style="margin-top:14px"><table class="sheet-table"><thead><tr><th>姓名</th><th>税前</th><th>个人五险一金</th><th>个税</th><th>实发</th><th>企业成本</th><th></th></tr></thead><tbody>${db.payrollRows.map((row)=>{const c=calculate(row);return`<tr><td>${esc(row.name)}</td><td>${money(row.gross)}</td><td>${money(c.si.employee.total)}</td><td>${money(c.tax)}</td><td>${money(c.net)}</td><td>${money(c.cost)}</td><td><button class="secondary" data-pay-edit="${row.id}">编辑</button></td></tr>`;}).join("")||`<tr><td colspan="7">还没有工资数据</td></tr>`}</tbody></table></div>`;
    primary.hidden=true;
    const edit=(row={id:"",name:"",gross:"",extra:0,socialBase:"",fundBase:"",city:document.getElementById("pay-city").value})=>openDrawer(row.id?"编辑员工工资":"新增员工工资",[{key:"name",label:"姓名",value:row.name},{key:"gross",label:"税前工资",value:row.gross},{key:"extra",label:"专项附加扣除",value:row.extra},{key:"socialBase",label:"社保基数（留空按工资）",value:row.socialBase},{key:"fundBase",label:"公积金基数（留空按工资）",value:row.fundBase},{key:"city",label:"城市",type:"select",value:row.city,options:F.CITY_PRESETS.map((c)=>({value:c.id,label:c.name}))}],async(v)=>{if(!v.name||!(Number(v.gross)>0))return false;const payload={...row,...v,id:row.id||uid("pay"),gross:F.roundFen(Number(v.gross)),extra:F.roundFen(Number(v.extra)||0),socialBase:Number(v.socialBase)||0,fundBase:Number(v.fundBase)||0};const i=db.payrollRows.findIndex((x)=>x.id===payload.id);if(i>=0)db.payrollRows[i]=payload;else db.payrollRows.push(payload);await save();draw();});
    document.getElementById("pay-add").onclick=()=>edit();view.querySelectorAll("[data-pay-edit]").forEach((b)=>b.onclick=()=>edit(db.payrollRows.find((x)=>x.id===b.dataset.payEdit)));
    document.getElementById("pay-file").onchange=async(e)=>{const file=e.target.files?.[0];if(!file)return;try{const rows=file.name.toLowerCase().endsWith(".xlsx")?await window.UtiloraXlsx.readFirstSheet(file):window.UtiloraCsv.parseCsv(await file.text()),headers=rows[0].map(String),find=(names)=>headers.findIndex((h)=>names.some((n)=>h.includes(n))),ni=find(["姓名","员工"]),gi=find(["税前工资","应发","工资"]),ei=find(["专项附加"]),si=find(["社保基数"]),fi=find(["公积金基数"]);if(ni<0||gi<0)throw new Error("未找到姓名或税前工资列");const city=document.getElementById("pay-city").value;db.payrollRows.push(...rows.slice(1).filter((r)=>r[ni]&&Number(r[gi])>0).map((r)=>({id:uid("pay"),name:String(r[ni]),gross:Number(r[gi]),extra:ei>=0?Number(r[ei])||0:0,socialBase:si>=0?Number(r[si])||0:0,fundBase:fi>=0?Number(r[fi])||0:0,city})));await save();draw();}catch(error){document.getElementById("pay-msg").textContent=error.message||"导入失败";}};
    document.getElementById("pay-export").onclick=()=>downloadText(`utilora-工资测算-${today()}.csv`,csvText(["姓名","税前工资","个人五险一金","个税","实发工资","企业成本"],db.payrollRows.map((r)=>{const c=calculate(r);return[r.name,r.gross,c.si.employee.total,c.tax,c.net,c.cost];})));
  }

  const DEFAULT_ACCOUNTS = [{code:"1002",name:"银行存款",type:"资产"},{code:"1122",name:"应收账款",type:"资产"},{code:"1601",name:"固定资产",type:"资产"},{code:"2202",name:"应付账款",type:"负债"},{code:"5001",name:"主营业务收入",type:"收入"},{code:"5602",name:"管理费用",type:"费用"}];
  function ensureAccounts(){ if(!db.accounts.length) db.accounts=DEFAULT_ACCOUNTS.map((x)=>({id:uid("ac"),...x})); }
  function postVoucher(sourceType,sourceId,date,summary,amount){if(db.vouchers.some((v)=>v.sourceType===sourceType&&v.sourceId===sourceId))return;ensureAccounts();const account=(code)=>db.accounts.find((a)=>a.code===code)?.id;const pair=sourceType==="invoice"?[account("1122"),account("5001")]:sourceType==="payment"?[account("1002"),account("1122")]:[account("5602"),account("1002")];db.vouchers.unshift({id:uid("vo"),sourceType,sourceId,date,summary,debitId:pair[0],creditId:pair[1],amount:F.roundFen(Number(amount)||0),status:"自动生成"});}
  function renderBookkeeping(){
    ensureAccounts(); const opts=db.accounts.map((a)=>({value:a.id,label:`${a.code} ${a.name}`}));
    view.innerHTML=`<div class="panel"><h2>记账凭证</h2><div class="form-grid"><div class="field"><label>日期</label><input id="v-date" type="date" value="${today()}"></div><div class="field"><label>摘要</label><input id="v-summary"></div><div class="field"><label>借方科目</label><select id="v-debit">${opts.map((o)=>`<option value="${o.value}">${o.label}</option>`).join("")}</select></div><div class="field"><label>贷方科目</label><select id="v-credit">${opts.map((o)=>`<option value="${o.value}">${o.label}</option>`).join("")}</select></div><div class="field"><label>金额</label><input id="v-amount"></div><div class="field"><label>凭证模板</label><select id="v-template"><option value="">不使用</option>${db.voucherTemplates.map((t)=>`<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></div></div><div class="actions"><button id="v-save">保存凭证</button><button id="v-template-save" class="secondary">将当前科目存为模板</button></div></div><div class="panel" style="margin-top:14px"><h2>科目表</h2><table class="sheet-table"><tbody>${db.accounts.map((a)=>`<tr><td>${a.code}</td><td>${esc(a.name)}</td><td>${a.type}</td></tr>`).join("")}</tbody></table></div><div class="panel" style="margin-top:14px"><h2>凭证列表</h2><table class="sheet-table"><thead><tr><th>日期</th><th>摘要</th><th>借</th><th>贷</th><th>金额</th></tr></thead><tbody>${db.vouchers.map((v)=>`<tr><td>${v.date}</td><td>${esc(v.summary)}</td><td>${esc(db.accounts.find((a)=>a.id===v.debitId)?.name)}</td><td>${esc(db.accounts.find((a)=>a.id===v.creditId)?.name)}</td><td>${money(v.amount)}</td></tr>`).join("")||`<tr><td colspan="5">暂无凭证</td></tr>`}</tbody></table></div>`;
    primary.hidden=true; document.getElementById("v-template").onchange=(e)=>{const t=db.voucherTemplates.find((x)=>x.id===e.target.value);if(t){document.getElementById("v-debit").value=t.debitId;document.getElementById("v-credit").value=t.creditId;document.getElementById("v-summary").value=t.summary||"";}};
    document.getElementById("v-save").onclick=async()=>{const date=document.getElementById("v-date").value,amount=Number(document.getElementById("v-amount").value);if(!date||!guardOpen(date)||!(amount>0))return;db.vouchers.unshift({id:uid("vo"),date,summary:document.getElementById("v-summary").value.trim(),debitId:document.getElementById("v-debit").value,creditId:document.getElementById("v-credit").value,amount:F.roundFen(amount)});await save();draw();};
    document.getElementById("v-template-save").onclick=async()=>{const name=window.prompt("模板名称");if(!name)return;db.voucherTemplates.push({id:uid("vt"),name,summary:document.getElementById("v-summary").value.trim(),debitId:document.getElementById("v-debit").value,creditId:document.getElementById("v-credit").value});await save();draw();};
  }

  function renderReports() {
    const series = monthSeries();
    const Rec = window.UtiloraReceivables;
    const bounds = agingConfig();
    const labels = agingLabels();
    const aging = Rec ? Rec.summarizeAging(receivableRows(), today(), bounds) : { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
    const progress = Rec ? Rec.collectionProgress(receivableRows(), today(), bounds) : null;
    const receivable = progress ? progress.openTotal : db.invoices.reduce((s,inv)=>s+Math.max(0,compute(inv).inclusive-paidOf(inv.id)),0);
    const assetNet=db.assets.reduce((s,a)=>s+assetDepreciation(a).net,0), bankNet=db.bankTransactions.reduce((s,x)=>s+Number(x.amount||0),0);
    const sales=db.invoices.reduce((s,inv)=>s+compute(inv).inclusive,0), costs=db.expenses.reduce((s,x)=>s+Number(x.amount||0),0)+db.reimbursements.reduce((s,x)=>s+Number(x.amount||0),0), receipts=db.payments.reduce((s,x)=>s+Number(x.amount||0),0);
    view.innerHTML = `<div class="panel"><p class="data-note"><b>管理口径：</b>以当前工作台数据生成的简化报表，尚不是法定财务报表，需与会计凭证和总账复核。应收账龄不含草稿和作废。</p></div><div class="stat-row" style="margin-top:14px"><div class="stat-card"><div><b>${money(sales-costs)}</b><span>简化利润</span></div></div><div class="stat-card"><div><b>${money(receipts-costs)}</b><span>简化经营现金净额</span></div></div><div class="stat-card"><div><b>${money(receivable)}</b><span>应收余额</span></div></div></div><div class="chart-card"><h2>近 8 个月销售与费用</h2>${svgChart(series)}</div>
      <div class="panel" style="margin-top:14px"><h2>应收账龄</h2><table class="sheet-table"><thead><tr><th>${labels.current}</th><th>${labels.d30}</th><th>${labels.d60}</th><th>${labels.d90}</th><th>${labels.over90}</th></tr></thead><tbody><tr><td>${money(aging.current)}</td><td>${money(aging.d30)}</td><td>${money(aging.d60)}</td><td>${money(aging.d90)}</td><td>${money(aging.over90)}</td></tr></tbody></table></div>
      <div class="panel" style="margin-top:14px"><h2>简化资产负债表</h2><table class="sheet-table"><tbody><tr><td>银行流水净额</td><td>${money(bankNet)}</td></tr><tr><td>应收账款</td><td>${money(receivable)}</td></tr><tr><td>固定资产净值</td><td>${money(assetNet)}</td></tr><tr><th>已识别资产合计</th><th>${money(bankNet+receivable+assetNet)}</th></tr></tbody></table></div><div class="panel" style="margin-top:14px"><h2>简化利润表 / 现金流量表</h2><table class="sheet-table"><tbody><tr><td>营业收入</td><td>${money(sales)}</td></tr><tr><td>费用与报销</td><td>${money(costs)}</td></tr><tr><th>简化利润</th><th>${money(sales-costs)}</th></tr><tr><td>客户收款</td><td>${money(receipts)}</td></tr><tr><th>经营现金净额</th><th>${money(receipts-costs)}</th></tr></tbody></table></div><div class="panel" style="margin-top:14px"><table class="sheet-table"><thead><tr><th>月份</th><th>销售</th><th>费用</th><th>净额</th></tr></thead><tbody>${series.map((s) => `<tr><td>${s.label}</td><td>${money(s.sales)}</td><td>${money(s.expenses)}</td><td>${money(s.sales - s.expenses)}</td></tr>`).join("")}</tbody></table></div>`;
    primary.hidden = true;
  }

  function renderChecks() {
    const Close = window.UtiloraMonthEnd;
    let month = today().slice(0, 7);
    const paint = async () => {
      const { input, result } = monthEndPack(month);
      const ready = Close ? Close.canCloseMonth(result) : false;
      const latestClose = Close ? Close.latestCloseForMonth(db.monthEndCloses, month) : null;
      const backupItem = await getSetting(backupKey());
      const backupInfo = window.UtiloraBackup
        ? window.UtiloraBackup.backupStatus(backupItem?.value || null)
        : { stale: !backupItem?.value, reminder: backupItem?.value ? `最近备份：${new Date(backupItem.value).toLocaleString("zh-CN")}` : "尚未导出备份 · 建议立即备份", lastBackupAt: backupItem?.value || null };
      const backupWarning = window.UtiloraBackup?.closeBackupWarning?.(backupInfo) || (backupInfo.stale ? "关账前建议先导出备份。" : null);
      const closeNote = result.closed
        ? (latestClose?.forced ? `本月为强制关账。原因：${latestClose.reason}` : "本月已月结。可随时重开。")
        : (ready ? "检查项已完成，可以关账。关账后该月应收、收款、费用和报销不可改。" : "未完成项未处理完，不能直接关账。如需强制关账，请填写原因。");
      view.innerHTML = `
        <div class="panel">
          <h2>月结检查</h2>
          <p class="data-note">关账底稿给老板或会计：未收应收、未匹配流水、异常、当月费用。底稿数字与本页完成度、未收、未匹配、费用一致。月结后该月单据不可改。</p>
          ${backupWarning ? `<div class="backup-banner warn" data-go="settings" id="close-backup-reminder">${esc(backupWarning)} 可先到设置页导出完整备份。</div>` : ""}
          <div class="form-grid">
            <div class="field"><label>月份</label><input id="close-month" type="month" value="${month}"></div>
          </div>
          <div class="stat-row" style="margin-top:14px">
            <div class="stat-card${result.percent < 100 ? " warn" : ""}"><div><b>${result.percent}%</b><span>月结完成度</span><small>${result.done}/${result.total} 项已完成</small></div></div>
            <div class="stat-card${result.openReceivableTotal > 0 ? " warn" : ""}"><div><b>${money(result.openReceivableTotal)}</b><span>未收应收</span><small>${input.openReceivables.length} 张</small></div></div>
            <div class="stat-card${input.unmatchedBank.length ? " warn" : ""}"><div><b>${money(result.unmatchedTotal)}</b><span>未匹配流水</span><small>${input.unmatchedBank.length} 笔</small></div></div>
            <div class="stat-card${input.anomalies.length ? " warn" : ""}"><div><b>${input.anomalies.length}</b><span>异常</span><small>当月费用 ${money(result.expenseTotal)}</small></div></div>
          </div>
          <div class="month-progress" aria-label="月结完成度"><i style="width:${result.percent}%"></i></div>
          <div class="close-steps">${result.steps.map((step) => `<div class="close-step ${step.ok ? "ok" : "wait"}"><b>${esc(step.label)}</b><small>${esc(step.detail)}</small></div>`).join("")}</div>
          ${!result.closed && !ready ? `<div class="field"><label for="close-reason">强制关账原因</label><textarea id="close-reason" rows="2" placeholder="例如：老板要求先关账，未匹配流水下周补"></textarea></div>` : ""}
          <div class="actions">
            <button id="close-toggle" type="button"></button>
            <button id="close-export-xlsx" class="secondary" type="button">导出月结 Excel</button>
            <button id="close-export-csv" class="secondary" type="button">导出月结 CSV</button>
          </div>
          <p class="data-note">${esc(closeNote)} 已月结：${db.closedMonths.slice().sort().join("、") || "暂无"}</p>
        </div>
        <div class="panel" style="margin-top:14px"><h2>未收应收</h2><div class="table-wrap"><table class="sheet-table"><thead><tr><th>客户</th><th>单号</th><th>到期日</th><th>未收</th></tr></thead><tbody>${input.openReceivables.map((row) => `<tr><td>${esc(row.customerName)}</td><td>${esc(row.number)}</td><td>${esc(row.dueDate || "—")}</td><td>${money(row.remaining)}</td></tr>`).join("") || `<tr><td colspan="4">没有未收应收</td></tr>`}</tbody></table></div></div>
        <div class="panel" style="margin-top:14px"><h2>未匹配银行流水</h2><div class="table-wrap"><table class="sheet-table"><thead><tr><th>日期</th><th>摘要</th><th>待匹配</th></tr></thead><tbody>${input.unmatchedBank.map((row) => `<tr><td>${esc(row.date)}</td><td>${esc(row.summary)}</td><td>${money(row.remaining)}</td></tr>`).join("") || `<tr><td colspan="3">没有未匹配流水</td></tr>`}</tbody></table></div></div>
        <div class="panel" style="margin-top:14px"><h2>当月费用与报销</h2><div class="table-wrap"><table class="sheet-table"><thead><tr><th>日期</th><th>类型</th><th>对象</th><th>金额</th></tr></thead><tbody>${input.expenses.map((row) => `<tr><td>${esc(row.date)}</td><td>${esc(row.kind)}</td><td>${esc(row.party)}</td><td>${money(row.amount)}</td></tr>`).join("") || `<tr><td colspan="4">当月暂无费用或报销</td></tr>`}</tbody></table></div></div>
        <div class="panel" style="margin-top:14px"><h2>数据校验</h2><p class="data-note">检查时间：${new Date().toLocaleString("zh-CN")}</p><div class="validation-list">${input.anomalies.length ? input.anomalies.map((x) => `<div class="validation-item"><b>${esc(x.where)}：${esc(x.issue)}</b><small>修复建议：${esc(x.fix)}</small></div>`).join("") : `<p class="empty">未发现明显异常。请仍按原始凭证复核。</p>`}</div></div>`;
      primary.hidden = true;
      document.getElementById("close-toggle").textContent = result.closed ? "重开该月" : (ready ? "完成该月月结" : "强制关账");
      view.querySelectorAll("[data-go]").forEach((el) => { el.onclick = () => { location.hash = `#/${el.dataset.go}`; }; });
      document.getElementById("close-month").onchange = (event) => {
        month = event.target.value || month;
        paint();
      };
      document.getElementById("close-toggle").onclick = async () => {
        if (!month) return;
        if (db.closedMonths.includes(month)) {
          db.closedMonths = db.closedMonths.filter((value) => value !== month);
        } else {
          if (backupWarning && !window.confirm(`${backupWarning}\n\n仍要关账吗？`)) return;
          if (Close && Close.applyMonthClose) {
          const decision = Close.applyMonthClose({
            input,
            result,
            forced: !ready,
            reason: document.getElementById("close-reason")?.value || "",
            closedAt: new Date().toISOString()
          });
          if (!decision.ok) {
            window.alert(decision.error);
            return;
          }
          db.closedMonths.push(month);
          db.monthEndCloses = [...(db.monthEndCloses || []), decision.record];
          } else {
          if (!ready) {
            window.alert("未完成项未处理完，不能关账");
            return;
          }
          db.closedMonths.push(month);
          }
        }
        await save();
        draw();
      };
      const exportSheets = () => Close ? Close.monthEndExportSheets(input, result, latestClose) : [];
      document.getElementById("close-export-xlsx").onclick = () => {
        const sheets = exportSheets();
        if (!sheets.length) return;
        downloadText(`utilora-月结-${month}.xls`, excelWorkbook(sheets), "application/vnd.ms-excel");
      };
      document.getElementById("close-export-csv").onclick = () => {
        const sheets = exportSheets();
        if (!sheets.length) return;
        const text = sheets.map((sheet) => [sheet.name, csvText(sheet.rows[0], sheet.rows.slice(1))].join("\r\n")).join("\r\n\r\n");
        downloadText(`utilora-月结-${month}.csv`, text);
      };
    };
    paint();
  }

  const downloadJson = (filename, payload) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadText = (filename, text, type = "text/csv;charset=utf-8") => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csvText = (headers, rows) => "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const xmlEsc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]));
  const excelWorkbook = (sheets) => `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DDEBF7" ss:Pattern="Solid"/></Style><Style ss:ID="Money"><NumberFormat ss:Format="#,#0.00"/></Style></Styles>${sheets.map((sheet) => `<Worksheet ss:Name="${xmlEsc(sheet.name)}"><Table>${sheet.rows.map((row, index) => `<Row>${row.map((value) => `<Cell${index ? "" : ' ss:StyleID="Header"'}><Data ss:Type="${typeof value === "number" ? "Number" : "String"}">${xmlEsc(value)}</Data></Cell>`).join("")}</Row>`).join("")}</Table></Worksheet>`).join("")}</Workbook>`;

  const IMPORT_SCHEMAS = {
    customers: { label: "客户", fields: [{ key: "name", label: "客户名称", required: true, aliases: ["客户", "客户名称", "名称"] }, { key: "taxId", label: "税号", aliases: ["税号", "纳税人识别号"] }, { key: "phone", label: "电话", aliases: ["电话", "手机号"] }, { key: "email", label: "邮箱", aliases: ["邮箱", "email"] }, { key: "address", label: "地址", aliases: ["地址"] }] },
    invoices: { label: "应收单", fields: [{ key: "number", label: "单号", required: true, aliases: ["单号", "应收单号"] }, { key: "customer", label: "客户名称", required: true, aliases: ["客户", "客户名称"] }, { key: "date", label: "日期", required: true, aliases: ["日期", "业务日期"] }, { key: "dueDate", label: "到期日", aliases: ["到期日"] }, { key: "amount", label: "含税金额", required: true, aliases: ["含税金额", "金额", "应收金额"] }, { key: "rate", label: "税率%", aliases: ["税率", "税率%"] }] },
    payments: { label: "收款", fields: [{ key: "invoiceNumber", label: "应收单号", required: true, aliases: ["应收单号", "单号"] }, { key: "date", label: "收款日期", required: true, aliases: ["收款日期", "日期"] }, { key: "amount", label: "收款金额", required: true, aliases: ["收款金额", "金额"] }, { key: "method", label: "收款方式", aliases: ["收款方式", "方式"] }, { key: "note", label: "备注", aliases: ["备注"] }] },
  };
  let importState = null;
  const normalizeImportedDate = (value) => {
    const text = String(value || "").trim();
    if (/^\d{5}(?:\.\d+)?$/.test(text)) {
      const date = new Date(Date.UTC(1899, 11, 30) + Number(text) * 86400000);
      return date.toISOString().slice(0, 10);
    }
    return text;
  };

  function validateImport(kind, headers, rows, mapping) {
    const schema = IMPORT_SCHEMAS[kind];
    const checked = rows.map((row, index) => {
      const values = Object.fromEntries(schema.fields.map((field) => [field.key, mapping[field.key] === "" ? "" : String(row[Number(mapping[field.key])] ?? "").trim()]));
      for (const key of ["date", "dueDate"]) if (key in values) values[key] = normalizeImportedDate(values[key]);
      const errors = schema.fields.filter((field) => field.required && !values[field.key]).map((field) => `${field.label}为空`);
      if (["invoices", "payments"].includes(kind) && values.amount && (!(Number(values.amount.replace(/,/g, "")) > 0))) errors.push("金额无效");
      if (kind === "invoices" && values.customer && !db.customers.some((c) => c.name === values.customer)) errors.push("客户不存在");
      if (kind === "invoices" && values.number && db.invoices.some((inv) => inv.number === values.number)) errors.push("应收单号已存在");
      if (kind === "payments" && values.invoiceNumber && !db.invoices.some((inv) => inv.number === values.invoiceNumber)) errors.push("应收单不存在");
      return { line: index + 2, values, errors };
    });
    const seen = new Set();
    if (kind === "customers") checked.forEach((row) => { if (db.customers.some((c) => c.name === row.values.name) || seen.has(row.values.name)) row.errors.push("客户名称重复"); seen.add(row.values.name); });
    if (kind === "invoices") checked.forEach((row) => { if (seen.has(row.values.number)) row.errors.push("文件内单号重复"); seen.add(row.values.number); });
    if (kind === "payments") {
      const imported = {};
      checked.forEach((row) => {
        const inv = db.invoices.find((item) => item.number === row.values.invoiceNumber);
        if (!inv || row.errors.length) return;
        imported[inv.id] = F.roundFen((imported[inv.id] || 0) + Number(row.values.amount.replace(/,/g, "")));
        const left = F.roundFen(Math.max(0, compute(inv).inclusive - paidOf(inv.id)));
        if (imported[inv.id] > left) row.errors.push("累计收款超过剩余应收");
      });
    }
    return checked;
  }

  async function commitImport(kind, checked) {
    if (checked.some(({ values }) => values.date && isClosedDate(values.date))) return window.alert("导入数据包含已月结月份，请先重开该月。");
    await recoveryPoint(`批量导入${IMPORT_SCHEMAS[kind].label}前`);
    if (kind === "customers") checked.forEach(({ values }) => db.customers.push({ id: uid("c"), ...values }));
    if (kind === "invoices") checked.forEach(({ values }) => {
      const amount = Number(values.amount.replace(/,/g, ""));
      const rate = Number(String(values.rate || "0").replace(/%/g, "")) || 0;
      const net = F.vatFromInclusive(amount, rate / 100).exclusive;
      db.invoices.push({ id: uid("v"), number: values.number, customerId: db.customers.find((c) => c.name === values.customer).id, date: values.date, dueDate: values.dueDate || values.date, status: "issued", notes: "批量导入", rows: [{ name: "批量导入应收", spec: "", qty: 1, unit: "项", price: net, rate }] });
    });
    if (kind === "payments") checked.forEach(({ values }) => db.payments.push({ id: uid("p"), invoiceId: db.invoices.find((inv) => inv.number === values.invoiceNumber).id, date: values.date, amount: F.roundFen(Number(values.amount.replace(/,/g, ""))), method: values.method || "转账", note: values.note || "批量导入" }));
    await save();
  }

  function exportOperations() {
    const agingRows = [["客户", "应收单号", "到期日", "状态", "应收金额", "已收金额", "未收金额"]];
    db.invoices.forEach((inv) => { const total = compute(inv).inclusive; const paid = paidOf(inv.id); agingRows.push([customer(inv.customerId).name || "", inv.number, inv.dueDate || "", INV_LABEL[invoiceStatus(inv)] || invoiceStatus(inv), total, paid, F.roundFen(Math.max(0, total - paid))]); });
    const transactionRows = [["客户", "类型", "日期", "单号", "金额", "备注"]];
    db.invoices.forEach((inv) => transactionRows.push([customer(inv.customerId).name || "", "应收", inv.date, inv.number, compute(inv).inclusive, inv.notes || ""]));
    db.payments.forEach((p) => { const inv = db.invoices.find((i) => i.id === p.invoiceId) || {}; transactionRows.push([customer(inv.customerId).name || "", "收款", p.date, inv.number || "", Number(p.amount) || 0, p.note || ""]); });
    const xml = excelWorkbook([{ name: "应收账龄", rows: agingRows }, { name: "客户往来", rows: transactionRows }]);
    downloadText(`utilora-财务明细-${today()}.xml`, xml, "application/vnd.ms-excel;charset=utf-8");
  }
  function exportAgingCsv() {
    const rows = db.invoices.map((inv) => { const total = compute(inv).inclusive; const paid = paidOf(inv.id); return [customer(inv.customerId).name || "", inv.number, inv.dueDate || "", INV_LABEL[invoiceStatus(inv)] || invoiceStatus(inv), total.toFixed(2), paid.toFixed(2), Math.max(0, total - paid).toFixed(2)]; });
    downloadText(`utilora-应收账龄-${today()}.csv`, csvText(["客户", "应收单号", "到期日", "状态", "应收金额", "已收金额", "未收金额"], rows));
  }

  function renderIntent() {
    primary.hidden = true;
    view.innerHTML = `<div class="panel"><h2>购买意向</h2><p class="data-note">正式收费前留下邮箱和用途，上线会提前通知。当前不接入支付，不会扣费。</p>
      <form data-purchase-intent>
        <div class="intent-grid">
          <label>邮箱<input name="email" type="email" required maxlength="254" autocomplete="email" placeholder="you@company.com"></label>
          <label>主要用途
            <select name="use_case" required>
              <option value="">请选择</option>
              <option value="银行流水">银行流水</option>
              <option value="应收回款">应收回款</option>
              <option value="月结检查">月结检查</option>
              <option value="经营报表">经营报表</option>
              <option value="其他">其他</option>
            </select>
          </label>
          <label>公司规模
            <select name="company_size" required>
              <option value="">请选择</option>
              <option value="1-10">1–10 人</option>
              <option value="11-50">11–50 人</option>
              <option value="51-200">51–200 人</option>
              <option value="200+">200 人以上</option>
            </select>
          </label>
        </div>
        <input type="hidden" name="intended_plan" value="pro">
        <div hidden aria-hidden="true"><label>网站<input name="website" tabindex="-1" autocomplete="off"></label></div>
        <div data-turnstile-slot class="field" hidden></div>
        <div class="intent-actions">
          <button type="submit">我愿意购买</button>
          <button type="submit" class="secondary">正式版上线通知我</button>
        </div>
        <p class="intent-message" data-intent-message role="status" aria-live="polite"></p>
      </form>
    </div>`;
    window.UtiloraPurchaseIntent?.bind?.();
  }

  async function renderSettings() {
    const c = db.company;
    primary.hidden = true;
    const workspaces = await listWorkspaces();
    const record = workspaces.find((item) => item.id === workspaceId);
    const backup = await getSetting(backupKey());
    const undo = await getSetting(`undo:${workspaceId}`);
    const storage = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    const storageLabel = storage?.usage != null ? `${(storage.usage / 1024 / 1024).toFixed(1)} MB / ${(storage.quota / 1024 / 1024).toFixed(0)} MB` : "浏览器未提供";
    const recovery = await latestRecovery();
    const backupInfo = window.UtiloraBackup ? window.UtiloraBackup.backupStatus(backup?.value || null) : { stale: true, label: "尚未导出备份", reminder: "尚未导出备份 · 建议立即备份" };
    view.innerHTML = `<div class="panel settings-section"><h2>当前公司</h2><p class="data-note">每家公司在 IndexedDB 中独立保存。数据不上传，也不会跟随 Utilora 账号或设备同步。</p><div class="actions"><button class="secondary" type="button" data-install-app>安装到电脑，以后从桌面双击打开</button></div>
      <div class="data-health"><span><b>数据位置</b>当前浏览器</span><span><b>当前公司</b>${esc(db.company.name)}</span><span><b>本地占用 / 配额</b>${esc(storageLabel)}</span><span class="${backupInfo.stale ? "warn" : ""}"><b>最近备份</b>${esc(backupInfo.reminder)}</span></div>
      <div class="workspace-row"><select id="workspace-select">${workspaces.map((item) => `<option value="${item.id}"${item.id === workspaceId ? " selected" : ""}>${esc(item.name)}</option>`).join("")}</select><button id="workspace-new" type="button">新建公司</button></div>
    </div>
    <div class="panel settings-section"><h2>企业信息</h2><div class="form-grid">
      <div class="field"><label>公司名称</label><input id="co-name" value="${esc(c.name)}"></div>
      <div class="field"><label>税号</label><input id="co-tax" value="${esc(c.taxId)}"></div>
      <div class="field"><label>地址</label><input id="co-addr" value="${esc(c.address)}"></div>
      <div class="field"><label>电话</label><input id="co-phone" value="${esc(c.phone)}"></div>
      <div class="field"><label>邮箱</label><input id="co-email" value="${esc(c.email)}"></div>
      <div class="field"><label>收款账户</label><input id="co-pay" value="${esc(c.payInfo)}"></div>
    </div><div class="actions"><button id="co-save" type="button">保存企业信息</button></div><p id="co-msg" class="empty"></p></div>
    <div class="panel settings-section"><h2>数据与备份</h2>
      <p class="data-note"><b>重要：</b>清理浏览器数据、使用无痕模式或更换设备都可能导致本地数据丢失。完整备份包含客户、应收、收款、银行流水、费用和科目。演示模式不会写入真实公司。</p>
      <div class="actions">
        <button id="data-export" type="button">导出完整备份</button>
        <button id="data-import" class="secondary" type="button">导入备份</button>
        <button id="data-recover" class="secondary" type="button"${recovery ? "" : " disabled"}>恢复最近自动恢复点</button>
        <button id="data-undo" class="secondary" type="button"${undo?.value ? "" : " disabled"}>撤销上一次修改</button>
        <button id="data-demo" class="secondary" type="button">载入演示数据</button>
        <button id="data-clear" class="danger" type="button">清空当前公司数据</button>
      </div>
      <input id="data-file" type="file" accept="application/json,.json" hidden>
      <div id="backup-preview" class="backup-preview" hidden></div>
      <p id="data-msg" class="empty"></p>
      <p class="data-note">${recovery ? `最近自动恢复点：${new Date(recovery.createdAt).toLocaleString("zh-CN")}（${esc(recovery.reason)}）` : "当前公司还没有自动恢复点。导入、载入演示或清空前会自动创建。"}</p>
    </div>
    <div class="panel settings-section"><h2>批量导入与业务导出</h2><p class="data-note">支持 .xlsx、CSV 和 TSV，读取第一个工作表。先映射字段、预览错误，确认后才写入；导入前自动创建恢复点。</p>
      <div class="form-grid"><div class="field"><label>数据类型</label><select id="batch-kind">${Object.entries(IMPORT_SCHEMAS).map(([key, item]) => `<option value="${key}">${item.label}</option>`).join("")}</select></div><div class="field"><label>Excel / CSV 文件</label><input id="batch-file" type="file" accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values"></div></div>
      <div id="batch-mapping" class="mapping-grid"></div><div id="batch-preview" class="table-wrap"></div>
      <div class="actions"><button id="batch-check" class="secondary" disabled>预览并检查</button><button id="batch-commit" disabled>确认导入</button><button id="business-export" class="secondary">导出客户往来与应收账龄（Excel）</button><button id="aging-csv" class="secondary">导出应收账龄 CSV</button></div>
      <p id="batch-msg" class="data-note"></p>
    </div>`;
    document.getElementById("workspace-select").onchange = (event) => switchWorkspace(event.target.value);
    document.getElementById("workspace-new").onclick = async () => {
      const name = window.prompt("新公司名称", "我的企业");
      if (!name?.trim()) return;
      await createWorkspace(name.trim());
      draw();
    };
    document.getElementById("co-save").onclick = async () => {
      db.company = { ...c, name: document.getElementById("co-name").value.trim(), taxId: document.getElementById("co-tax").value.trim(), address: document.getElementById("co-addr").value.trim(), phone: document.getElementById("co-phone").value.trim(), email: document.getElementById("co-email").value.trim(), payInfo: document.getElementById("co-pay").value.trim() };
      await save();
      document.getElementById("co-msg").textContent = "企业信息已保存到当前浏览器";
    };
    const renderMapping = () => {
      if (!importState) return;
      const schema = IMPORT_SCHEMAS[importState.kind];
      document.getElementById("batch-mapping").innerHTML = schema.fields.map((field) => {
        const auto = importState.headers.findIndex((header) => field.aliases.some((alias) => header.trim().toLowerCase() === alias.toLowerCase()));
        return `<div class="field"><label>${field.label}${field.required ? " *" : ""}</label><select data-map="${field.key}"><option value="">不导入</option>${importState.headers.map((header, index) => `<option value="${index}"${index === auto ? " selected" : ""}>${esc(header)}</option>`).join("")}</select></div>`;
      }).join("");
      document.getElementById("batch-check").disabled = false;
      document.getElementById("batch-commit").disabled = true;
      document.getElementById("batch-preview").innerHTML = "";
    };
    document.getElementById("batch-kind").onchange = (event) => { if (importState) { importState.kind = event.target.value; renderMapping(); } };
    document.getElementById("batch-file").onchange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      let rows;
      try { rows = file.name.toLowerCase().endsWith(".xlsx") ? await window.UtiloraXlsx.readFirstSheet(file) : window.UtiloraCsv.parseCsv(await file.text()); }
      catch (error) { document.getElementById("batch-msg").textContent = error.message || "无法读取文件"; return; }
      if (rows.length < 2) return document.getElementById("batch-msg").textContent = "文件至少需要表头和一行数据。";
      importState = { kind: document.getElementById("batch-kind").value, headers: rows[0], rows: rows.slice(1), checked: null };
      renderMapping();
      document.getElementById("batch-msg").textContent = `已读取 ${importState.rows.length} 行，请确认字段映射后预览。`;
    };
    document.getElementById("batch-check").onclick = () => {
      if (!importState) return;
      const mapping = Object.fromEntries([...document.querySelectorAll("[data-map]")].map((select) => [select.dataset.map, select.value]));
      const requiredMissing = IMPORT_SCHEMAS[importState.kind].fields.filter((field) => field.required && mapping[field.key] === "");
      if (requiredMissing.length) return window.alert(`请选择必填字段：${requiredMissing.map((field) => field.label).join("、")}`);
      importState.checked = validateImport(importState.kind, importState.headers, importState.rows, mapping);
      const errorCount = importState.checked.filter((row) => row.errors.length).length;
      const fields = IMPORT_SCHEMAS[importState.kind].fields;
      document.getElementById("batch-preview").innerHTML = `<table class="sheet-table"><thead><tr><th>行</th>${fields.map((field) => `<th>${field.label}</th>`).join("")}<th>检查</th></tr></thead><tbody>${importState.checked.slice(0, 50).map((row) => `<tr class="${row.errors.length ? "import-error" : ""}"><td>${row.line}</td>${fields.map((field) => `<td>${esc(row.values[field.key])}</td>`).join("")}<td>${row.errors.length ? esc(row.errors.join("；")) : "可导入"}</td></tr>`).join("")}</tbody></table>${importState.checked.length > 50 ? `<p class="data-note">仅展示前 50 行，共 ${importState.checked.length} 行。</p>` : ""}`;
      document.getElementById("batch-msg").textContent = errorCount ? `发现 ${errorCount} 行错误，请修正文件后重新上传。` : `检查通过，共 ${importState.checked.length} 行。`;
      document.getElementById("batch-commit").disabled = errorCount > 0;
    };
    document.getElementById("batch-commit").onclick = async () => {
      if (!importState?.checked || importState.checked.some((row) => row.errors.length)) return;
      if (!window.confirm(`确认导入 ${importState.checked.length} 行${IMPORT_SCHEMAS[importState.kind].label}数据？`)) return;
      await commitImport(importState.kind, importState.checked);
      window.alert("导入完成。"); draw();
    };
    document.getElementById("business-export").onclick = exportOperations;
    document.getElementById("aging-csv").onclick = exportAgingCsv;
    document.getElementById("data-export").onclick = async () => {
      const Backup = window.UtiloraBackup;
      const safeName = (db.company.name || "公司").replace(/[\\/:*?"<>|]/g, "-");
      const exportedAt = new Date().toISOString();
      const payload = Backup ? Backup.buildBackup(db, exportedAt) : { type: "utilora-finance-backup", version: 3, exportedAt, data: db };
      downloadJson(`utilora-backup-${safeName}-${today()}.json`, payload);
      const confirmed = demoMode ? false : window.confirm("备份文件已开始下载。请确认文件已保存到电脑后，再记备份时间。\n\n文件已保存好了吗？");
      const record = Backup?.shouldRecordBackupTime ? Backup.shouldRecordBackupTime(confirmed, demoMode) : (confirmed && !demoMode);
      if (record) await setSetting(backupKey(), exportedAt);
      const msg = document.getElementById("data-msg");
      msg.classList.remove("error");
      if (demoMode) msg.textContent = "演示数据已下载，不会记入真实公司的备份时间。";
      else if (record) msg.textContent = "完整备份已下载，已记录备份时间。请妥善保管，文件中包含客户和财务信息。";
      else msg.textContent = "备份已下载，但未记录备份时间。确认文件保存后可再点一次导出。";
    };
    const previewBox = document.getElementById("backup-preview");
    const showBackupPreview = ({ title, preview, note, confirmLabel, requireName, onConfirm }) => {
      previewBox.hidden = false;
      previewBox.innerHTML = `<h3>${esc(title)}</h3>
        <div class="data-health">
          <span><b>公司</b>${esc(preview.company)}</span>
          <span><b>客户</b>${preview.customers}</span>
          <span><b>应收单</b>${preview.invoices}</span>
          <span><b>收款</b>${preview.payments}</span>
          <span><b>银行流水</b>${preview.bankTransactions}</span>
          <span><b>费用</b>${preview.expenses}</span>
          <span><b>科目</b>${preview.accounts}</span>
          <span><b>已月结</b>${preview.closedMonths}</span>
        </div>
        <p class="data-note">${esc(note)}${preview.exportedAt ? ` 导出时间：${esc(preview.exportedAt)}` : ""}</p>
        ${requireName ? `<div class="field"><label for="backup-preview-name">请输入当前公司名称以确认覆盖</label><input id="backup-preview-name" placeholder="${esc(db.company.name)}"></div>` : ""}
        <div class="actions">
          <button id="backup-preview-commit" type="button">${esc(confirmLabel)}</button>
          <button id="backup-preview-cancel" class="secondary" type="button">取消</button>
        </div>`;
      document.getElementById("backup-preview-cancel").onclick = () => { previewBox.hidden = true; previewBox.innerHTML = ""; };
      document.getElementById("backup-preview-commit").onclick = async () => {
        if (requireName) {
          const typed = document.getElementById("backup-preview-name")?.value.trim();
          if (typed !== db.company.name) {
            const msg = document.getElementById("data-msg");
            msg.classList.add("error");
            msg.textContent = "公司名称不一致，未覆盖当前公司";
            return;
          }
        }
        await onConfirm();
      };
    };
    document.getElementById("data-import").onclick = () => {
      if (demoMode) return window.alert("演示模式不会导入到真实公司。请退出演示后再导入备份。");
      document.getElementById("data-file").click();
    };
    document.getElementById("data-recover").onclick = async () => {
      if (demoMode) return window.alert("演示模式不会写入真实公司。");
      if (!recovery) return;
      const Backup = window.UtiloraBackup;
      const preview = Backup?.previewWorkspace ? Backup.previewWorkspace(recovery.data, recovery.createdAt) : { company: recovery.data?.company?.name || "未命名公司", customers: recovery.data?.customers?.length || 0, invoices: recovery.data?.invoices?.length || 0, payments: recovery.data?.payments?.length || 0, bankTransactions: recovery.data?.bankTransactions?.length || 0, expenses: recovery.data?.expenses?.length || 0, accounts: recovery.data?.accounts?.length || 0, closedMonths: recovery.data?.closedMonths?.length || 0, exportedAt: recovery.createdAt };
      const mismatch = Backup?.companyMismatch ? Backup.companyMismatch(db.company.name, preview.company) : (db.company.name && preview.company && db.company.name !== preview.company);
      showBackupPreview({
        title: "恢复预览",
        preview,
        note: mismatch
          ? `将把当前公司「${db.company.name}」覆盖为「${preview.company}」。公司名不一致，须输入当前公司名称后才能写入。`
          : `将覆盖当前公司「${db.company.name}」为该恢复点。请先核对数量。`,
        confirmLabel: "确认覆盖当前公司",
        requireName: Boolean(mismatch),
        onConfirm: async () => {
          await recoveryPoint("手动恢复前");
          db = normalizeData(recovery.data);
          await save();
          draw();
        }
      });
    };
    document.getElementById("data-undo").onclick = async () => { if (demoMode) return window.alert("演示模式不会写入真实公司。"); if (!undo?.value) return; db = normalizeData(undo.value); await save(false); await setSetting(`undo:${workspaceId}`, null); draw(); };
    document.getElementById("data-file").onchange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const msg = document.getElementById("data-msg");
      msg.classList.remove("error");
      try {
        if (demoMode) throw new Error("演示模式不会导入到真实公司");
        const payload = JSON.parse(await file.text());
        const parsed = window.UtiloraBackup ? window.UtiloraBackup.parseBackup(payload) : { ok: payload.type === "utilora-finance-backup" && [2, 3].includes(payload.version), backup: payload, error: "备份格式、版本或必要数据不完整" };
        if (!parsed.ok || !parsed.backup) throw new Error(parsed.error || "备份格式、版本或必要数据不完整");
        const Backup = window.UtiloraBackup;
        const preview = Backup?.previewBackup ? Backup.previewBackup(parsed.backup) : parsed.backup.summary;
        const mismatch = Backup?.companyMismatch ? Backup.companyMismatch(db.company.name, preview.company) : (db.company.name && preview.company && db.company.name !== preview.company);
        showBackupPreview({
          title: "导入预览",
          preview,
          note: mismatch
            ? `不会覆盖当前公司「${db.company.name}」，将新建独立公司「${preview.company}（导入）」。`
            : `将创建为独立公司「${preview.company}（导入）」，当前公司保留。`,
          confirmLabel: "创建为独立公司",
          requireName: false,
          onConfirm: async () => {
            await recoveryPoint("导入前自动恢复点");
            await createWorkspace(`${parsed.backup.data.company.name || "导入公司"}（导入）`, parsed.backup.data);
            msg.textContent = "导入成功，已创建独立公司；原公司已保留恢复点";
            draw();
          }
        });
      } catch (error) {
        msg.textContent = error.message || "导入失败";
        msg.classList.add("error");
      }
      event.target.value = "";
    };
    document.getElementById("data-demo").onclick = async () => {
      if (!window.confirm("演示数据会替换当前公司的全部内容，并自动创建恢复点。继续吗？")) return;
      await recoveryPoint("载入演示数据前");
      db = demo();
      await save();
      draw();
    };
    document.getElementById("data-clear").onclick = async () => {
      const typed = window.prompt(`此操作会删除当前公司“${db.company.name}”中的全部业务数据，并先创建恢复点。请输入公司名称确认：`);
      if (typed !== db.company.name) return;
      await recoveryPoint("清空公司数据前");
      const company = { ...db.company };
      db = empty(company.name || "我的企业");
      db.company = company;
      await save();
      draw();
    };
  }

  function blankDoc(isEst) {
    return { id: uid(isEst ? "e" : "v"), number: nextNo(isEst ? "EST" : "AR", isEst ? db.estimates : db.invoices), customerId: (db.customers[0] && db.customers[0].id) || "", date: today(), validUntil: addDays(7), dueDate: addDays(15), status: "draft", notes: "", rows: [{ name: "", spec: "", qty: 1, unit: "项", price: "", rate: 13 }] };
  }

  function renderEditor(isEst, id) {
    const list = isEst ? db.estimates : db.invoices;
    const found = id && id !== "new" ? list.find((d) => d.id === id) : null;
    const working = JSON.parse(JSON.stringify(found || blankDoc(isEst)));
    const paint = () => {
      view.innerHTML = `<div class="edit-split">
        <div class="panel">
          <div class="form-grid">
            <div class="field"><label>客户</label><select id="d-customer">${db.customers.map((c) => `<option value="${c.id}"${c.id === working.customerId ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
            <div class="field"><label>单号</label><input id="d-number" value="${esc(working.number)}"></div>
            <div class="field"><label>日期</label><input id="d-date" type="date" value="${esc(working.date)}"></div>
            <div class="field"><label>${isEst ? "有效期" : "到期日"}</label><input id="d-due" type="date" value="${esc(isEst ? working.validUntil : working.dueDate)}"></div>
          </div>
          <table class="sheet-table" style="margin-top:12px"><thead><tr><th>项目</th><th>数量</th><th>单价</th><th>税率</th><th></th></tr></thead>
          <tbody>${working.rows.map((row, i) => `<tr>
            <td><input data-i="${i}" data-k="name" list="item-list" value="${esc(row.name)}"></td>
            <td><input data-i="${i}" data-k="qty" value="${esc(row.qty)}"></td>
            <td><input data-i="${i}" data-k="price" value="${esc(row.price)}"></td>
            <td><input data-i="${i}" data-k="rate" value="${esc(row.rate)}"></td>
            <td><button class="secondary" data-del="${i}">删</button></td>
          </tr>`).join("")}</tbody></table>
          <datalist id="item-list">${db.items.map((it) => `<option value="${esc(it.name)}"></option>`).join("")}</datalist>
          <div class="actions"><button class="secondary" id="d-add" type="button">加一行</button>
            <select id="d-item"><option value="">从项目库插入</option>${db.items.map((it) => `<option value="${it.id}">${esc(it.name)}</option>`).join("")}</select>
          </div>
          <div class="field" style="margin-top:12px"><label>备注</label><textarea id="d-notes" style="min-height:70px">${esc(working.notes)}</textarea></div>
          <div class="actions">
            <button id="d-save" type="button">保存</button>
            <button class="secondary" id="d-print" type="button">打印</button>
            <button class="secondary" id="d-back" type="button">返回</button>
          </div>
        </div>
        <div class="preview-pane">${paper(working, isEst ? "报价单" : "应收单")}</div>
      </div>`;
      const sync = () => {
        working.customerId = document.getElementById("d-customer").value;
        working.number = document.getElementById("d-number").value.trim();
        working.date = document.getElementById("d-date").value;
        if (isEst) working.validUntil = document.getElementById("d-due").value; else working.dueDate = document.getElementById("d-due").value;
        working.notes = document.getElementById("d-notes").value;
        view.querySelectorAll("tbody [data-k]").forEach((input) => { working.rows[Number(input.dataset.i)][input.dataset.k] = input.value; });
      };
      view.querySelectorAll("tbody [data-k]").forEach((input) => {
        input.addEventListener("change", () => {
          const i = Number(input.dataset.i);
          working.rows[i][input.dataset.k] = input.value;
          if (input.dataset.k === "name") {
            const hit = db.items.find((it) => it.name === input.value);
            if (hit) { working.rows[i] = { ...working.rows[i], spec: hit.spec, unit: hit.unit, price: hit.price, rate: hit.rate }; paint(); }
          }
        });
      });
      document.getElementById("d-add").onclick = () => { sync(); working.rows.push({ name: "", spec: "", qty: 1, unit: "项", price: "", rate: 13 }); paint(); };
      document.getElementById("d-item").onchange = (e) => {
        const it = db.items.find((x) => x.id === e.target.value);
        if (!it) return;
        sync(); working.rows.push({ name: it.name, spec: it.spec, qty: 1, unit: it.unit, price: it.price, rate: it.rate }); paint();
      };
      view.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => { if (working.rows.length === 1) return; working.rows.splice(Number(b.dataset.del), 1); paint(); });
      document.getElementById("d-save").onclick = () => {
        sync();
        if (!guardOpen(working.date)) return;
        const arr = isEst ? db.estimates : db.invoices;
        const idx = arr.findIndex((d) => d.id === working.id);
        if (idx >= 0) arr[idx] = working; else arr.unshift(working);
        save(); go(isEst ? "estimates" : "invoices", working.id);
      };
      document.getElementById("d-print").onclick = () => { sync(); printDoc(working, isEst ? "报价单" : "应收单"); };
      document.getElementById("d-back").onclick = () => go(isEst ? "estimates" : "invoices");
    };
    primary.hidden = true;
    paint();
  }

  const titles = { dashboard: "今天的工作", customers: "客户", customer: "客户往来", items: "项目", estimates: "报价", invoices: "应收单", payments: "收款", expenses: "费用", reimbursements: "报销", assets: "固定资产", payroll: "工资表", bank: "银行流水", bookkeeping: "科目与凭证", checks: "月结与检查", reports: "报表", intent: "购买意向", settings: "数据与设置", estimate: "编辑报价", invoice: "编辑应收单" };
  let lastAnalyticsRoute = "";
  const trackWorkspaceRoute = (name) => {
    try {
      if (name === lastAnalyticsRoute) return;
      lastAnalyticsRoute = name;
      const analytics = window.UtiloraAnalytics;
      if (!analytics?.track || !analytics.EVENTS) return;
      if (name === "bank") analytics.track(analytics.EVENTS.bank_use);
      else if (name === "invoices" || name === "invoice" || name === "payments") analytics.track(analytics.EVENTS.receivable_use);
      else if (name === "checks") analytics.track(analytics.EVENTS.month_end_use);
    } catch {}
  };


  function draw() {
    const r = route();
    primary.hidden = false;
    trackWorkspaceRoute(r.name);

    document.querySelectorAll(".crater-side button").forEach((btn) => {
      const key = btn.dataset.route;
      btn.classList.toggle("active", key === r.name || (r.name === "customer" && key === "customers") || (r.name === "estimate" && key === "estimates") || (r.name === "invoice" && key === "invoices"));
    });
    titleEl.textContent = titles[r.name] || "工作台";
    if (r.name === "dashboard") { primary.textContent = "新建应收单"; primary.onclick = () => go("invoice", "new"); renderDashboard(); }
    else if (r.name === "customers") { primary.textContent = "新建客户"; renderPeople("customers"); }
    else if (r.name === "customer") renderCustomerDetail(r.id);
    else if (r.name === "items") { primary.textContent = "新建项目"; renderPeople("items"); }
    else if (r.name === "estimates") { primary.textContent = "新建报价"; renderDocs("estimates"); }
    else if (r.name === "invoices") { primary.textContent = "新建应收单"; renderDocs("invoices"); }
    else if (r.name === "payments") { primary.textContent = "记收款"; renderPayments(); }
    else if (r.name === "expenses") renderExpenses();
    else if (r.name === "reimbursements") renderReimbursements();
    else if (r.name === "assets") renderAssets();
    else if (r.name === "payroll") renderPayroll();
    else if (r.name === "bank") renderBank();
    else if (r.name === "bookkeeping") renderBookkeeping();
    else if (r.name === "checks") renderChecks();
    else if (r.name === "reports") renderReports();
    else if (r.name === "intent") renderIntent();
    else if (r.name === "settings") renderSettings();
    else if (r.name === "estimate") renderEditor(true, r.id);
    else if (r.name === "invoice") renderEditor(false, r.id);
    else if (r.name === "receivables") location.hash = "#/invoices";
    else location.hash = "#/dashboard";
  }

  document.querySelectorAll(".crater-side button").forEach((btn) => { btn.onclick = () => go(btn.dataset.route); });
  document.getElementById("sidebar-toggle").onclick = () => document.body.classList.toggle("sidebar-open");
  window.addEventListener("hashchange", draw);
  initStorage().then(() => {
    if (!location.hash) location.hash = "#/dashboard";
    else draw();
  }).catch((error) => {
    setSaveState("无法打开本地数据库", true);
    view.innerHTML = `<div class="panel"><h2>本地数据库无法打开</h2><p class="error">${esc(error.message || "请检查浏览器隐私设置")}</p></div>`;
  });
})();
