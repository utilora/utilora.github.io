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

  const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const esc = (v) => String(v || "").replace(/[&<>"]/g, (ch) => ({ "&": "\u0026amp;", "<": "\u0026lt;", ">": "\u0026gt;", '"': "\u0026quot;" }[ch]));
  const money = (n) => F.formatRmb(F.roundFen(Number(n) || 0));

  const empty = (name = "我的企业") => ({
    schemaVersion: 3,
    company: { name, taxId: "", address: "", phone: "", email: "", payInfo: "", theme: "navy" },
    customers: [], items: [], estimates: [], invoices: [], payments: [], expenses: [], reimbursements: [], assets: [],
  });
  const normalizeData = (source) => {
    const next = { ...empty(), ...(source || {}) };
    next.company = { ...empty().company, ...(source?.company || {}) };
    ["customers", "items", "estimates", "invoices", "payments", "expenses", "reimbursements", "assets"].forEach((key) => {
      next[key] = Array.isArray(source?.[key]) ? source[key] : [];
    });
    const estimateStatus = { sent: "issued", viewed: "issued", accepted: "converted", rejected: "void" };
    const invoiceStatusMap = { sent: "issued", viewed: "issued", accepted: "issued", rejected: "void" };
    next.estimates = next.estimates.map((item) => ({ ...item, status: estimateStatus[item.status] || item.status || "draft" }));
    next.invoices = next.invoices.map((item) => ({ ...item, status: invoiceStatusMap[item.status] || item.status || "draft" }));
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
  const save = async () => {
    if (!idb || !workspaceId || !db) return;
    setSaveState("保存中…");
    try {
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
    if (!db || !workspaceId) return;
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
    await setActiveWorkspace(id);
    setSaveState("已保存到本机 · " + (db.company.name || "未命名公司"));
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
    await setActiveWorkspace(workspaceId);
    setSaveState("已保存到本机 · " + (db.company.name || "未命名公司"));
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
    const due = db.invoices.reduce((s, inv) => s + Math.max(0, compute(inv).inclusive - paidOf(inv.id)), 0);
    const month = today().slice(0, 7);
    const monthSales = db.invoices.filter((i) => (i.date || "").startsWith(month)).reduce((s, inv) => s + compute(inv).inclusive, 0);
    const monthReceipts = db.payments.filter((p) => (p.date || "").startsWith(month)).reduce((s, p) => s + Number(p.amount || 0), 0);
    const overdue = db.invoices.filter((i) => invoiceStatus(i) === "overdue");
    const overdueAmount = overdue.reduce((s, inv) => s + Math.max(0, compute(inv).inclusive - paidOf(inv.id)), 0);
    const dues = db.invoices.filter((i) => ["overdue", "issued", "partial"].includes(invoiceStatus(i))).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))).slice(0, 8);
    const recentPayments = db.payments.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);
    if (!db.customers.length && !db.estimates.length && !db.invoices.length && !db.expenses.length) {
      view.innerHTML = `<div class="welcome-panel"><span>本地财务台 Beta</span><h2>从一家公司的真实数据开始</h2><p>当前公司没有业务数据。先完善公司信息并创建客户，或主动载入明确标记的演示数据了解功能。</p><div class="actions"><button data-start="settings">设置公司信息</button><button class="secondary" data-start="customers">创建第一个客户</button><button class="secondary" data-start="demo">载入演示数据</button></div><small>数据仅保存在当前浏览器，请定期导出备份。</small></div>`;
      view.querySelector('[data-start="settings"]').onclick = () => go("settings");
      view.querySelector('[data-start="customers"]').onclick = () => go("customers");
      view.querySelector('[data-start="demo"]').onclick = async () => { if (window.confirm("在当前空公司中载入演示数据？")) { db = demo(); await save(); draw(); } };
      return;
    }
    view.innerHTML = `
      <div class="stat-row">
        <div class="stat-card" data-go="invoices"><div><b>${money(monthSales)}</b><span>本月应收</span></div><div class="stat-ico violet">应</div></div>
        <div class="stat-card" data-go="payments"><div><b>${money(monthReceipts)}</b><span>本月已收</span></div><div class="stat-ico blue">收</div></div>
        <div class="stat-card" data-go="invoices"><div><b>${money(due)}</b><span>尚未收款</span></div><div class="stat-ico pink">¥</div></div>
        <div class="stat-card" data-go="reports"><div><b>${money(overdueAmount)}</b><span>已逾期</span></div><div class="stat-ico pink">期</div></div>
      </div>
      <div class="dashboard-actions">
        <button data-go="invoice/new">新建应收单</button><button class="secondary" data-go="payments">记录收款</button><button class="secondary" data-go="settings">导入 / 备份数据</button>
      </div>
      <div class="backup-banner" id="dashboard-backup">正在检查本地备份状态…</div>
      <div class="split-lists">
        <div class="list-card">
          <h2 data-go="invoices">到期应收</h2>
          ${dues.length ? dues.map((inv) => `<div class="mini-row" data-go="invoices/${inv.id}"><div><b>${esc(customer(inv.customerId).name)}</b><small>${esc(inv.dueDate)} · ${esc(inv.number)}</small></div><b>${money(compute(inv).inclusive - paidOf(inv.id))}</b></div>`).join("") : `<p class="empty">没有到期应收单</p>`}
        </div>
        <div class="list-card">
          <h2 data-go="payments">最近收款</h2>
          ${recentPayments.map((p) => { const inv = db.invoices.find((i) => i.id === p.invoiceId) || {}; return `<div class="mini-row" data-go="payments"><div><b>${esc(customer(inv.customerId).name || "未关联客户")}</b><small>${esc(p.date)} · ${esc(inv.number)}</small></div><b>${money(p.amount)}</b></div>`; }).join("") || `<p class="empty">还没有收款记录</p>`}
        </div>
      </div>`;
    view.querySelectorAll("[data-go]").forEach((el) => el.onclick = () => { location.hash = `#/${el.dataset.go}`; });
    getSetting(backupKey()).then((item) => {
      const node = document.getElementById("dashboard-backup");
      if (!node) return;
      const age = item?.value ? Math.floor((Date.now() - new Date(item.value).getTime()) / 86400000) : Infinity;
      node.classList.toggle("warn", age > 7);
      node.textContent = item?.value ? `最近备份：${new Date(item.value).toLocaleString("zh-CN")} · ${age > 7 ? "建议立即备份" : "状态正常"}` : "尚未导出备份 · 建议立即备份";
    });
  }

  function renderPeople(kind) {
    const isCust = kind === "customers";
    const list = db[kind];
    view.innerHTML = `<div class="panel">${list.length ? `<table class="sheet-table"><thead><tr>${isCust ? "<th>客户</th><th>未收金额</th><th>电话 / 邮箱</th><th></th>" : "<th>项目</th><th>单价</th><th>税率</th><th></th>"}</tr></thead><tbody>${list.map((row) => `<tr>
      <td><b>${esc(row.name)}</b><div style="color:#9ca3af;font-size:12px">${esc(isCust ? row.address : row.spec)}</div></td>
      <td>${isCust ? money(db.invoices.filter((inv) => inv.customerId === row.id).reduce((sum, inv) => sum + Math.max(0, compute(inv).inclusive - paidOf(inv.id)), 0)) : money(row.price)}</td>
      <td>${isCust ? `${esc(row.phone)}<div style="color:#9ca3af;font-size:12px">${esc(row.email)}</div>` : `${row.rate}%`}</td>
      <td class="actions"><button class="secondary" data-edit="${row.id}">编辑</button><button class="secondary" data-del="${row.id}">删除</button></td>
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

  function convertEstimate(id) {
    const est = db.estimates.find((e) => e.id === id);
    if (!est) return;
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
    db.payments.unshift({ id: uid("p"), invoiceId: id, date: today(), amount, method: "转账", note: "" });
    save(); draw();
  }

  function renderDocs(kind) {
    const isEst = kind === "estimates";
    const list = db[kind];
    const map = isEst ? EST_LABEL : INV_LABEL;
    const selectedId = route().id || (list[0] && list[0].id) || "";
    const selected = list.find((d) => d.id === selectedId) || list[0];
    const statusOf = (d) => (isEst ? d.status : invoiceStatus(d));
    view.innerHTML = `<div class="split-app">
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
      const rows = list.filter((d) => {
        const st = statusOf(d);
        if (filter !== "all" && st !== filter) return false;
        const name = (customer(d.customerId).name || "") + d.number;
        return name.toLowerCase().includes(q);
      });
      document.getElementById("rows").innerHTML = rows.map((d) => `<div class="doc-item${d.id === selectedId ? " on" : ""}" data-id="${d.id}">
        <div><b>${esc(customer(d.customerId).name || "未选客户")}</b>${pill(statusOf(d), map)}<small>${esc(d.number)} · ${esc(d.date)}</small></div>
        <b>${money(compute(d).inclusive)}</b>
      </div>`).join("") || `<p class="empty">没有匹配单据</p>`;
      document.querySelectorAll(".doc-item").forEach((el) => el.onclick = () => go(kind, el.dataset.id));
    };
    const paintPreview = () => {
      if (!selected) return;
      document.getElementById("preview").innerHTML = `
        <div class="preview-actions">
          ${isEst ? `<button class="main" data-act="convert">转为应收单</button>` : `<button class="main" data-act="pay">记录收款</button>`}
          <button data-act="edit">编辑</button>
          <button data-act="issued">标为已确认</button>
          <button data-act="print">打印 / PDF</button>
        </div>
        ${paper(selected, isEst ? "报价单" : "应收单")}`;
      document.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => {
        if (b.dataset.act === "print") printDoc(selected, isEst ? "报价单" : "应收单");
        if (b.dataset.act === "edit") go(isEst ? "estimate" : "invoice", selected.id);
        if (b.dataset.act === "convert") convertEstimate(selected.id);
        if (b.dataset.act === "pay") quickPay(selected.id);
        if (b.dataset.act === "issued") { selected.status = "issued"; save(); draw(); }
      });
    };
    document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => {
      filter = b.dataset.f;
      document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
      paintList();
    });
    document.getElementById("q").oninput = paintList;
    primary.onclick = () => go(isEst ? "estimate" : "invoice", "new");
    paintList();
    paintPreview();
  }

  function renderPayments() {
    view.innerHTML = `<div class="panel">${db.payments.length ? `<table class="sheet-table"><thead><tr><th>日期</th><th>应收单</th><th>客户</th><th>金额</th><th>方式</th><th></th></tr></thead><tbody>${db.payments.map((p) => {
      const inv = db.invoices.find((i) => i.id === p.invoiceId) || {};
      return `<tr><td>${esc(p.date)}</td><td>${esc(inv.number)}</td><td>${esc(customer(inv.customerId).name)}</td><td>${money(p.amount)}</td><td>${esc(p.method)}</td><td><button class="secondary" data-delete-payment="${p.id}">删除</button></td></tr>`;
    }).join("")}</tbody></table>` : `<p class="empty">还没有收款</p>`}</div>`;
    primary.onclick = () => { if (db.invoices[0]) quickPay(db.invoices[0].id); };
    view.querySelectorAll("[data-delete-payment]").forEach((button) => button.onclick = async () => {
      if (!window.confirm("删除这条收款记录？应收状态会自动重新计算。")) return;
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
    <div class="panel" style="margin-top:14px">${db.expenses.length ? `<table class="sheet-table"><thead><tr><th>日期</th><th>对象</th><th>类别</th><th>金额</th></tr></thead><tbody>${db.expenses.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.vendor)}</td><td>${esc(e.category)}</td><td>${money(e.amount)}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">还没有费用</p>`}</div>`;
    primary.hidden = true;
    document.getElementById("x-save").onclick = () => {
      const amount = Number(document.getElementById("x-amount").value);
      if (!amount) return;
      db.expenses.unshift({ id: uid("x"), date: document.getElementById("x-date").value, vendor: document.getElementById("x-vendor").value.trim(), category: document.getElementById("x-cat").value.trim(), amount, note: "" });
      save(); draw();
    };
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
    </div><div class="actions"><button id="r-save">新增报销</button></div></div>
    <div class="panel" style="margin-top:14px">${db.reimbursements.length ? `<table class="sheet-table"><thead><tr><th>日期</th><th>报销人</th><th>类别</th><th>金额</th><th>票据</th><th>状态</th><th></th></tr></thead><tbody>${db.reimbursements.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.claimant)}</td><td>${esc(r.category)}</td><td>${money(r.amount)}</td><td>${r.hasInvoice ? "有" : "无"}</td><td>${labels[r.status] || r.status}</td><td class="actions"><button class="secondary" data-review="${r.id}">${r.status === "draft" ? "审核" : "标为已报销"}</button><button class="secondary" data-rdel="${r.id}">删除</button></td></tr>`).join("")}</tbody></table>` : `<p class="empty">还没有报销记录</p>`}</div>`;
    primary.hidden = true;
    document.getElementById("r-save").onclick = async () => {
      const amount = Number(document.getElementById("r-amount").value);
      const claimant = document.getElementById("r-person").value.trim();
      if (!amount || !claimant) return window.alert("请填写报销人和有效金额。");
      db.reimbursements.unshift({ id: uid("r"), date: document.getElementById("r-date").value, claimant, category: document.getElementById("r-category").value.trim(), amount: F.roundFen(amount), hasInvoice: document.getElementById("r-invoice").value === "yes", status: "draft", note: document.getElementById("r-note").value.trim() });
      await save(); draw();
    };
    view.querySelectorAll("[data-review]").forEach((button) => button.onclick = async () => {
      const item = db.reimbursements.find((r) => r.id === button.dataset.review);
      if (!item) return;
      item.status = item.status === "draft" ? "reviewed" : "paid";
      await save(); draw();
    });
    view.querySelectorAll("[data-rdel]").forEach((button) => button.onclick = async () => {
      if (!window.confirm("删除这条报销记录？")) return;
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
    <div class="panel" style="margin-top:14px">${db.assets.length ? `<table class="sheet-table"><thead><tr><th>资产</th><th>原值</th><th>月折旧</th><th>累计折旧</th><th>账面净值</th><th></th></tr></thead><tbody>${db.assets.map((a) => { const d = assetDepreciation(a); return `<tr><td><b>${esc(a.name)}</b><small>${esc(a.category)} · ${a.years} 年</small></td><td>${money(a.cost)}</td><td>${money(d.monthly)}</td><td>${money(d.accumulated)}</td><td>${money(d.net)}</td><td><button class="secondary" data-adel="${a.id}">删除</button></td></tr>`; }).join("")}</tbody></table>` : `<p class="empty">还没有固定资产</p>`}</div>
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
    view.querySelectorAll("[data-adel]").forEach((button) => button.onclick = async () => {
      if (!window.confirm("删除这项固定资产？")) return;
      db.assets = db.assets.filter((a) => a.id !== button.dataset.adel);
      await save(); draw();
    });
  }

  function renderReports() {
    const series = monthSeries();
    const aging = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
    db.invoices.forEach((inv) => {
      const left = Math.max(0, compute(inv).inclusive - paidOf(inv.id));
      if (!left || inv.status === "draft" || inv.status === "void") return;
      const days = inv.dueDate ? Math.floor((new Date(today()) - new Date(inv.dueDate)) / 86400000) : 0;
      if (days <= 0) aging.current += left;
      else if (days <= 30) aging.d30 += left;
      else if (days <= 60) aging.d60 += left;
      else if (days <= 90) aging.d90 += left;
      else aging.over90 += left;
    });
    view.innerHTML = `<div class="chart-card"><h2>近 8 个月销售与费用</h2>${svgChart(series)}</div>
      <div class="panel" style="margin-top:14px"><h2>应收账龄</h2><table class="sheet-table"><thead><tr><th>未到期</th><th>逾期 1–30 天</th><th>逾期 31–60 天</th><th>逾期 61–90 天</th><th>逾期 90 天以上</th></tr></thead><tbody><tr><td>${money(aging.current)}</td><td>${money(aging.d30)}</td><td>${money(aging.d60)}</td><td>${money(aging.d90)}</td><td>${money(aging.over90)}</td></tr></tbody></table></div>
      <div class="panel" style="margin-top:14px"><table class="sheet-table"><thead><tr><th>月份</th><th>销售</th><th>费用</th><th>净额</th></tr></thead><tbody>${series.map((s) => `<tr><td>${s.label}</td><td>${money(s.sales)}</td><td>${money(s.expenses)}</td><td>${money(s.sales - s.expenses)}</td></tr>`).join("")}</tbody></table></div>`;
    primary.hidden = true;
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

  function validateImport(kind, headers, rows, mapping) {
    const schema = IMPORT_SCHEMAS[kind];
    const checked = rows.map((row, index) => {
      const values = Object.fromEntries(schema.fields.map((field) => [field.key, mapping[field.key] === "" ? "" : String(row[Number(mapping[field.key])] ?? "").trim()]));
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

  async function renderSettings() {
    const c = db.company;
    primary.hidden = true;
    const workspaces = await listWorkspaces();
    const record = workspaces.find((item) => item.id === workspaceId);
    const backup = await getSetting(backupKey());
    const recovery = await latestRecovery();
    const backupAge = backup?.value ? Math.floor((Date.now() - new Date(backup.value).getTime()) / 86400000) : Infinity;
    const backupLabel = backup?.value ? `${new Date(backup.value).toLocaleString("zh-CN")} · ${backupAge > 7 ? "建议立即备份" : "状态正常"}` : "尚未备份 · 建议立即备份";
    view.innerHTML = `<div class="panel settings-section"><h2>当前公司</h2><p class="data-note">每家公司在 IndexedDB 中独立保存。数据不上传，也不会跟随 Utilora 账号或设备同步。</p>
      <div class="data-health"><span><b>数据位置</b>当前浏览器</span><span><b>当前公司</b>${esc(db.company.name)}</span><span><b>最近保存</b>${record?.updatedAt ? new Date(record.updatedAt).toLocaleString("zh-CN") : "—"}</span><span class="${backupAge > 7 ? "warn" : ""}"><b>最近备份</b>${esc(backupLabel)}</span></div>
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
      <p class="data-note"><b>重要：</b>清理浏览器数据、使用无痕模式或更换设备都可能导致本地数据丢失。请定期导出完整备份。</p>
      <div class="actions">
        <button id="data-export" type="button">导出完整备份</button>
        <button id="data-import" class="secondary" type="button">导入备份</button>
        <button id="data-recover" class="secondary" type="button"${recovery ? "" : " disabled"}>恢复最近自动恢复点</button>
        <button id="data-demo" class="secondary" type="button">载入演示数据</button>
        <button id="data-clear" class="danger" type="button">清空当前公司数据</button>
      </div>
      <input id="data-file" type="file" accept="application/json,.json" hidden>
      <p id="data-msg" class="empty"></p>
      <p class="data-note">${recovery ? `最近自动恢复点：${new Date(recovery.createdAt).toLocaleString("zh-CN")}（${esc(recovery.reason)}）` : "当前公司还没有自动恢复点。导入、载入演示或清空前会自动创建。"}</p>
    </div>
    <div class="panel settings-section"><h2>批量导入与业务导出</h2><p class="data-note">支持 Excel 另存的 CSV/TSV 文件。先选择数据类型并上传，再映射字段、预览错误，确认后才写入；导入前自动创建恢复点。</p>
      <div class="form-grid"><div class="field"><label>数据类型</label><select id="batch-kind">${Object.entries(IMPORT_SCHEMAS).map(([key, item]) => `<option value="${key}">${item.label}</option>`).join("")}</select></div><div class="field"><label>Excel / CSV 文件</label><input id="batch-file" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values"></div></div>
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
      const rows = window.UtiloraCsv.parseCsv(await file.text());
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
    document.getElementById("data-export").onclick = () => {
      const safeName = (db.company.name || "公司").replace(/[\\/:*?"<>|]/g, "-");
      const exportedAt = new Date().toISOString();
      downloadJson(`utilora-backup-${safeName}-${today()}.json`, { type: "utilora-finance-backup", version: 3, exportedAt, summary: { company: db.company.name, customers: db.customers.length, invoices: db.invoices.length, payments: db.payments.length }, data: db });
      setSetting(backupKey(), exportedAt);
      document.getElementById("data-msg").textContent = "备份已下载。请妥善保管，文件中包含客户和财务信息。";
    };
    document.getElementById("data-import").onclick = () => document.getElementById("data-file").click();
    document.getElementById("data-recover").onclick = async () => {
      if (!recovery || !window.confirm(`恢复到 ${new Date(recovery.createdAt).toLocaleString("zh-CN")} 的公司数据？当前状态会先生成新的恢复点。`)) return;
      await recoveryPoint("手动恢复前");
      db = normalizeData(recovery.data);
      await save(); draw();
    };
    document.getElementById("data-file").onchange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const msg = document.getElementById("data-msg");
      try {
        const payload = JSON.parse(await file.text());
        if (payload.type !== "utilora-finance-backup" || ![2, 3].includes(payload.version) || !payload.data?.company || !Array.isArray(payload.data.customers) || !Array.isArray(payload.data.invoices) || !Array.isArray(payload.data.payments)) throw new Error("备份格式、版本或必要数据不完整");
        const summary = `公司：${payload.data.company.name || "未命名"}\n客户：${payload.data.customers.length}\n应收单：${payload.data.invoices.length}\n收款：${payload.data.payments.length}\n导出时间：${payload.exportedAt || "未知"}`;
        if (!window.confirm(`导入预览\n\n${summary}\n\n确认创建为独立公司吗？`)) return;
        await recoveryPoint("导入前自动恢复点");
        await createWorkspace(`${payload.data.company.name || "导入公司"}（导入）`, payload.data);
        msg.textContent = "导入成功，已创建独立公司；原公司已保留恢复点";
        draw();
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

  const titles = { dashboard: "概览", customers: "客户", items: "项目", estimates: "报价", invoices: "应收单", payments: "收款", expenses: "费用", reimbursements: "报销", assets: "固定资产", reports: "报表", settings: "数据与设置", estimate: "编辑报价", invoice: "编辑应收单" };

  function draw() {
    const r = route();
    primary.hidden = false;
    document.querySelectorAll(".crater-side button").forEach((btn) => {
      const key = btn.dataset.route;
      btn.classList.toggle("active", key === r.name || (r.name === "estimate" && key === "estimates") || (r.name === "invoice" && key === "invoices"));
    });
    titleEl.textContent = titles[r.name] || "工作台";
    if (r.name === "dashboard") { primary.textContent = "新建应收单"; primary.onclick = () => go("invoice", "new"); renderDashboard(); }
    else if (r.name === "customers") { primary.textContent = "新建客户"; renderPeople("customers"); }
    else if (r.name === "items") { primary.textContent = "新建项目"; renderPeople("items"); }
    else if (r.name === "estimates") { primary.textContent = "新建报价"; renderDocs("estimates"); }
    else if (r.name === "invoices") { primary.textContent = "新建应收单"; renderDocs("invoices"); }
    else if (r.name === "payments") { primary.textContent = "记收款"; renderPayments(); }
    else if (r.name === "expenses") renderExpenses();
    else if (r.name === "reimbursements") renderReimbursements();
    else if (r.name === "assets") renderAssets();
    else if (r.name === "reports") renderReports();
    else if (r.name === "settings") renderSettings();
    else if (r.name === "estimate") renderEditor(true, r.id);
    else if (r.name === "invoice") renderEditor(false, r.id);
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
