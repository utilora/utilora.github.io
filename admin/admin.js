const loginPanel = document.getElementById('login-panel');
const managerPanel = document.getElementById('manager-panel');
const loginForm = document.getElementById('login-form');
const loginMessage = document.getElementById('login-message');
const managerMessage = document.getElementById('manager-message');
const feedbackList = document.getElementById('feedback-list');
const empty = document.getElementById('empty');
const summary = document.getElementById('summary');
const filterForm = document.getElementById('filter-form');
const sessionKey = 'utilora_admin_session';
let usersCache = [];
let intentsCache = [];
let feedbackCache = [];
let usersLoadState = 'ok';
let intentsLoadState = 'ok';
let feedbackLoadState = 'ok';
function isPreview() {
  return !/utilora\.github\.io$/i.test(location.hostname);
}
function currentAdminId() {
  try { return getSession()?.user?.id || ''; }
  catch { return ''; }
}
function currentAdminEmail() {
  try { return getSession()?.user?.email || ''; }
  catch { return ''; }
}
const tip = document.getElementById('chart-tip');

const toolNames = {
  'json-formatter': 'JSON 格式化',
  timestamp: '时间戳转换',
  base64: 'Base64 编解码',
  'qr-code': '二维码生成器',
  'password-generator': '密码生成器',
  'text-counter': '文本统计',
  'url-codec': 'URL 编解码',
  'hash-generator': 'Hash / MD5',
  'uuid-generator': 'UUID 生成器',
  'regex-tester': '正则测试',
  'color-converter': '颜色转换',
  'case-converter': '大小写转换',
  'text-diff': '文本对比',
  'jwt-decoder': 'JWT 解码',
  'cron-explainer': 'Cron 表达式解释',
  'url-parser': 'URL 解析器',
  'number-base': '进制转换',
  'unit-converter': '单位换算',
  'html-entities': 'HTML 实体编解码',
  'random-number': '随机数生成器',
  'douyin-downloader': '抖音视频下载',
  'image-compress': '图片压缩',
  'number-chinese': '数字转中文大写',
  'zh-convert': '简繁拼音',
};

const deviceNames = { mobile: '手机', desktop: '电脑', tablet: '平板', unknown: '未知' };
let analyticsCache = null;

function getSession() {
  try { return JSON.parse(sessionStorage.getItem(sessionKey)); }
  catch { return null; }
}

function setMessage(element, text, error = false) {
  if (!element) return;
  element.className = error ? 'message error' : 'message';
  element.textContent = text || '';
}

function classifyError(error) {
  const message = String(error?.message || error || '');
  if (/404|does not exist|PGRST202/i.test(message)) return 'missing';
  if (/401|403|42501|insufficient|privilege|没有管理员权限|登录已失效/i.test(message)) return 'permission';
  return 'other';
}

function setEmptyState(el, title, hint) {
  if (!el) return;
  const titleNode = el.querySelector('strong') || el;
  const hintNode = el.querySelector('.hint');
  if (el.querySelector('strong')) titleNode.textContent = title;
  else el.textContent = title;
  if (hintNode) hintNode.textContent = hint || '';
  el.hidden = false;
}

function hideEmpty(el) {
  if (!el) return;
  el.hidden = true;
}

function setupHint(kind, file) {
  if (kind === 'missing') return `请在 Supabase SQL Editor 执行 ${file} 后点击刷新。`;
  if (kind === 'permission') return '当前账号没有管理员权限，或登录已失效。请确认已写入 admin_users 后重新登录。';
  return '';
}

function setPageSummary(text) {
  if (summary) summary.textContent = text || '';
}

function apiHeaders() {
  const session = getSession();
  return {
    apikey: SUPABASE_CONFIG.publishableKey,
    Authorization: `Bearer ${session?.access_token || ''}`,
    'Content-Type': 'application/json',
  };
}

async function recordAdminAuth(eventType) {
  try {
    await request('rpc/record_user_activity', {
      method: 'POST',
      body: JSON.stringify({
        p_event_type: eventType,
        p_category: 'auth',
        p_path: '/admin/',
        p_detail: { client: 'admin' },
      }),
    });
  } catch {}
}

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function loginErrorText(raw) {
  const text = String(raw || '').trim();
  if (/invalid login credentials|invalid_grant|invalid email or password/i.test(text)) return '邮箱或密码不对';
  if (/email not confirmed/i.test(text)) return '邮箱尚未验证';
  if (/too many requests|rate limit/i.test(text)) return '尝试次数过多，请稍后再试';
  if (/failed to fetch|networkerror|load failed/i.test(text)) return '网络异常，请稍后重试';
  return text || '登录失败';
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('login-button');
  button.disabled = true;
  setMessage(loginMessage, '正在登录……');
  try {
    const response = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_CONFIG.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(loginErrorText(data.error_description || data.msg || data.error));
    sessionStorage.setItem(sessionKey, JSON.stringify(data));
    document.getElementById('password').value = '';
    showManager();
    await recordAdminAuth('login');
    await refreshAll();
  } catch (error) {
    setMessage(loginMessage, loginErrorText(error.message), true);
  } finally {
    button.disabled = false;
  }
});

async function refreshSession() {
  const session = getSession();
  if (!session?.refresh_token) return false;
  try {
    const response = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: SUPABASE_CONFIG.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return false;
    sessionStorage.setItem(sessionKey, JSON.stringify({ ...session, ...data }));
    return true;
  } catch {
    return false;
  }
}

async function request(path, options = {}, retried = false) {
  const response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/${path}`, {
    ...options,
    headers: { ...apiHeaders(), ...(options.headers || {}) },
  });
  if (response.status === 401 && !retried) {
    const ok = await refreshSession();
    if (ok) return request(path, options, true);
  }
  if (response.status === 401 || response.status === 403) {
    if (!isPreview()) logout();
    throw new Error('登录已失效或没有管理员权限');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.hint || `请求失败（${response.status}）`);
  }
  return response;
}

const PAGE_SIZE = 20;
let usersPage = 1;
let intentsPage = 1;

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row) => lines.push(row.map(csvEscape).join(',')));
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function isLocalDay(iso) {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10) === todayISO();
}

function paintOverviewExtras() {
  const newUsers = usersLoadState === 'ok' ? usersCache.filter((user) => isLocalDay(user.created_at)).length : null;
  const signins = usersLoadState === 'ok' ? usersCache.filter((user) => isLocalDay(user.last_sign_in_at)).length : null;
  const openIntents = intentsLoadState === 'ok'
    ? intentsCache.filter((row) => (row.follow_status || 'new') !== 'closed').length
    : null;
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value == null ? '—' : String(value);
  };
  set('overview-new-users', newUsers);
  set('overview-signins', signins);
  set('overview-open-intents', openIntents);
}

function paginate(rows, page) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
  const current = Math.min(Math.max(1, page), pages);
  return { current, pages, total, slice: rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE) };
}

function renderPager(el, state, onPage) {
  if (!el) return;
  el.replaceChildren();
  if (state.pages <= 1) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const info = document.createElement('span');
  info.textContent = `第 ${state.current} / ${state.pages} 页 · ${state.total} 条`;
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'secondary';
  prev.textContent = '上一页';
  prev.disabled = state.current <= 1;
  prev.addEventListener('click', () => onPage(state.current - 1));
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'secondary';
  next.textContent = '下一页';
  next.disabled = state.current >= state.pages;
  next.addEventListener('click', () => onPage(state.current + 1));
  el.append(prev, info, next);
}

function showManager() {
  loginPanel.hidden = true;
  managerPanel.hidden = false;
  loginMessage.textContent = '';
  const emailNode = document.getElementById('admin-email');
  if (emailNode) emailNode.textContent = currentAdminEmail() || (isPreview() ? '预览模式' : '管理员');
  switchPage('overview');
}

function showLogin() {
  managerPanel.hidden = true;
  loginPanel.hidden = false;
}

function logout() {
  const finish = () => {
    sessionStorage.removeItem(sessionKey);
    feedbackList.replaceChildren();
    analyticsCache = null;
    usersCache = [];
    intentsCache = [];
    showLogin();
  };
  recordAdminAuth('logout').then(finish, finish);
}

const pageTitles = { overview: '工作台', analytics: '访问统计', users: '用户管理', feedback: '用户留言', intents: '购买意向', promotions: '生产折扣', entitlements: '权益一览', logs: '操作日志' };

function switchPage(name) {
  ['overview', 'analytics', 'users', 'feedback', 'intents', 'promotions', 'entitlements', 'logs'].forEach((id) => {
    const section = document.getElementById(`${id}-section`);
    if (section) section.hidden = id !== name;
  });
  document.querySelectorAll('.side-link').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === name);
  });
  const title = document.getElementById('page-title');
  if (title) title.textContent = pageTitles[name] || '管理';
  document.body.classList.remove('sidebar-open');
  if (name === 'users') loadUsers();
  if (name === 'intents') loadIntents();
  if (name === 'feedback') loadFeedback();
  if (name === 'analytics') {
    loadAnalytics();
    window.AdminOps?.loadFunnel?.();
  }
  if (name === 'promotions') window.AdminOps?.loadPromotions?.();
  if (name === 'entitlements') window.AdminOps?.loadEntitlements?.();
  if (name === 'logs') window.AdminOps?.loadLogs?.();
}

function switchTab(name) {
  switchPage(name === 'analytics' ? 'analytics' : 'feedback');
}

function buildQuery() {
  const params = new URLSearchParams();
  params.set('select', 'id,created_at,name,title,message,contact,status');
  params.set('order', 'created_at.desc');
  const status = document.getElementById('status-filter').value;
  const start = document.getElementById('start-date').value;
  const end = document.getElementById('end-date').value;
  if (status) params.append('status', `eq.${status}`);
  if (start) params.append('created_at', `gte.${new Date(`${start}T00:00:00`).toISOString()}`);
  if (end) params.append('created_at', `lte.${new Date(`${end}T23:59:59.999`).toISOString()}`);
  return params.toString();
}

async function loadFeedback() {
  if (isPreview() && !getSession()) {
    feedbackLoadState = 'ok';
    feedbackCache = mockFeedback;
    renderRows(feedbackCache);
    setMessage(managerMessage, '当前为界面预览数据。');
    setPageSummary('预览数据');
    return;
  }

  const start = document.getElementById('start-date').value;
  const end = document.getElementById('end-date').value;
  if (start && end && start > end) {
    setMessage(managerMessage, '开始日期不能晚于结束日期', true);
    setPageSummary('筛选条件无效');
    return;
  }
  setMessage(managerMessage, '正在加载……');
  try {
    const response = await request(`feedback?${buildQuery()}`);
    const rows = await response.json();
    feedbackLoadState = 'ok';
    feedbackCache = Array.isArray(rows) ? rows : [];
    renderRows(feedbackCache);
    setMessage(managerMessage, rows.length ? `共 ${rows.length} 条` : '');
    const filtered = document.getElementById('status-filter').value || start || end;
    setPageSummary(`${filtered ? '筛选结果' : '全部留言'}：${rows.length} 条`);
    const badge = document.getElementById('feedback-count');
    badge.hidden = rows.length === 0;
    badge.textContent = rows.length;
  } catch (error) {
    feedbackLoadState = classifyError(error);
    feedbackCache = [];
    feedbackList.replaceChildren();
    const hint = setupHint(feedbackLoadState, 'supabase/admin-policies.sql');
    setMessage(managerMessage, hint || error.message, true);
    setEmptyState(empty, feedbackLoadState === 'permission' ? '没有权限读取留言' : '留言加载失败', hint || error.message);
    setPageSummary('留言加载失败');
    document.getElementById('overview-feedback').textContent = '—';
  }
}

function renderRows(rows) {
  feedbackList.replaceChildren();
  if (rows.length) hideEmpty(empty);
  else {
    const filtered = document.getElementById('status-filter').value || document.getElementById('start-date').value || document.getElementById('end-date').value;
    setEmptyState(empty, filtered ? '没有符合当前筛选条件的留言。' : '还没有用户留言。', filtered ? '可重置筛选后再查询。' : '');
  }
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    [new Date(row.created_at).toLocaleString(), row.name, row.title, row.message, row.contact || '—'].forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    });
    const statusTd = document.createElement('td');
    const select = document.createElement('select');
    [['new', '新留言'], ['processing', '处理中'], ['completed', '已完成'], ['closed', '已关闭']].forEach(([value, label]) => {
      select.add(new Option(label, value, value === row.status, value === row.status));
    });
    select.addEventListener('change', () => updateStatus(row.id, select.value));
    statusTd.append(select);
    tr.append(statusTd);
    const actionTd = document.createElement('td');
    const button = document.createElement('button');
    button.className = 'delete';
    button.textContent = '删除';
    button.addEventListener('click', () => deleteFeedback(row.id, row.title));
    actionTd.append(button);
    tr.append(actionTd);
    feedbackList.append(tr);
  });
}

async function updateStatus(id, status) {
  try {
    await request(`feedback?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status }),
    });
    setMessage(managerMessage, '状态已更新');
    await loadFeedback();
  } catch (error) {
    setMessage(managerMessage, error.message, true);
    await loadFeedback();
  }
}

async function deleteFeedback(id, title) {
  if (!confirm(`确定删除“${title}”吗？此操作无法撤销。`)) return;
  try {
    await request(`feedback?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    setMessage(managerMessage, '留言已删除');
    await loadFeedback();
  } catch (error) {
    setMessage(managerMessage, error.message, true);
  }
}

function selectedRange() {
  const mode = document.getElementById('analytics-range').value;
  if (mode !== 'custom') {
    const days = Number(mode) || 30;
    return { days, start: null, end: null, label: `最近 ${days} 天` };
  }
  const end = document.getElementById('analytics-end').value || todayISO();
  const start = document.getElementById('analytics-start').value || addDays(end, -29);
  const days = Math.max(1, Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000) + 1);
  return { days, start, end, label: `${start} 至 ${end}` };
}

async function fetchSummary(range) {
  const bodies = [];
  if (range.start && range.end) bodies.push({ p_days: range.days, p_start: range.start, p_end: range.end });
  bodies.push({ p_days: range.days });
  let lastError;
  for (const body of bodies) {
    try {
      const response = await request('rpc/get_analytics_summary', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function loadAnalytics() {
  if (isPreview() && !getSession()) {
    document.getElementById('overview-views').textContent = '1,284';
    document.getElementById('overview-uses').textContent = '376';
    return;
  }

  const msg = document.getElementById('analytics-message');
  const range = selectedRange();
  if (range.start && range.end && range.start > range.end) {
    setMessage(msg, '开始日期不能晚于结束日期', true);
    return;
  }
  setMessage(msg, '正在加载统计……');
  try {
    const data = await fetchSummary(range);
    analyticsCache = { data, range };
    renderAnalytics(data, range);
    setMessage(msg, '');
    setPageSummary(`${range.label} 统计已更新`);
  } catch (error) {
    const kind = classifyError(error);
    const hint = kind === 'missing'
      ? '请重新执行 supabase/analytics.sql 升级统计函数后刷新。'
      : (setupHint(kind, 'supabase/analytics.sql') || error.message);
    setMessage(msg, hint, true);
    setPageSummary('访问统计加载失败');
    document.getElementById('overview-views').textContent = '—';
    document.getElementById('overview-uses').textContent = '—';
  }
}

function setDelta(id, current, previous, suffix = ' 较上期') {
  const el = document.getElementById(id);
  if (!el) return;
  if (previous == null || Number.isNaN(Number(previous))) {
    el.textContent = '';
    el.className = 'delta';
    return;
  }
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0 && cur === 0) {
    el.textContent = '与上期持平';
    el.className = 'delta flat';
    return;
  }
  if (prev === 0) {
    el.textContent = `新数据${suffix}`;
    el.className = 'delta up';
    return;
  }
  const pct = ((cur - prev) / prev) * 100;
  const sign = pct > 0 ? '+' : '';
  el.textContent = `${sign}${pct.toFixed(1)}%${suffix}`;
  el.className = `delta ${pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'}`;
}

function setShare(id, part, total, label) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!total) {
    el.textContent = '';
    return;
  }
  el.textContent = `${((Number(part) / total) * 100).toFixed(1)}% ${label}`;
  el.className = 'delta muted';
}

function sparkline(values) {
  if (!values.length) return '';
  const width = 120;
  const height = 28;
  const max = Math.max(1, ...values);
  const step = values.length === 1 ? 0 : width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = (step * index).toFixed(1);
    const y = (height - (Number(value) / max) * (height - 4) - 2).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function prettyReferrer(name) {
  const value = (name || 'direct').toLowerCase();
  if (!name || value === 'direct') return '直接访问';
  if (value.includes('utilora.github.io') || value.includes('localhost')) return '站内跳转';
  return name;
}

function prettyPath(path) {
  if (!path || path === '/') return '首页';
  const slug = path.replace(/^\/tools\/|\/$/g, '').replace(/\/$/, '');
  return toolNames[slug] || path;
}

function bucketDaily(daily, days) {
  if (days <= 45) {
    return daily.map((item) => ({
      ...item,
      label: String(item.date).slice(5),
      title: item.date,
    }));
  }
  const weekly = days <= 140;
  const groups = new Map();
  daily.forEach((item) => {
    const key = weekly ? weekKey(item.date) : String(item.date).slice(0, 7);
    const current = groups.get(key) || { date: key, views: 0, visitors: 0, uses: 0, title: key };
    current.views += Number(item.views) || 0;
    current.visitors += Number(item.visitors) || 0;
    current.uses += Number(item.uses) || 0;
    groups.set(key, current);
  });
  return [...groups.values()].map((item) => ({
    ...item,
    label: weekly ? item.date.slice(5) : item.date.slice(2),
    title: weekly ? `${item.date} 当周` : item.date,
  }));
}

function weekKey(iso) {
  const date = new Date(`${iso}T00:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function showTip(event, html) {
  tip.hidden = false;
  tip.innerHTML = html;
  moveTip(event);
}

function moveTip(event) {
  const pad = 14;
  const x = Math.min(event.clientX + pad, window.innerWidth - tip.offsetWidth - 8);
  const y = Math.min(event.clientY + pad, window.innerHeight - tip.offsetHeight - 8);
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}

function hideTip() {
  tip.hidden = true;
}

function renderDailyChart(daily, days) {
  const chart = document.getElementById('daily-chart');
  chart.replaceChildren();
  const buckets = bucketDaily(daily, days);
  if (!buckets.length || buckets.every((item) => !Number(item.views) && !Number(item.uses))) {
    chart.classList.add('empty');
    chart.textContent = '所选时间范围内暂无访问';
    return;
  }
  chart.classList.remove('empty');
  const maxViews = Math.max(1, ...buckets.map((item) => Number(item.views) || 0));
  const maxUses = Math.max(1, ...buckets.map((item) => Number(item.uses) || 0));
  const labelEvery = buckets.length > 20 ? Math.ceil(buckets.length / 10) : 1;
  buckets.forEach((item, index) => {
    const group = document.createElement('div');
    group.className = 'bar-group';
    const viewBar = document.createElement('div');
    viewBar.className = 'bar';
    viewBar.style.height = `${Math.max(3, (Number(item.views) / maxViews) * 100)}%`;
    group.append(viewBar);
    if (item.uses != null) {
      const useBar = document.createElement('div');
      useBar.className = 'bar uses';
      useBar.style.height = `${Math.max(2, (Number(item.uses) / maxUses) * 100)}%`;
      group.append(useBar);
    }
    if (index % labelEvery === 0 || index === buckets.length - 1) {
      const label = document.createElement('span');
      label.textContent = item.label;
      group.append(label);
    }
    const html = `<b>${item.title}</b>访问 ${Number(item.views).toLocaleString()} 次<br>访客 ${Number(item.visitors || 0).toLocaleString()} 人<br>工具使用 ${Number(item.uses || 0).toLocaleString()} 次`;
    group.addEventListener('pointerenter', (event) => showTip(event, html));
    group.addEventListener('pointermove', moveTip);
    group.addEventListener('pointerleave', hideTip);
    chart.append(group);
  });
}

function renderRank(id, items, total) {
  const box = document.getElementById(id);
  box.replaceChildren();
  const max = Math.max(1, ...items.map((item) => Number(item.count) || 0));
  items.slice(0, 10).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'chart-row';
    const label = document.createElement('span');
    label.textContent = item.name || '未知';
    label.title = label.textContent;
    const track = document.createElement('div');
    track.className = 'chart-track';
    const fill = document.createElement('i');
    fill.style.width = `${(Number(item.count) / max) * 100}%`;
    track.append(fill);
    const value = document.createElement('b');
    const count = Number(item.count) || 0;
    value.innerHTML = `${count.toLocaleString()}${total ? `<small>${((count / total) * 100).toFixed(0)}%</small>` : ''}`;
    row.append(label, track, value);
    box.append(row);
  });
}

function renderTable(id, rows) {
  const list = document.getElementById(id);
  list.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.textContent = '暂无数据';
    tr.append(td);
    list.append(tr);
    return;
  }
  rows.forEach((cols) => {
    const tr = document.createElement('tr');
    cols.forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    });
    list.append(tr);
  });
}

function renderAnalytics(data, range) {
  const tools = data.tools || [];
  const daily = data.daily || [];
  const total = Number(data.total_tool_uses) || 0;
  const views = Number(data.total_views) || 0;
  const visitors = Number(data.unique_visitors) || 0;
  const days = Number(data.days) || range.days || 30;
  const newVisitors = data.new_visitors;
  const returning = data.returning_visitors;

  document.getElementById('total-views').textContent = views.toLocaleString();
  document.getElementById('unique-visitors').textContent = visitors.toLocaleString();
  document.getElementById('today-views').textContent = Number(data.today_views || 0).toLocaleString();
  document.getElementById('average-views').textContent = (views / days).toFixed(1);
  document.getElementById('total-uses').textContent = total.toLocaleString();
  document.getElementById('popular-tool').textContent = tools[0] ? (toolNames[tools[0].slug] || tools[0].slug) : '暂无';
  document.getElementById('new-visitors').textContent = newVisitors == null ? '—' : Number(newVisitors).toLocaleString();
  document.getElementById('returning-visitors').textContent = returning == null ? '—' : Number(returning).toLocaleString();
  document.getElementById('views-spark').innerHTML = sparkline(daily.map((item) => Number(item.views) || 0));

  setDelta('total-views-delta', views, data.prev_total_views);
  setDelta('unique-visitors-delta', visitors, data.prev_unique_visitors);
  setDelta('today-views-delta', data.today_views, data.yesterday_views, ' 较昨日');
  setDelta('total-uses-delta', total, data.prev_total_tool_uses);
  setShare('popular-tool-share', tools[0]?.uses, total, '占比');
  setShare('new-visitors-share', newVisitors, visitors, '新访客');
  setShare('returning-visitors-share', returning, visitors, '回访');

  const rangeLabel = data.start && data.end ? `${data.start} 至 ${data.end}` : range.label;
  document.getElementById('analytics-subtitle').textContent = `${rangeLabel} · 共 ${days} 天 · 环比对比上一同等周期`;
  document.getElementById('daily-chart-title').textContent = `${rangeLabel} 访问趋势`;
  if (data.prev_total_views == null) {
    document.getElementById('analytics-subtitle').textContent = `${rangeLabel} · 共 ${days} 天 · 重新执行 supabase/analytics.sql 可启用环比与新访客`;
  }

  renderDailyChart(daily, days);
  renderRank('tool-chart', tools.map((item) => ({ name: toolNames[item.slug] || item.slug, count: item.uses })), total);
  renderRank('device-chart', (data.devices || []).map((item) => ({ name: deviceNames[item.name] || item.name, count: item.count })), views);
  renderRank('browser-chart', data.browsers || [], views);
  renderRank('referrer-chart', (data.referrers || []).map((item) => ({ name: prettyReferrer(item.name), count: item.count })), views);
  renderRank('page-chart', (data.pages || []).map((item) => ({ name: prettyPath(item.path), count: item.views })), views);

  renderTable('daily-stats-list', [...daily].reverse().map((item) => [
    item.date,
    Number(item.views || 0).toLocaleString(),
    Number(item.visitors || 0).toLocaleString(),
    Number(item.uses || 0).toLocaleString(),
  ]));
  renderTable('tool-stats-list', tools.map((item) => [
    toolNames[item.slug] || item.slug,
    Number(item.uses).toLocaleString(),
    total ? `${((Number(item.uses) / total) * 100).toFixed(1)}%` : '0%',
  ]));
}

function exportCsv() {
  if (!analyticsCache) return;
  const { data } = analyticsCache;
  const lines = ['# 每日明细', '日期,访问量,独立访客,工具使用'];
  (data.daily || []).forEach((item) => {
    lines.push([item.date, item.views || 0, item.visitors || 0, item.uses || 0].join(','));
  });
  lines.push('', '# 工具使用', '工具,使用次数,占比');
  const total = Number(data.total_tool_uses) || 0;
  (data.tools || []).forEach((item) => {
    const name = toolNames[item.slug] || item.slug;
    const share = total ? ((Number(item.uses) / total) * 100).toFixed(1) + '%' : '0%';
    lines.push(`${name},${item.uses},${share}`);
  });
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = todayISO();
  link.href = url;
  link.download = `utilora-analytics-${stamp}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function setChartMode(chart) {
  document.getElementById('chart-view').hidden = !chart;
  document.getElementById('table-view').hidden = chart;
  document.getElementById('show-chart').className = chart ? '' : 'secondary';
  document.getElementById('show-table').className = chart ? 'secondary' : '';
}

filterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loadFeedback();
});
document.getElementById('reset-filter').addEventListener('click', () => {
  filterForm.reset();
  loadFeedback();
});
document.getElementById('refresh').addEventListener('click', () => refreshAll());
document.getElementById('logout').addEventListener('click', logout);
document.querySelectorAll('[data-page]').forEach((btn) => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  document.body.classList.toggle('sidebar-open');
});
document.getElementById('analytics-range').addEventListener('change', () => {
  const custom = document.getElementById('analytics-range').value === 'custom';
  document.getElementById('custom-range').hidden = !custom;
  if (!custom) {
    loadAnalytics();
    window.AdminOps?.loadFunnel?.();
  }
});
document.getElementById('apply-range').addEventListener('click', () => {
  loadAnalytics();
  window.AdminOps?.loadFunnel?.();
});
document.getElementById('show-chart').addEventListener('click', () => setChartMode(true));
document.getElementById('show-table').addEventListener('click', () => setChartMode(false));
document.getElementById('export-csv').addEventListener('click', exportCsv);

const endInput = document.getElementById('analytics-end');
const startInput = document.getElementById('analytics-start');
endInput.value = todayISO();
startInput.value = addDays(endInput.value, -29);
endInput.max = todayISO();
startInput.max = todayISO();

const mockUsers = [
  { id: '1', email: 'admin@utilora.local', name: '站长', created_at: '2026-03-01T08:00:00Z', last_sign_in_at: '2026-08-20T08:12:00Z', email_confirmed_at: '2026-03-01T08:10:00Z', is_admin: true, is_disabled: false },
  { id: '2', email: 'li@example.com', name: '李然', created_at: '2026-06-18T02:00:00Z', last_sign_in_at: '2026-08-19T13:40:00Z', email_confirmed_at: '2026-06-18T02:20:00Z', is_admin: false, is_disabled: false },
  { id: '3', email: 'unverified@example.com', name: '待验证', created_at: '2026-08-12T09:00:00Z', last_sign_in_at: null, email_confirmed_at: null, is_admin: false, is_disabled: false },
  { id: '4', email: 'paused@example.com', name: '已停用账号', created_at: '2026-05-02T04:00:00Z', last_sign_in_at: '2026-07-01T10:00:00Z', email_confirmed_at: '2026-05-02T04:10:00Z', is_admin: false, is_disabled: true },
];
const mockIntents = [
  { id: 'i1', email: 'demo-bookkeeper@example.com', use_case: '银行流水', company_size: '1-10', intended_plan: 'pro', created_at: '2026-08-20T08:00:00Z', follow_status: 'new', follow_note: '' },
  { id: 'i2', email: 'finance@example.com', use_case: '应收回款', company_size: '11-50', intended_plan: 'pro', created_at: '2026-08-22T11:20:00Z', follow_status: 'contacted', follow_note: '已电话确认' },
];
const mockFeedback = [
  { id: 'f1', created_at: '2026-08-28T09:12:00Z', name: '林青', title: '银行导入', message: '导入预览后想批量确认匹配。', contact: 'qing@example.com', status: 'new' },
  { id: 'f2', created_at: '2026-08-21T14:40:00Z', name: '周敏', title: '月结导出', message: '希望月底导出能带上未匹配流水。', contact: 'min@example.com', status: 'processing' },
];

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function filteredUsers() {
  const q = (document.getElementById('user-search')?.value || '').trim().toLowerCase();
  const role = document.getElementById('user-role-filter')?.value || '';
  const status = document.getElementById('user-status-filter')?.value || '';
  return usersCache.filter((user) => {
    const hay = `${user.email || ''} ${user.name || ''}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (role === 'admin' && !user.is_admin) return false;
    if (role === 'user' && user.is_admin) return false;
    if (status === 'disabled' && !user.is_disabled) return false;
    if (status === 'active' && (user.is_disabled || !user.email_confirmed_at)) return false;
    if (status === 'unverified' && user.email_confirmed_at) return false;
    return true;
  });
}

function renderUsers() {
  const list = document.getElementById('users-list');
  const emptyBox = document.getElementById('users-empty');
  if (!list) return;
  list.replaceChildren();
  const overview = document.getElementById('overview-users');
  if (usersLoadState !== 'ok') {
    if (overview) overview.textContent = '—';
    const title = usersLoadState === 'missing'
      ? '尚未启用用户管理'
      : usersLoadState === 'permission'
        ? '没有权限查看用户'
        : '用户列表加载失败';
    setEmptyState(emptyBox, title, setupHint(usersLoadState, 'supabase/admin-users.sql'));
    return;
  }
  const filtered = filteredUsers();
  const page = paginate(filtered, usersPage);
  usersPage = page.current;
  const rows = page.slice;
  renderPager(document.getElementById('users-pager'), page, (next) => { usersPage = next; renderUsers(); });
  if (overview) overview.textContent = String(usersCache.length);
  if (!rows.length) {
    const filtered = (document.getElementById('user-search')?.value || '') || document.getElementById('user-role-filter')?.value || document.getElementById('user-status-filter')?.value;
    setEmptyState(
      emptyBox,
      usersCache.length && filtered ? '没有符合条件的用户。' : '还没有注册用户。',
      usersCache.length && filtered ? '可清空搜索或筛选后再试。' : ''
    );
  } else {
    hideEmpty(emptyBox);
  }
  rows.forEach((user) => {
    const tr = document.createElement('tr');
    const who = document.createElement('td');
    who.innerHTML = `<div class="user-cell"><b></b><span></span></div>`;
    who.querySelector('b').textContent = user.name || '未命名';
    who.querySelector('span').textContent = user.email || '';
    who.style.cursor = 'pointer';
    who.addEventListener('click', () => window.AdminOps?.openDossier?.(user.email, user));
    const role = document.createElement('td');
    role.innerHTML = `<span class="role-pill ${user.is_admin ? 'admin' : 'user'}">${user.is_admin ? '管理员' : '普通用户'}</span>`;
    const status = document.createElement('td');
    const statusText = user.is_disabled ? '已停用' : user.email_confirmed_at ? '正常' : '未验证';
    const statusClass = user.is_disabled ? 'off' : user.email_confirmed_at ? 'ok' : 'wait';
    status.innerHTML = `<span class="status-pill ${statusClass}"></span>`;
    status.querySelector('span').textContent = statusText;
    const created = document.createElement('td');
    created.textContent = formatTime(user.created_at);
    const seen = document.createElement('td');
    seen.textContent = formatTime(user.last_sign_in_at);
    const actions = document.createElement('td');
    actions.className = 'row-actions';
    const adminBtn = document.createElement('button');
    adminBtn.className = 'secondary';
    adminBtn.textContent = user.is_admin ? '取消管理员' : '设为管理员';
    adminBtn.addEventListener('click', () => setUserAdmin(user, !user.is_admin));
    const disableBtn = document.createElement('button');
    disableBtn.className = user.is_disabled ? 'secondary' : 'delete';
    disableBtn.textContent = user.is_disabled ? '启用' : '停用';
    disableBtn.addEventListener('click', () => setUserDisabled(user, !user.is_disabled));
    const detailBtn = document.createElement('button');
    detailBtn.className = 'secondary';
    detailBtn.textContent = '详情';
    detailBtn.addEventListener('click', () => window.AdminOps?.openDossier?.(user.email, user));
    actions.append(adminBtn, disableBtn, detailBtn);
    tr.append(who, role, status, created, seen, actions);
    list.append(tr);
  });
}

async function loadUsers() {
  const msg = document.getElementById('users-message');
  if (isPreview() && !getSession()) {
    usersLoadState = 'ok';
    usersCache = mockUsers;
    renderUsers();
    paintOverviewExtras();
    setMessage(msg, '当前为界面预览数据，正式环境登录后显示真实用户。');
    return;
  }
  setMessage(msg, '正在加载用户……');
  try {
    const response = await request('rpc/admin_list_users', { method: 'POST', body: '{}' });
    const data = await response.json();
    usersLoadState = 'ok';
    usersCache = Array.isArray(data) ? data : [];
    renderUsers();
    paintOverviewExtras();
    setMessage(msg, `共 ${usersCache.length} 个账号`);
    setPageSummary(`用户 ${usersCache.length} 个`);
  } catch (error) {
    usersLoadState = classifyError(error);
    usersCache = [];
    const hint = setupHint(usersLoadState, 'supabase/admin-users.sql') || error.message;
    setMessage(msg, hint, true);
    renderUsers();
    setPageSummary('用户管理不可用');
  }
}

async function setUserAdmin(user, isAdmin) {
  if (isPreview() && !getSession()) {
    user.is_admin = isAdmin;
    renderUsers();
    return;
  }
  try {
    await request('rpc/admin_set_user_admin', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: user.id, p_is_admin: isAdmin }),
    });
    await loadUsers();
  } catch (error) {
    setMessage(document.getElementById('users-message'), error.message, true);
  }
}

async function setUserDisabled(user, disabled) {
  const label = disabled ? '停用' : '启用';
  if (!confirm(`确定${label}「${user.email}」吗？`)) return;
  if (isPreview() && !getSession()) {
    user.is_disabled = disabled;
    renderUsers();
    return;
  }
  try {
    await request('rpc/admin_set_user_disabled', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: user.id, p_disabled: disabled }),
    });
    await loadUsers();
  } catch (error) {
    setMessage(document.getElementById('users-message'), error.message, true);
  }
}

function updateOverview() {
  const views = document.getElementById('total-views')?.textContent;
  const uses = document.getElementById('total-uses')?.textContent;
  if (views) document.getElementById('overview-views').textContent = views;
  if (uses) document.getElementById('overview-uses').textContent = uses;
}

const originalRenderAnalytics = renderAnalytics;
renderAnalytics = function(data, range) {
  originalRenderAnalytics(data, range);
  updateOverview();
};

const originalRenderRows = renderRows;
renderRows = function(rows) {
  originalRenderRows(rows);
  document.getElementById('overview-feedback').textContent = String(rows.length);
};

function filteredIntents() {
  const q = (document.getElementById('intent-search')?.value || '').trim().toLowerCase();
  const use = document.getElementById('intent-use-filter')?.value || '';
  const size = document.getElementById('intent-size-filter')?.value || '';
  const follow = document.getElementById('intent-follow-filter')?.value || '';
  return intentsCache.filter((row) => {
    if (q && !(row.email || '').toLowerCase().includes(q)) return false;
    if (use && row.use_case !== use) return false;
    if (size && row.company_size !== size) return false;
    if (follow && (row.follow_status || 'new') !== follow) return false;
    return true;
  });
}

function renderIntents() {
  const list = document.getElementById('intents-list');
  const emptyBox = document.getElementById('intents-empty');
  const overview = document.getElementById('overview-intents');
  const badge = document.getElementById('intents-count');
  if (!list) return;
  list.replaceChildren();
  if (intentsLoadState !== 'ok') {
    if (overview) overview.textContent = '—';
    if (badge) badge.hidden = true;
    const title = intentsLoadState === 'missing'
      ? '尚未启用购买意向列表'
      : intentsLoadState === 'permission'
        ? '没有权限查看购买意向'
        : '购买意向加载失败';
    setEmptyState(emptyBox, title, setupHint(intentsLoadState, 'supabase/admin-ops.sql'));
    return;
  }
  const filtered = filteredIntents();
  const page = paginate(filtered, intentsPage);
  intentsPage = page.current;
  const rows = page.slice;
  renderPager(document.getElementById('intents-pager'), page, (next) => { intentsPage = next; renderIntents(); });
  if (overview) overview.textContent = String(intentsCache.length);
  if (badge) {
    badge.hidden = intentsCache.length === 0;
    badge.textContent = String(intentsCache.length);
  }
  if (!rows.length) {
    const filtered = document.getElementById('intent-search')?.value || document.getElementById('intent-use-filter')?.value || document.getElementById('intent-size-filter')?.value;
    setEmptyState(
      emptyBox,
      intentsCache.length && filtered ? '没有符合当前筛选的购买意向。' : '暂无购买意向。',
      intentsCache.length && filtered ? '可重置筛选后再查询。' : '用户在首页或专业版提交「我愿意购买」后会出现在这里，仅供只读查看。'
    );
    return;
  }
  hideEmpty(emptyBox);
  const followLabels = { new: '未联系', contacted: '已联系', follow_up: '待回访', closed: '已关闭' };
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const timeTd = document.createElement('td');
    timeTd.textContent = formatTime(row.created_at);
    const emailTd = document.createElement('td');
    const emailBtn = document.createElement('button');
    emailBtn.type = 'button';
    emailBtn.className = 'linkish';
    emailBtn.textContent = row.email || '—';
    if (row.email) emailBtn.addEventListener('click', () => window.AdminOps?.openDossier?.(row.email));
    emailTd.append(emailBtn);
    tr.append(timeTd, emailTd);
    [row.use_case || '—', row.company_size || '—', row.intended_plan || 'pro'].forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    });
    const followTd = document.createElement('td');
    const select = document.createElement('select');
    Object.entries(followLabels).forEach(([value, label]) => {
      select.add(new Option(label, value, value === (row.follow_status || 'new'), value === (row.follow_status || 'new')));
    });
    followTd.append(select);
    const noteTd = document.createElement('td');
    const note = document.createElement('input');
    note.type = 'text';
    note.maxLength = 500;
    note.value = row.follow_note || '';
    note.placeholder = '跟进备注';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'secondary';
    save.textContent = '保存';
    save.addEventListener('click', () => window.AdminOps?.saveIntentFollowup?.(row, select.value, note.value));
    noteTd.append(note, save);
    tr.append(followTd, noteTd);
    list.append(tr);
  });
}

async function loadIntents() {
  const msg = document.getElementById('intents-message');
  if (isPreview() && !getSession()) {
    intentsLoadState = 'ok';
    intentsCache = mockIntents;
    renderIntents();
    paintOverviewExtras();
    setMessage(msg, '当前为界面预览数据，正式环境登录后显示真实意向。');
    return;
  }
  setMessage(msg, '正在加载购买意向……');
  try {
    const response = await request('rpc/admin_list_purchase_intents', { method: 'POST', body: '{}' });
    const data = await response.json();
    intentsLoadState = 'ok';
    intentsCache = Array.isArray(data) ? data : [];
    renderIntents();
    paintOverviewExtras();
    setMessage(msg, `共 ${intentsCache.length} 条意向`);
    setPageSummary(`购买意向 ${intentsCache.length} 条（只读）`);
  } catch (error) {
    intentsLoadState = classifyError(error);
    intentsCache = [];
    const hint = setupHint(intentsLoadState, 'supabase/admin-ops.sql') || error.message;
    setMessage(msg, hint, true);
    renderIntents();
    setPageSummary('购买意向不可用');
  }
}

async function refreshAll() {
  const button = document.getElementById('refresh');
  if (button) button.disabled = true;
  setPageSummary('正在刷新……');
  try {
    await Promise.all([
      loadFeedback(),
      loadAnalytics(),
      loadUsers(),
      loadIntents(),
      window.AdminOps?.loadPromotions?.(),
      window.AdminOps?.loadEntitlements?.(),
      window.AdminOps?.loadFunnel?.(),
      window.AdminOps?.loadLogs?.(true),
    ]);
    await window.AdminOps?.loadOverviewStats?.();
    const page = document.querySelector('.side-link.active')?.dataset.page || 'overview';
    if (page === 'overview') setPageSummary('工作台数据已刷新');
  } finally {
    if (button) button.disabled = false;
  }
}

document.getElementById('user-search')?.addEventListener('input', () => { usersPage = 1; renderUsers(); });
document.getElementById('user-role-filter')?.addEventListener('change', () => { usersPage = 1; renderUsers(); });
document.getElementById('user-status-filter')?.addEventListener('change', () => { usersPage = 1; renderUsers(); });
document.getElementById('intents-filter-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  intentsPage = 1;
  renderIntents();
});
document.getElementById('reset-intent-filter')?.addEventListener('click', () => {
  document.getElementById('intents-filter-form')?.reset();
  intentsPage = 1;
  renderIntents();
});
document.getElementById('intent-search')?.addEventListener('input', () => { intentsPage = 1; renderIntents(); });
document.getElementById('intent-use-filter')?.addEventListener('change', () => { intentsPage = 1; renderIntents(); });
document.getElementById('intent-size-filter')?.addEventListener('change', () => { intentsPage = 1; renderIntents(); });
document.getElementById('intent-follow-filter')?.addEventListener('change', () => { intentsPage = 1; renderIntents(); });

