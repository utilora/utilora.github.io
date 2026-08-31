(() => {
  const OPS_SQL = 'supabase/admin-ops.sql';
  const GRANT_SQL = 'supabase/migrations/202608310001_admin_grant_entitlement.sql';
  const FOLLOW_SQL = 'supabase/migrations/202608310003_admin_intent_followup.sql';
  const ANNOUNCE_SQL = 'supabase/migrations/202608310010_announcements.sql';
  const TRIAL_DAYS_DEFAULT = 14;
  const LOG_PAGE = 50;
  let promotionsCache = [];
  let announcementsCache = [];
  let grantsCache = [];
  let logsOffset = 0;
  let logsTotal = 0;
  let promotionsState = 'ok';
  let grantsState = 'ok';
  let logsState = 'ok';

  const yuan = (cents) => `¥${(Number(cents || 0) / 100).toFixed(2)}`;

  const mockPromos = [{
    id: 'p1',
    code: 'pro-launch-free',
    name: '财务专业版内测限免',
    plan_code: 'pro_trial',
    audience: 'authenticated',
    starts_at: '2026-08-01T00:00:00Z',
    ends_at: null,
    is_active: true,
    config: { control: 'production', payment_required: false, list_price_cents: 1900, promo_price_cents: 0, discount_percent: 100 },
  }];

  const mockGrants = [{
    id: 'g1',
    email: 'li@example.com',
    plan_code: 'pro_trial',
    source: 'promotion',
    starts_at: '2026-08-18T00:00:00Z',
    ends_at: null,
  }];

  const mockLogs = {
    total: 4,
    items: [
      { created_at: '2026-08-30T10:00:00Z', email: 'admin@utilora.local', event_type: 'login', category: 'auth', path: '/admin/', detail: { client: 'admin' }, source: 'activity' },
      { created_at: '2026-08-30T09:40:00Z', email: 'li@example.com', event_type: 'logout', category: 'auth', path: '/account/', detail: {}, source: 'activity' },
      { created_at: '2026-08-30T09:10:00Z', email: 'li@example.com', event_type: 'login', category: 'auth', path: '/login/', detail: { source: 'password' }, source: 'activity' },
      { created_at: '2026-08-30T08:12:00Z', email: null, event_type: 'workspace_enter', category: 'product', path: '/pro/', detail: {}, source: 'analytics' },
    ],
  };

  function asArray(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  }

  function fill(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  async function loadPromotions() {
    const msg = document.getElementById('promotions-message');
    if (isPreview() && !getSession()) {
      promotionsState = 'ok';
      promotionsCache = mockPromos;
      renderPromotions();
      paintLaunchPromo();
      setMessage(msg, '当前为界面预览数据。');
      return;
    }
    setMessage(msg, '正在加载折扣……');
    try {
      const response = await request('rpc/admin_list_promotions', { method: 'POST', body: '{}' });
      const data = await response.json();
      promotionsState = 'ok';
      promotionsCache = asArray(data);
      renderPromotions();
      paintLaunchPromo();
      setMessage(msg, `共 ${promotionsCache.length} 条，支付未接通`);
      setPageSummary(`折扣 ${promotionsCache.length} 条`);
    } catch (error) {
      promotionsState = classifyError(error);
      promotionsCache = [];
      setMessage(msg, setupHint(promotionsState, OPS_SQL) || error.message, true);
      renderPromotions();
    }
  }

  function renderPromotions() {
    const list = document.getElementById('promotions-list');
    const emptyBox = document.getElementById('promotions-empty');
    if (!list) return;
    list.replaceChildren();
    const active = promotionsCache.filter((row) => row.is_active).length;
    fill('overview-promos', promotionsState === 'ok' ? String(active) : '—');
    if (promotionsState !== 'ok') {
      setEmptyState(emptyBox, promotionsState === 'missing' ? '尚未启用折扣管理' : '折扣加载失败', setupHint(promotionsState, OPS_SQL));
      return;
    }
    if (!promotionsCache.length) {
      setEmptyState(emptyBox, '还没有折扣配置。', '保存后写入 promotions，不连接支付。');
      return;
    }
    hideEmpty(emptyBox);
    promotionsCache.forEach((row) => {
      const cfg = row.config || {};
      const tr = document.createElement('tr');
      const cells = [
        row.code,
        row.name,
        row.plan_code,
        `${cfg.discount_percent ?? '—'}%`,
        `${yuan(cfg.list_price_cents)} → ${yuan(cfg.promo_price_cents)}`,
        `${row.starts_at ? new Date(row.starts_at).toLocaleString() : '—'} ~ ${row.ends_at ? new Date(row.ends_at).toLocaleString() : '长期'}`,
      ];
      cells.forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      });
      const status = document.createElement('td');
      status.innerHTML = `<span class="status-pill ${row.is_active ? 'ok' : 'off'}"></span>`;
      status.querySelector('span').textContent = row.is_active ? '生效' : '停用';
      const use = document.createElement('button');
      use.type = 'button';
      use.className = 'secondary';
      use.textContent = '填入表单';
      use.addEventListener('click', () => fillPromoForm(row));
      status.append(use);
      tr.append(status);
      list.append(tr);
    });
  }

  function launchPromoRow() {
    return promotionsCache.find((row) => row.code === 'pro-launch-free') || null;
  }

  function paintLaunchPromo() {
    const state = document.getElementById('launch-promo-state');
    const off = document.getElementById('launch-promo-off');
    const on = document.getElementById('launch-promo-on');
    if (!state) return;
    const row = launchPromoRow();
    const active = Boolean(row?.is_active);
    state.textContent = active
      ? '当前开启：已登录用户可免费使用专业工作台。'
      : '当前关闭：只有单独发放过权益的用户能进专业工作台。';
    if (off) off.disabled = !active && Boolean(row);
    if (on) on.disabled = active;
    const em = document.querySelector('[data-page="promotions"] em');
    if (em) em.textContent = active ? '全员限免开启' : '全员限免已关';
  }

  async function setLaunchPromo(active) {
    const msg = document.getElementById('promotions-message');
    const row = launchPromoRow();
    const cfg = row?.config || {};
    if (active && !window.confirm('开启后，所有已登录用户可免费使用专业工作台。仍不接入支付。确定开启？')) return;
    if (!active && !window.confirm('关闭后，未单独发放权益的登录用户将不能进入专业工作台。仍不接入支付。确定关闭全员限免？')) return;
    const payload = {
      p_code: 'pro-launch-free',
      p_name: row?.name || '财务专业版内测限免',
      p_plan_code: row?.plan_code || 'pro_trial',
      p_audience: 'authenticated',
      p_starts_at: row?.starts_at || new Date().toISOString(),
      p_ends_at: active ? null : (row?.ends_at || new Date().toISOString()),
      p_is_active: Boolean(active),
      p_list_price_cents: Number(cfg.list_price_cents ?? 1900),
      p_promo_price_cents: Number(cfg.promo_price_cents ?? 0),
      p_discount_percent: Number(cfg.discount_percent ?? 100),
    };
    if (isPreview() && !getSession()) {
      if (row) row.is_active = Boolean(active);
      else promotionsCache.push({ ...payload, code: 'pro-launch-free', is_active: Boolean(active), config: cfg });
      renderPromotions();
      paintLaunchPromo();
      setMessage(msg, '预览已更新，未写入生产。');
      return;
    }
    setMessage(msg, '正在保存……');
    try {
      await request('rpc/admin_upsert_promotion', { method: 'POST', body: JSON.stringify(payload) });
      setMessage(msg, active ? '全员限免已开启（未接支付）' : '全员限免已关闭（未接支付）');
      await loadPromotions();
    } catch (error) {
      setMessage(msg, setupHint(classifyError(error), OPS_SQL) || error.message, true);
    }
  }

  function toLocalInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function fillPromoForm(row) {
    const cfg = row.config || {};
    document.getElementById('promo-code').value = row.code || '';
    document.getElementById('promo-name').value = row.name || '';
    document.getElementById('promo-plan').value = row.plan_code || 'pro_trial';
    document.getElementById('promo-audience').value = row.audience || 'authenticated';
    document.getElementById('promo-start').value = toLocalInput(row.starts_at);
    document.getElementById('promo-end').value = toLocalInput(row.ends_at);
    document.getElementById('promo-list-price').value = cfg.list_price_cents ?? 1900;
    document.getElementById('promo-price').value = cfg.promo_price_cents ?? 0;
    document.getElementById('promo-discount').value = cfg.discount_percent ?? 0;
    document.getElementById('promo-active').checked = Boolean(row.is_active);
  }

  async function savePromotion(event) {
    event.preventDefault();
    const msg = document.getElementById('promotions-message');
    const code = document.getElementById('promo-code').value.trim();
    const active = document.getElementById('promo-active').checked;
    if (!active && code === 'pro-launch-free' && !window.confirm('关闭后，未单独发放权益的登录用户将不能进入专业工作台。确定关闭全员限免？')) {
      return;
    }
    const payload = {
      p_code: code,
      p_name: document.getElementById('promo-name').value.trim(),
      p_plan_code: document.getElementById('promo-plan').value,
      p_audience: document.getElementById('promo-audience').value,
      p_starts_at: new Date(document.getElementById('promo-start').value).toISOString(),
      p_ends_at: document.getElementById('promo-end').value ? new Date(document.getElementById('promo-end').value).toISOString() : null,
      p_is_active: document.getElementById('promo-active').checked,
      p_list_price_cents: Number(document.getElementById('promo-list-price').value || 0),
      p_promo_price_cents: Number(document.getElementById('promo-price').value || 0),
      p_discount_percent: Number(document.getElementById('promo-discount').value || 0),
    };
    if (isPreview() && !getSession()) {
      setMessage(msg, '预览模式不写入生产。');
      return;
    }
    setMessage(msg, '正在保存……');
    try {
      await request('rpc/admin_upsert_promotion', { method: 'POST', body: JSON.stringify(payload) });
      setMessage(msg, '折扣已保存（未接支付）');
      await loadPromotions();
    } catch (error) {
      setMessage(msg, setupHint(classifyError(error), OPS_SQL) || error.message, true);
    }
  }

  let announcementsState = 'ok';
  const mockAnnouncements = [{
    id: 'a1',
    title: '专业版内测说明',
    body: '当前内测免费，数据保存在你的浏览器。正式收费前会再通知。',
    is_active: true,
    created_at: '2026-08-31T02:00:00Z',
  }];

  async function loadAnnouncements() {
    const msg = document.getElementById('announcements-message');
    if (isPreview() && !getSession()) {
      announcementsState = 'ok';
      announcementsCache = mockAnnouncements;
      renderAnnouncements();
      setMessage(msg, '当前为界面预览数据。');
      return;
    }
    setMessage(msg, '正在加载公告……');
    try {
      const response = await request('rpc/admin_list_announcements', { method: 'POST', body: '{}' });
      announcementsState = 'ok';
      announcementsCache = asArray(await response.json());
      renderAnnouncements();
      setMessage(msg, `共 ${announcementsCache.length} 条`);
      setPageSummary(`公告 ${announcementsCache.length} 条`);
    } catch (error) {
      announcementsState = classifyError(error);
      announcementsCache = [];
      setMessage(msg, setupHint(announcementsState, ANNOUNCE_SQL) || error.message, true);
      renderAnnouncements();
    }
  }

  function renderAnnouncements() {
    const list = document.getElementById('announcements-list');
    const emptyBox = document.getElementById('announcements-empty');
    if (!list) return;
    list.replaceChildren();
    if (announcementsState !== 'ok') {
      setEmptyState(emptyBox, announcementsState === 'missing' ? '尚未启用公告' : '公告加载失败', setupHint(announcementsState, ANNOUNCE_SQL));
      return;
    }
    if (!announcementsCache.length) {
      setEmptyState(emptyBox, '还没有公告。', '保存后用户端会弹窗。');
      return;
    }
    hideEmpty(emptyBox);
    announcementsCache.forEach((row) => {
      const tr = document.createElement('tr');
      const title = document.createElement('td');
      title.textContent = row.title || '—';
      const body = document.createElement('td');
      body.textContent = (row.body || '').slice(0, 80);
      const status = document.createElement('td');
      status.innerHTML = `<span class="status-pill ${row.is_active ? 'ok' : 'off'}"></span>`;
      status.querySelector('span').textContent = row.is_active ? '发布中' : '未发布';
      const time = document.createElement('td');
      time.textContent = row.created_at ? new Date(row.created_at).toLocaleString() : '—';
      const actions = document.createElement('td');
      const use = document.createElement('button');
      use.type = 'button';
      use.className = 'secondary';
      use.textContent = '填入表单';
      use.addEventListener('click', () => fillAnnouncementForm(row));
      actions.append(use);
      tr.append(title, body, status, time, actions);
      list.append(tr);
    });
  }

  function fillAnnouncementForm(row) {
    document.getElementById('announcement-id').value = row.id || '';
    document.getElementById('announcement-title').value = row.title || '';
    document.getElementById('announcement-body').value = row.body || '';
    document.getElementById('announcement-active').checked = Boolean(row.is_active);
    document.getElementById('announcement-end').value = toLocalInput(row.ends_at);
  }

  function resetAnnouncementForm() {
    document.getElementById('announcement-form')?.reset();
    document.getElementById('announcement-id').value = '';
    document.getElementById('announcement-active').checked = true;
  }

  async function saveAnnouncement(event) {
    event.preventDefault();
    const msg = document.getElementById('announcements-message');
    const id = document.getElementById('announcement-id').value || null;
    const payload = {
      p_id: id,
      p_title: document.getElementById('announcement-title').value.trim(),
      p_body: document.getElementById('announcement-body').value.trim(),
      p_is_active: document.getElementById('announcement-active').checked,
      p_starts_at: id ? null : new Date().toISOString(),
      p_ends_at: document.getElementById('announcement-end').value
        ? new Date(document.getElementById('announcement-end').value).toISOString()
        : null,
    };
    if (isPreview() && !getSession()) {
      setMessage(msg, '预览模式不写入生产。');
      return;
    }
    setMessage(msg, '正在保存……');
    try {
      await request('rpc/admin_upsert_announcement', { method: 'POST', body: JSON.stringify(payload) });
      setMessage(msg, '公告已保存');
      resetAnnouncementForm();
      await loadAnnouncements();
    } catch (error) {
      setMessage(msg, setupHint(classifyError(error), ANNOUNCE_SQL) || error.message, true);
    }
  }

  async function loadEntitlements() {
    const msg = document.getElementById('entitlements-message');
    if (isPreview() && !getSession()) {
      grantsState = 'ok';
      grantsCache = mockGrants;
      renderEntitlements();
      setMessage(msg, '当前为界面预览数据。');
      return;
    }
    setMessage(msg, '正在加载权益……');
    try {
      const response = await request('rpc/admin_list_entitlements', { method: 'POST', body: '{}' });
      grantsState = 'ok';
      grantsCache = asArray(await response.json());
      renderEntitlements();
      setMessage(msg, `共 ${grantsCache.length} 条授予记录`);
      setPageSummary(`权益 ${grantsCache.length} 条`);
    } catch (error) {
      grantsState = classifyError(error);
      grantsCache = [];
      setMessage(msg, setupHint(grantsState, OPS_SQL) || error.message, true);
      renderEntitlements();
    }
  }

  function renderEntitlements() {
    const list = document.getElementById('entitlements-list');
    const emptyBox = document.getElementById('entitlements-empty');
    if (!list) return;
    list.replaceChildren();
    const q = (document.getElementById('grant-search')?.value || '').trim().toLowerCase();
    const rows = grantsCache.filter((row) => !q || (row.email || '').toLowerCase().includes(q));
    if (grantsState !== 'ok') {
      setEmptyState(emptyBox, grantsState === 'missing' ? '尚未启用权益一览' : '权益加载失败', setupHint(grantsState, OPS_SQL));
      return;
    }
    if (!rows.length) {
      setEmptyState(emptyBox, grantsCache.length ? '没有符合条件的记录。' : '暂无权益授予记录。', grantsCache.length ? '' : '内测限免可能只走 promotions。');
      return;
    }
    hideEmpty(emptyBox);
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      [row.email || '—', row.plan_code || '—', row.source || '—', formatTime(row.starts_at), row.ends_at ? formatTime(row.ends_at) : '长期'].forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      });
      list.append(tr);
    });
  }

  async function loadFunnel() {
    const apply = (counts, rangeLabel) => {
      const get = (key) => Number(counts?.[key] || 0).toLocaleString();
      fill('funnel-demo', get('demo_enter'));
      fill('funnel-pricing', get('pricing_view'));
      fill('funnel-intent', get('purchase_intent'));
      fill('funnel-login', get('login_success'));
      fill('funnel-workspace', get('workspace_enter'));
      fill('funnel-bank', get('bank_use'));
      fill('overview-demo', get('demo_enter'));
      const em = document.getElementById('overview-demo-range');
      if (em) em.textContent = rangeLabel || '查看漏斗';
    };
    const range = typeof selectedRange === 'function' ? selectedRange() : { days: 30, label: '最近 30 天' };
    if (isPreview() && !getSession()) {
      const title = document.getElementById('funnel-title');
      if (title) title.textContent = `商业化漏斗（${range.label || '预览'}）`;
      apply({ demo_enter: 18, pricing_view: 41, purchase_intent: 6, login_success: 22, workspace_enter: 14, bank_use: 9 }, range.label);
      return;
    }
    try {
      const title = document.getElementById('funnel-title');
      if (title) title.textContent = `商业化漏斗（${range.label || `最近 ${range.days} 天`}）`;
      const response = await request('rpc/admin_product_funnel', { method: 'POST', body: JSON.stringify({ p_days: range.days || 30 }) });
      const data = await response.json();
      apply(data.counts || data, range.label);
    } catch {
      ['funnel-demo', 'funnel-pricing', 'funnel-intent', 'funnel-login', 'funnel-workspace', 'funnel-bank', 'overview-demo'].forEach((id) => fill(id, '—'));
    }
  }

  function logFilters() {
    const start = document.getElementById('log-start')?.value;
    const end = document.getElementById('log-end')?.value;
    return {
      p_email: document.getElementById('log-email')?.value.trim() || null,
      p_event_type: document.getElementById('log-type')?.value || null,
      p_category: document.getElementById('log-category')?.value || null,
      p_start: start ? new Date(`${start}T00:00:00`).toISOString() : null,
      p_end: end ? new Date(`${end}T23:59:59.999`).toISOString() : null,
      p_limit: LOG_PAGE,
      p_offset: logsOffset,
    };
  }

  const categoryLabel = { auth: '登录登出', product: '产品操作', admin: '管理操作' };
  const sourceLabel = { activity: '账户日志', analytics: '埋点' };

  async function loadLogs(keepPage) {
    const msg = document.getElementById('logs-message');
    if (!keepPage) logsOffset = 0;
    if (isPreview() && !getSession()) {
      logsState = 'ok';
      logsTotal = mockLogs.total;
      renderLogs(mockLogs.items);
      setMessage(msg, '当前为界面预览数据。按账户搜索只覆盖带邮箱的登录/操作日志。');
      return;
    }
    setMessage(msg, '正在加载日志……');
    try {
      const response = await request('rpc/admin_list_activity_logs', { method: 'POST', body: JSON.stringify(logFilters()) });
      const data = await response.json();
      logsState = 'ok';
      logsTotal = Number(data.total || 0);
      renderLogs(asArray(data));
      setMessage(msg, `共 ${logsTotal} 条`);
      setPageSummary(`日志 ${logsTotal} 条`);
    } catch (error) {
      logsState = classifyError(error);
      logsTotal = 0;
      renderLogs([]);
      setMessage(msg, setupHint(logsState, OPS_SQL) || error.message, true);
    }
  }

  function renderLogs(items) {
    const list = document.getElementById('logs-list');
    const emptyBox = document.getElementById('logs-empty');
    if (!list) return;
    list.replaceChildren();
    if (logsState !== 'ok') {
      setEmptyState(emptyBox, logsState === 'missing' ? '尚未启用操作日志' : '日志加载失败', setupHint(logsState, OPS_SQL));
      document.getElementById('logs-pager').hidden = true;
      return;
    }
    if (!items.length) {
      setEmptyState(emptyBox, '没有符合条件的日志。', '可按账户邮箱、分类或类型筛选。邮箱搜索不包含无账号的匿名埋点。');
      document.getElementById('logs-pager').hidden = true;
      return;
    }
    hideEmpty(emptyBox);
    items.forEach((row) => {
      const tr = document.createElement('tr');
      const detail = row.detail && typeof row.detail === 'object' ? JSON.stringify(row.detail) : String(row.detail || '');
      const values = [
        formatTime(row.created_at),
        row.email || '—',
        categoryLabel[row.category] || row.category || '—',
        row.event_type || '—',
        row.path || '—',
        detail.slice(0, 160) || '—',
        sourceLabel[row.source] || row.source || '—',
      ];
      values.forEach((value, index) => {
        const td = document.createElement('td');
        if (index === 1 && row.email) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'linkish';
          btn.textContent = row.email;
          btn.addEventListener('click', () => openDossier(row.email));
          td.append(btn);
        } else {
          td.textContent = value;
        }
        tr.append(td);
      });
      list.append(tr);
    });
    const pages = Math.max(1, Math.ceil(logsTotal / LOG_PAGE));
    const current = Math.floor(logsOffset / LOG_PAGE) + 1;
    renderPager(document.getElementById('logs-pager'), { current, pages, total: logsTotal }, (next) => {
      logsOffset = (next - 1) * LOG_PAGE;
      loadLogs(true);
    });
  }

  async function saveIntentFollowup(row, status, note, nextFollowOn, result, trialGranted) {
    const msg = document.getElementById('intents-message');
    if (isPreview() && !getSession()) {
      row.follow_status = status;
      row.follow_note = note;
      row.next_follow_on = nextFollowOn || null;
      row.follow_result = result || null;
      row.trial_granted = Boolean(trialGranted);
      renderIntents();
      setMessage(msg, '预览已更新，未写入生产。');
      return;
    }
    try {
      await request('rpc/admin_set_purchase_intent_followup', {
        method: 'POST',
        body: JSON.stringify({
          p_intent_id: row.id,
          p_status: status,
          p_note: note,
          p_next_follow_on: nextFollowOn || null,
          p_result: result || null,
          p_trial_granted: Boolean(trialGranted),
        }),
      });
      setMessage(msg, '跟进已保存');
      await loadIntents();
    } catch (error) {
      setMessage(msg, setupHint(classifyError(error), FOLLOW_SQL) || error.message, true);
    }
  }

  async function loadOverviewStats() {
    if (isPreview() && !getSession()) {
      paintOverviewExtras();
      return;
    }
    try {
      const response = await request('rpc/admin_overview_stats', { method: 'POST', body: '{}' });
      const data = await response.json();
      fill('overview-new-users', data.new_users_today);
      fill('overview-signins', data.signins_today);
      fill('overview-open-intents', data.open_intents);
      fill('overview-feedback', data.new_feedback ?? '—');
      fill('todo-feedback', data.new_feedback ?? '—');
      fill('todo-intents', data.open_intents ?? '—');
      fill('todo-risk', data.abnormal_registrations_today ?? '—');
    } catch {
      paintOverviewExtras();
    }
  }

  let dossierEmail = '';
  let dossierUser = null;

  function closeDossier() {
    const panel = document.getElementById('dossier');
    if (panel) panel.hidden = true;
    dossierEmail = '';
    dossierUser = null;
  }

  function fillDl(el, pairs) {
    if (!el) return;
    el.replaceChildren();
    pairs.forEach(([key, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = key;
      const dd = document.createElement('dd');
      dd.textContent = value;
      el.append(dt, dd);
    });
  }

  function planLabel(code) {
    if (code === 'pro_trial') return '专业版试用';
    if (code === 'pro') return '财务专业版';
    return code || '—';
  }

  function paintDossierGrants(email) {
    const grantsBox = document.getElementById('dossier-grants');
    if (!grantsBox) return;
    grantsBox.replaceChildren();
    const grants = (grantsCache || []).filter((row) => (row.email || '') === email);
    if (!grants.length) {
      const li = document.createElement('li');
      li.textContent = '没有单独授予记录（可能走生产折扣）。';
      grantsBox.append(li);
      return;
    }
    grants.forEach((row) => {
      const li = document.createElement('li');
      const active = !row.ends_at || new Date(row.ends_at) > new Date();
      li.textContent = `${planLabel(row.plan_code)} · ${row.source || 'grant'} · ${row.ends_at ? formatTime(row.ends_at) : '长期'}${active ? '' : ' · 已结束'}`;
      grantsBox.append(li);
    });
  }

  function setGrantFormVisible(canGrant) {
    const form = document.getElementById('dossier-grant-form');
    const missing = document.getElementById('dossier-grant-unavailable');
    if (form) form.hidden = !canGrant;
    if (missing) missing.hidden = canGrant;
  }

  function resetGrantForm() {
    const plan = document.getElementById('dossier-grant-plan');
    const days = document.getElementById('dossier-grant-days');
    const note = document.getElementById('dossier-grant-note');
    if (plan) plan.value = 'pro_trial';
    if (days) days.value = String(TRIAL_DAYS_DEFAULT);
    if (note) note.value = '';
  }

  function parseGrantDays(plan) {
    const raw = (document.getElementById('dossier-grant-days')?.value || '').trim();
    if (plan === 'pro' && (raw === '' || raw === '0')) return null;
    const days = raw === '' ? TRIAL_DAYS_DEFAULT : Number(raw);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new Error('天数须为 1 到 3650 的整数；专业版可留空表示长期。');
    }
    return days;
  }

  async function grantEntitlement(event) {
    event?.preventDefault();
    const msg = document.getElementById('dossier-message');
    if (!dossierUser?.id) {
      setMessage(msg, '未匹配到注册用户，不能发放。', true);
      return;
    }
    const plan = document.getElementById('dossier-grant-plan')?.value || 'pro_trial';
    const note = (document.getElementById('dossier-grant-note')?.value || '').trim();
    let days;
    try {
      days = parseGrantDays(plan);
    } catch (error) {
      setMessage(msg, error.message, true);
      return;
    }
    const what = plan === 'pro_trial'
      ? `专业版试用 ${days} 天`
      : (days ? `财务专业版 ${days} 天` : '财务专业版（长期）');
    if (!confirm(`确定给「${dossierUser.email}」发放${what}吗？`)) return;
    if (isPreview() && !getSession()) {
      grantsCache = [{
        id: `g${Date.now()}`,
        email: dossierUser.email,
        plan_code: plan,
        source: plan === 'pro_trial' ? 'admin_trial' : 'admin_grant',
        starts_at: new Date().toISOString(),
        ends_at: days ? new Date(Date.now() + days * 86400000).toISOString() : null,
      }, ...grantsCache];
      paintDossierGrants(dossierEmail);
      renderEntitlements();
      setMessage(msg, `预览已发放${what}，未写入生产。`);
      return;
    }
    try {
      await request('rpc/admin_grant_entitlement', {
        method: 'POST',
        body: JSON.stringify({
          p_user_id: dossierUser.id,
          p_plan_code: plan,
          p_days: days,
          p_note: note || null,
        }),
      });
      await loadEntitlements();
      paintDossierGrants(dossierEmail);
      setMessage(msg, `已发放${what}`);
    } catch (error) {
      setMessage(msg, setupHint(classifyError(error), GRANT_SQL) || error.message, true);
    }
  }

  async function revokeEntitlements() {
    const msg = document.getElementById('dossier-message');
    if (!dossierUser?.id) {
      setMessage(msg, '未匹配到注册用户，不能收回。', true);
      return;
    }
    if (!confirm(`确定收回「${dossierUser.email}」当前生效的专业版权益吗？`)) return;
    const note = (document.getElementById('dossier-grant-note')?.value || '').trim();
    if (isPreview() && !getSession()) {
      const now = new Date().toISOString();
      grantsCache = grantsCache.map((row) => (
        row.email === dossierUser.email && (!row.ends_at || new Date(row.ends_at) > new Date())
          ? { ...row, ends_at: now, source: row.source || 'admin_grant' }
          : row
      ));
      paintDossierGrants(dossierEmail);
      renderEntitlements();
      setMessage(msg, '预览已收回当前权益，未写入生产。');
      return;
    }
    try {
      const response = await request('rpc/admin_revoke_entitlements', {
        method: 'POST',
        body: JSON.stringify({ p_user_id: dossierUser.id, p_note: note || null }),
      });
      const count = await response.json();
      await loadEntitlements();
      paintDossierGrants(dossierEmail);
      setMessage(msg, `已收回 ${Number(count) || 0} 条生效权益`);
    } catch (error) {
      setMessage(msg, setupHint(classifyError(error), GRANT_SQL) || error.message, true);
    }
  }

  async function openDossier(email, user) {
    const panel = document.getElementById('dossier');
    if (!panel || !email) return;
    dossierEmail = email;
    const found = user || (typeof usersCache !== 'undefined' ? usersCache.find((row) => row.email === email) : null);
    dossierUser = found || null;
    panel.hidden = false;
    document.getElementById('dossier-title').textContent = email;
    fillDl(document.getElementById('dossier-account'), [
      ['昵称', found?.name || '—'],
      ['角色', found?.is_admin ? '管理员' : '普通用户'],
      ['状态', found?.is_disabled ? '已停用' : found?.email_confirmed_at ? '正常' : found ? '未验证' : '未在用户列表中'],
      ['注册', found ? formatTime(found.created_at) : '—'],
      ['最近登录', found ? formatTime(found.last_sign_in_at) : '—'],
    ]);
    document.getElementById('dossier-meta').textContent = found ? '来自用户管理与最近日志' : '该邮箱未匹配到注册用户，仍可查看日志。';
    resetGrantForm();
    setGrantFormVisible(Boolean(found?.id));
    paintDossierGrants(email);
    const logsBody = document.getElementById('dossier-logs');
    logsBody.replaceChildren();
    setMessage(document.getElementById('dossier-message'), '正在加载最近日志……');
    try {
      let items = [];
      if (isPreview() && !getSession()) {
        items = mockLogs.items.filter((row) => row.email === email);
      } else {
        const response = await request('rpc/admin_list_activity_logs', {
          method: 'POST',
          body: JSON.stringify({ p_email: email, p_limit: 20, p_offset: 0 }),
        });
        const data = await response.json();
        items = asArray(data);
      }
      if (!items.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.textContent = '没有带该邮箱的日志。';
        tr.append(td);
        logsBody.append(tr);
      } else {
        items.forEach((row) => {
          const tr = document.createElement('tr');
          [formatTime(row.created_at), categoryLabel[row.category] || row.category || '—', row.event_type || '—', row.path || '—'].forEach((value) => {
            const td = document.createElement('td');
            td.textContent = value;
            tr.append(td);
          });
          logsBody.append(tr);
        });
      }
      setMessage(document.getElementById('dossier-message'), '');
    } catch (error) {
      setMessage(document.getElementById('dossier-message'), setupHint(classifyError(error), OPS_SQL) || error.message, true);
    }
  }

  function exportCurrent(kind) {
    const stamp = todayISO();
    if (kind === 'users') {
      downloadCsv(`utilora-users-${stamp}.csv`, ['邮箱', '昵称', '角色', '状态', '注册时间', '最近登录'], filteredUsers().map((user) => [
        user.email || '',
        user.name || '',
        user.is_admin ? '管理员' : '普通用户',
        user.is_disabled ? '已停用' : user.email_confirmed_at ? '正常' : '未验证',
        user.created_at || '',
        user.last_sign_in_at || '',
      ]));
      return;
    }
    if (kind === 'intents') {
      downloadCsv(`utilora-intents-${stamp}.csv`, ['时间', '邮箱', '用途', '规模', '方案', '跟进', '下次跟进', '结果', '已发试用', '备注'], filteredIntents().map((row) => [
        row.created_at || '',
        row.email || '',
        row.use_case || '',
        row.company_size || '',
        row.intended_plan || '',
        row.follow_status || 'new',
        (row.next_follow_on || '').toString().slice(0, 10),
        row.follow_result || '',
        row.trial_granted ? '是' : '',
        row.follow_note || '',
      ]));
      return;
    }
    if (kind === 'feedback') {
      downloadCsv(`utilora-feedback-${stamp}.csv`, ['时间', '称呼', '功能', '说明', '联系方式', '状态'], (feedbackCache || []).map((row) => [
        row.created_at || '',
        row.name || '',
        row.title || '',
        row.message || '',
        row.contact || '',
        row.status || '',
      ]));
      return;
    }
    if (kind === 'promos') {
      downloadCsv(`utilora-promotions-${stamp}.csv`, ['代码', '名称', '方案', '折扣%', '标价分', '促销价分', '开始', '结束', '生效'], promotionsCache.map((row) => [
        row.code || '',
        row.name || '',
        row.plan_code || '',
        row.config?.discount_percent ?? '',
        row.config?.list_price_cents ?? '',
        row.config?.promo_price_cents ?? '',
        row.starts_at || '',
        row.ends_at || '',
        row.is_active ? '是' : '否',
      ]));
      return;
    }
    if (kind === 'grants') {
      const q = (document.getElementById('grant-search')?.value || '').trim().toLowerCase();
      const rows = grantsCache.filter((row) => !q || (row.email || '').toLowerCase().includes(q));
      downloadCsv(`utilora-entitlements-${stamp}.csv`, ['邮箱', '方案', '来源', '开始', '结束'], rows.map((row) => [
        row.email || '',
        row.plan_code || '',
        row.source || '',
        row.starts_at || '',
        row.ends_at || '',
      ]));
    }
  }

  async function exportLogs() {
    const stamp = todayISO();
    let items = [];
    if (isPreview() && !getSession()) {
      items = mockLogs.items;
    } else {
      const filters = logFilters();
      filters.p_limit = 200;
      filters.p_offset = 0;
      const response = await request('rpc/admin_list_activity_logs', { method: 'POST', body: JSON.stringify(filters) });
      const data = await response.json();
      items = asArray(data);
    }
    downloadCsv(`utilora-logs-${stamp}.csv`, ['时间', '账户', '分类', '类型', '路径', '详情', '来源'], items.map((row) => [
      row.created_at || '',
      row.email || '',
      row.category || '',
      row.event_type || '',
      row.path || '',
      row.detail && typeof row.detail === 'object' ? JSON.stringify(row.detail) : String(row.detail || ''),
      row.source || '',
    ]));
  }

  document.getElementById('promo-form')?.addEventListener('submit', savePromotion);
  document.getElementById('announcement-form')?.addEventListener('submit', saveAnnouncement);
  document.getElementById('announcement-reset')?.addEventListener('click', resetAnnouncementForm);
  document.getElementById('launch-promo-off')?.addEventListener('click', () => setLaunchPromo(false));
  document.getElementById('launch-promo-on')?.addEventListener('click', () => setLaunchPromo(true));
  document.getElementById('grant-search')?.addEventListener('input', renderEntitlements);
  document.getElementById('logs-filter-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    loadLogs();
  });
  document.getElementById('reset-log-filter')?.addEventListener('click', () => {
    document.getElementById('logs-filter-form')?.reset();
    loadLogs();
  });
  document.getElementById('export-users')?.addEventListener('click', () => exportCurrent('users'));
  document.getElementById('export-intents')?.addEventListener('click', () => exportCurrent('intents'));
  document.getElementById('export-feedback')?.addEventListener('click', () => exportCurrent('feedback'));
  document.getElementById('export-promos')?.addEventListener('click', () => exportCurrent('promos'));
  document.getElementById('export-grants')?.addEventListener('click', () => exportCurrent('grants'));
  document.getElementById('export-logs')?.addEventListener('click', () => {
    exportLogs().catch((error) => setMessage(document.getElementById('logs-message'), error.message, true));
  });
  document.getElementById('dossier-close')?.addEventListener('click', closeDossier);
  document.getElementById('dossier-grant-form')?.addEventListener('submit', (event) => {
    grantEntitlement(event).catch((error) => setMessage(document.getElementById('dossier-message'), error.message, true));
  });
  document.getElementById('dossier-revoke')?.addEventListener('click', () => {
    revokeEntitlements().catch((error) => setMessage(document.getElementById('dossier-message'), error.message, true));
  });
  document.getElementById('dossier')?.addEventListener('click', (event) => {
    if (event.target.id === 'dossier') closeDossier();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.getElementById('dossier')?.hidden) closeDossier();
  });
  document.getElementById('dossier-open-logs')?.addEventListener('click', () => {
    const email = dossierEmail;
    closeDossier();
    const input = document.getElementById('log-email');
    if (input) input.value = email || '';
    switchPage('logs');
    loadLogs();
  });
  document.getElementById('dossier-open-grants')?.addEventListener('click', () => {
    const email = dossierEmail;
    closeDossier();
    const input = document.getElementById('grant-search');
    if (input) input.value = email || '';
    switchPage('entitlements');
    renderEntitlements();
  });

  const start = document.getElementById('promo-start');
  if (start && !start.value) {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    start.value = local.toISOString().slice(0, 16);
  }

  window.AdminOps = {
    loadPromotions,
    loadAnnouncements,
    loadEntitlements,
    loadFunnel,
    loadLogs,
    loadOverviewStats,
    saveIntentFollowup,
    openDossier,
    closeDossier,
    grantEntitlement,
    revokeEntitlements,
  };

  if (getSession() || isPreview()) {
    showManager();
    refreshAll();
  } else {
    showLogin();
  }
})();
