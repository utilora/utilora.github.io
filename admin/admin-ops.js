(() => {
  const OPS_SQL = 'supabase/admin-ops.sql';
  const GRANT_SQL = 'supabase/migrations/202608310001_admin_grant_entitlement.sql';
  const FOLLOW_SQL = 'supabase/migrations/202608310003_admin_intent_followup.sql';
  const ANNOUNCE_SQL = 'supabase/migrations/202608310010_announcements.sql';
  const EXPIRE_SQL = 'supabase/migrations/202608310014_admin_expire_announcement.sql';
  const FOLLOWTHROUGH_SQL = 'supabase/migrations/202609020023_admin_ops_followthrough.sql';
  const CRM_SQL = 'supabase/migrations/202609020024_admin_ops_crm_invite.sql';
  const SEARCH_SQL = 'supabase/migrations/202609020025_admin_ops_search_mfa_usage.sql';
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
  let warnDays = 7;
  let expiringItems = [];
  let dossierDetail = null;
  let lastPromoImpact = null;

  const askConfirm = (summary) => (window.confirmSensitive || ((text) => Promise.resolve(window.confirm(text))))(summary);

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
    ends_at: new Date(Date.now() + 3 * 86400000).toISOString(),
  }, {
    id: 'g2',
    email: 'admin@utilora.local',
    plan_code: 'pro',
    source: 'admin_grant',
    starts_at: '2026-03-01T00:00:00Z',
    ends_at: null,
  }];

  const mockLogs = {
    total: 7,
    items: [
      { created_at: '2026-08-30T10:00:00Z', email: 'admin@utilora.local', event_type: 'login', category: 'auth', path: '/admin/', detail: { client: 'admin' }, source: 'activity' },
      { created_at: '2026-08-30T09:40:00Z', email: 'li@example.com', event_type: 'logout', category: 'auth', path: '/account/', detail: {}, source: 'activity' },
      { created_at: '2026-08-30T09:10:00Z', email: 'li@example.com', event_type: 'login', category: 'auth', path: '/login/', detail: { source: 'password' }, source: 'activity' },
      { created_at: '2026-08-30T08:12:00Z', email: null, event_type: 'workspace_enter', category: 'product', path: '/pro/', detail: {}, source: 'analytics' },
      { created_at: '2026-08-30T07:40:00Z', email: 'admin@utilora.local', event_type: 'set_user_admin', category: 'admin', path: '/admin/', detail: { target_email: 'li@example.com', is_admin: true }, source: 'activity' },
      { created_at: '2026-08-30T07:20:00Z', email: 'admin@utilora.local', event_type: 'grant_entitlement', category: 'admin', path: '/admin/', detail: { target_email: 'li@example.com', plan_code: 'pro_trial', days: 14 }, source: 'activity' },
      { created_at: '2026-08-30T07:00:00Z', email: 'admin@utilora.local', event_type: 'update_platform_limits', category: 'admin', path: '/admin/', detail: { changes: [{ key: 'trial_days', from: 14, to: 21 }] }, source: 'activity' },
    ],
  };

  function asArray(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  }

  const AUDIT_ACTIONS = {
    set_user_admin: '提权/取消管理员',
    set_user_disabled: '停用/启用账号',
    force_logout: '强制下线',
    update_platform_limits: '改限额',
    announcement_upsert: '发布/改公告',
    announcement_expire: '停止弹出公告',
    grant_entitlement: '发放专业版/试用',
    revoke_entitlement: '收回专业版',
    intent_followup: '意向跟进',
    intent_trial_grant: '意向发放试用',
    feedback_followup: '留言跟进',
    unlock_login: '解锁登录冷却',
    promotion_upsert: '改促销',
    login: '登录',
    logout: '登出',
    login_success: '登录成功',
  };

  function auditDetail(row) {
    return row?.detail && typeof row.detail === 'object' ? row.detail : {};
  }

  function auditTarget(row) {
    const detail = auditDetail(row);
    return String(detail.target_email || detail.email || detail.intent_id || detail.key || row.path || '');
  }

  function auditBeforeAfter(row) {
    const detail = auditDetail(row);
    if (Array.isArray(detail.changes) && detail.changes.length) {
      return {
        before: detail.changes.map((item) => `${item.key}=${item.from}`).join('；'),
        after: detail.changes.map((item) => `${item.key}=${item.to}`).join('；'),
      };
    }
    if (Object.prototype.hasOwnProperty.call(detail, 'is_admin')) {
      return { before: detail.is_admin ? '普通用户' : '管理员', after: detail.is_admin ? '管理员' : '普通用户' };
    }
    if (Object.prototype.hasOwnProperty.call(detail, 'disabled')) {
      return { before: detail.disabled ? '正常' : '停用', after: detail.disabled ? '停用' : '正常' };
    }
    if (detail.scope === 'session' || detail.scope === 'user' || detail.scope === 'others') {
      return { before: '仍登录', after: `已下线 ${detail.revoked || 0} 处` };
    }
    if (detail.plan_code) {
      return { before: '', after: `${detail.plan_code}${detail.days ? ` · ${detail.days}天` : ''}` };
    }
    return { before: '', after: '' };
  }

  function summarizeAuditRow(row) {
    const action = AUDIT_ACTIONS[row.event_type] || row.event_type || '—';
    const target = auditTarget(row);
    const change = auditBeforeAfter(row);
    return {
      at: row.created_at || '',
      actor: row.email || '—',
      action,
      target: target || '—',
      before: change.before,
      after: change.after,
      event_type: row.event_type || '',
    };
  }

  window.UtiloraAudit = { summarizeAuditRow, AUDIT_ACTIONS };

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

  async function fetchPromotionImpact() {
    if (isPreview() && !getSession()) {
      return paintPromoImpact({
        registered: 3,
        keep_access: 1,
        lose_access: 2,
        items: [
          { user_id: '2', email: 'li@example.com' },
          { user_id: '3', email: 'unverified@example.com' },
        ],
      });
    }
    const response = await request('rpc/admin_promotion_impact', { method: 'POST', body: '{}' });
    return paintPromoImpact(await response.json());
  }

  function paintPromoImpact(data) {
    lastPromoImpact = data || null;
    const box = document.getElementById('promo-impact');
    const copy = document.getElementById('promo-impact-copy');
    const list = document.getElementById('promo-impact-list');
    if (!box || !list) return data;
    const lose = Number(data?.lose_access || 0);
    const keep = Number(data?.keep_access || 0);
    const total = Number(data?.registered || 0);
    const items = Array.isArray(data?.items) ? data.items : [];
    if (copy) {
      copy.textContent = lose
        ? `注册 ${total} 人；仍有单独权益 ${keep} 人；将失去入口 ${lose} 人${lose > items.length ? `（列表最多显示 ${items.length} 个邮箱）` : ''}。`
        : `注册 ${total} 人；关闭后无人失去入口（均有单独权益或订阅）。`;
    }
    list.replaceChildren();
    items.forEach((row) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'linkish';
      btn.textContent = row.email || '—';
      if (row.email) {
        btn.addEventListener('click', () => openDossier(row.email, row.user_id ? { id: row.user_id, email: row.email } : null));
      }
      li.append(btn);
      list.append(li);
    });
    box.hidden = false;
    return data;
  }

  function exportPromoImpact() {
    const items = Array.isArray(lastPromoImpact?.items) ? lastPromoImpact.items : [];
    downloadCsv(`utilora-promo-impact-${todayISO()}.csv`, ['邮箱', '用户ID'], items.map((row) => [
      row.email || '',
      row.user_id || '',
    ]));
  }

  async function setLaunchPromo(active) {
    const msg = document.getElementById('promotions-message');
    const row = launchPromoRow();
    const cfg = row?.config || {};
    if (active && !(await askConfirm(`开启全员限免：所有已登录用户可免费使用专业工作台。仍不接入支付。`))) return;
    if (!active) {
      let impact;
      try {
        impact = await fetchPromotionImpact();
      } catch (error) {
        setMessage(msg, setupHint(classifyError(error), FOLLOWTHROUGH_SQL) || error.message, true);
        return;
      }
      const lose = Number(impact?.lose_access || 0);
      if (!(await askConfirm(`关闭全员限免：约 ${lose} 个未单独发放权益的登录用户将不能进入专业工作台。仍不接入支付。`))) return;
    }
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
    if (!(await askConfirm(`保存促销「${code || '未命名'}」${active ? '（生效）' : '（关闭）'}。改促销须二次确认并写入操作日志。`))) {
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
    starts_at: '2026-08-31T02:00:00Z',
    created_at: '2026-08-31T02:00:00Z',
    dismiss_count: 2,
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

  function announcementStatus(row) {
    const end = row?.ends_at ? new Date(row.ends_at) : null;
    const start = row?.starts_at ? new Date(row.starts_at) : null;
    if (end && !Number.isNaN(end.getTime()) && end.getTime() <= Date.now()) return 'expired';
    if (start && !Number.isNaN(start.getTime()) && start.getTime() > Date.now()) {
      return row?.is_active ? 'scheduled' : 'off';
    }
    if (row?.is_active) return 'live';
    return 'off';
  }

  function announcementStatusLabel(kind) {
    if (kind === 'live') return '弹出中';
    if (kind === 'scheduled') return '未到点';
    if (kind === 'expired') return '已过期';
    return '未发布';
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
      const kind = announcementStatus(row);
      status.innerHTML = `<span class="status-pill ${kind === 'live' ? 'ok' : kind === 'scheduled' ? 'wait' : 'off'}"></span>`;
      status.querySelector('span').textContent = announcementStatusLabel(kind);
      const startTd = document.createElement('td');
      startTd.textContent = row.starts_at ? formatTime(row.starts_at) : '—';
      const time = document.createElement('td');
      time.textContent = row.ends_at ? formatTime(row.ends_at) : '未设过期';
      const dismissTd = document.createElement('td');
      dismissTd.textContent = String(row.dismiss_count ?? 0);
      const actions = document.createElement('td');
      const use = document.createElement('button');
      use.type = 'button';
      use.className = 'secondary';
      use.textContent = '填入表单';
      use.addEventListener('click', () => fillAnnouncementForm(row));
      actions.append(use);
      if (kind === 'live') {
        const stop = document.createElement('button');
        stop.type = 'button';
        stop.className = 'secondary';
        stop.textContent = '停止弹出';
        stop.addEventListener('click', () => {
          expireAnnouncement(row).catch((error) => setMessage(document.getElementById('announcements-message'), error.message, true));
        });
        actions.append(stop);
      }
      tr.append(title, body, status, startTd, time, dismissTd, actions);
      list.append(tr);
    });
  }

  function fillAnnouncementForm(row) {
    document.getElementById('announcement-id').value = row.id || '';
    document.getElementById('announcement-title').value = row.title || '';
    document.getElementById('announcement-body').value = row.body || '';
    document.getElementById('announcement-active').checked = Boolean(row.is_active);
    document.getElementById('announcement-start').value = toLocalInput(row.starts_at);
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
    const startVal = document.getElementById('announcement-start')?.value;
    const payload = {
      p_id: id,
      p_title: document.getElementById('announcement-title').value.trim(),
      p_body: document.getElementById('announcement-body').value.trim(),
      p_is_active: document.getElementById('announcement-active').checked,
      p_starts_at: startVal ? new Date(startVal).toISOString() : (id ? null : new Date().toISOString()),
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

  async function expireAnnouncement(row) {
    const msg = document.getElementById('announcements-message');
    if (!row?.id) {
      setMessage(msg, '找不到这条公告。', true);
      return;
    }
    if (announcementStatus(row) !== 'live') {
      setMessage(msg, '这条已经不再弹出。');
      return;
    }
    if (!(await askConfirm(`停止弹出公告「${row.title || '未命名'}」。公告立即过期，用户端不再出现。须二次确认并写入操作日志。`))) {
      return;
    }
    if (isPreview() && !getSession()) {
      row.is_active = false;
      row.ends_at = new Date().toISOString();
      renderAnnouncements();
      setMessage(msg, '预览已停止弹出，未写入生产。');
      return;
    }
    setMessage(msg, '正在停止弹出……');
    try {
      await request('rpc/admin_expire_announcement', {
        method: 'POST',
        body: JSON.stringify({ p_id: row.id }),
      });
      setMessage(msg, '已停止弹出，公告已过期。');
      if (document.getElementById('announcement-id')?.value === row.id) resetAnnouncementForm();
      await loadAnnouncements();
    } catch (error) {
      setMessage(msg, setupHint(classifyError(error), EXPIRE_SQL) || error.message, true);
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
    const rows = filteredGrants();
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
      const emailTd = document.createElement('td');
      const emailBtn = document.createElement('button');
      emailBtn.type = 'button';
      emailBtn.className = 'linkish';
      emailBtn.textContent = row.email || '—';
      emailBtn.addEventListener('click', () => openDossier(row.email, { id: row.user_id, email: row.email }));
      emailTd.append(emailBtn);
      tr.append(emailTd);
      [planLabel(row.plan_code), row.source || '—', formatTime(row.starts_at), row.ends_at ? formatTime(row.ends_at) : '长期'].forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      });
      const state = grantState(row);
      const statusTd = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = `status-pill ${state.key === 'ended' ? 'off' : state.key === 'expiring' ? 'wait' : 'ok'}`;
      pill.textContent = state.label;
      statusTd.append(pill);
      tr.append(statusTd);
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
      const summary = summarizeAuditRow(row);
      const values = [
        formatTime(row.created_at),
        summary.actor,
        summary.action,
        summary.target,
        summary.before || '—',
        summary.after || '—',
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

  async function issueIntentTrial(row) {
    const msg = document.getElementById('intents-message');
    if (!row?.id) {
      setMessage(msg, '找不到这条购买意向。', true);
      return false;
    }
    if (!row.user_id && !row.email) {
      setMessage(msg, '该意向没有绑定注册账号，无法发放试用。', true);
      return false;
    }
    if (!(await askConfirm(`给「${row.email || row.user_id}」按当前试用天数发放专业版试用。已有生效权益则只记已发、不再重复发放。须二次确认并写入操作日志。`))) {
      return false;
    }
    if (isPreview() && !getSession()) {
      setMessage(msg, '预览已标记发放试用，未写入生产。');
      return true;
    }
    try {
      const response = await request('rpc/admin_issue_intent_trial', {
        method: 'POST',
        body: JSON.stringify({ p_intent_id: row.id }),
      });
      const data = await response.json();
      if (data?.skipped) setMessage(msg, '该账号已有生效权益，已记为已发试用，未重复发放。');
      else setMessage(msg, `已发放 ${data?.days || TRIAL_DAYS_DEFAULT} 天试用`);
      return true;
    } catch (error) {
      setMessage(msg, setupHint(classifyError(error), FOLLOWTHROUGH_SQL) || error.message, true);
      return false;
    }
  }

  async function saveIntentFollowup(row, status, note, nextFollowOn, result, trialGranted, claim) {
    const msg = document.getElementById('intents-message');
    if (isPreview() && !getSession()) {
      row.follow_status = status;
      row.follow_note = note;
      row.next_follow_on = nextFollowOn || null;
      row.follow_result = result || null;
      row.trial_granted = Boolean(trialGranted);
      if (claim) {
        row.handler_id = currentAdminId() || 'preview';
        row.handler_email = currentAdminEmail() || '预览管理员';
        row.handled_at = new Date().toISOString();
      }
      renderIntents();
      setMessage(msg, claim ? '预览已认领，未写入生产。' : '预览已更新，未写入生产。');
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
          p_claim: Boolean(claim),
        }),
      });
      setMessage(msg, claim ? '已认领并保存' : '跟进已保存');
      await loadIntents();
    } catch (error) {
      setMessage(msg, setupHint(classifyError(error), SEARCH_SQL) || error.message, true);
    }
  }

  async function loadOverviewStats() {
    if (isPreview() && !getSession()) {
      warnDays = 7;
      expiringItems = mockGrants
        .filter((row) => grantState(row).key === 'expiring')
        .map((row) => ({
          user_id: '2',
          email: row.email,
          plan_code: row.plan_code,
          ends_at: row.ends_at,
          days_left: grantState(row).days,
        }));
      fill('todo-expiring', expiringItems.length);
      fill('todo-due', 1);
      paintExpiringList();
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
      fill('todo-due', data.due_intents ?? '—');
      fill('todo-risk', data.abnormal_registrations_today ?? '—');
      warnDays = Number(data.trial_expiry_warn_days) || 7;
      expiringItems = Array.isArray(data.expiring_items) ? data.expiring_items : [];
      fill('todo-expiring', data.expiring_trials ?? expiringItems.length);
      const hint = document.getElementById('todo-expiring-hint');
      if (hint) hint.textContent = `${warnDays} 天内到期，可续发或收回`;
      paintExpiringList();
    } catch {
      paintOverviewExtras();
    }
  }

  function paintExpiringList() {
    const box = document.getElementById('overview-expiring');
    const list = document.getElementById('overview-expiring-list');
    if (!box || !list) return;
    list.replaceChildren();
    if (!expiringItems.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    expiringItems.forEach((row) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'linkish';
      btn.textContent = row.email || '—';
      btn.addEventListener('click', () => openDossier(row.email, { id: row.user_id, email: row.email }));
      const meta = document.createElement('span');
      meta.textContent = ` · ${planLabel(row.plan_code)} · ${row.days_left ?? grantState(row).days} 天后`;
      li.append(btn, meta);
      list.append(li);
    });
  }

  let dossierEmail = '';
  let dossierUser = null;

  function closeDossier() {
    const panel = document.getElementById('dossier');
    if (panel) panel.hidden = true;
    dossierEmail = '';
    dossierUser = null;
    dossierDetail = null;
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

  function grantState(row) {
    if (!row?.ends_at) return { key: 'active', label: '长期', days: null };
    const ms = new Date(row.ends_at).getTime() - Date.now();
    if (Number.isNaN(ms) || ms <= 0) return { key: 'ended', label: '已结束', days: 0 };
    const days = Math.max(1, Math.ceil(ms / 86400000));
    if (days <= warnDays) return { key: 'expiring', label: `${days} 天后到期`, days };
    return { key: 'active', label: '生效中', days };
  }

  function shortAgent(raw) {
    const text = String(raw || '');
    if (!text) return '未知设备';
    if (/iPhone|iPad/i.test(text)) return 'Apple 设备';
    if (/Android/i.test(text)) return 'Android 设备';
    if (/Macintosh/i.test(text)) return 'Mac';
    if (/Windows/i.test(text)) return 'Windows';
    if (/Linux/i.test(text)) return 'Linux';
    return text.slice(0, 48);
  }

  function filteredGrants() {
    const q = (document.getElementById('grant-search')?.value || '').trim().toLowerCase();
    const filter = document.getElementById('grant-filter')?.value || '';
    return grantsCache.filter((row) => {
      if (q && !(row.email || '').toLowerCase().includes(q)) return false;
      if (filter && grantState(row).key !== filter) return false;
      return true;
    });
  }

  function nearestGrant(email) {
    const grants = (grantsCache || []).filter((row) => (row.email || '') === email);
    const active = grants.filter((row) => grantState(row).key !== 'ended');
    const pool = active.length ? active : grants;
    return pool.slice().sort((a, b) => {
      if (!a.ends_at) return 1;
      if (!b.ends_at) return -1;
      return String(a.ends_at).localeCompare(String(b.ends_at));
    })[0] || null;
  }

  function paintDossierGrants(email) {
    const grantsBox = document.getElementById('dossier-grants');
    if (!grantsBox) return;
    grantsBox.replaceChildren();
    let grants = (grantsCache || []).filter((row) => (row.email || '') === email);
    if (!grants.length && Array.isArray(dossierDetail?.grants)) grants = dossierDetail.grants;
    if (!grants.length) {
      const li = document.createElement('li');
      li.textContent = '没有单独授予记录（可能走生产折扣）。';
      grantsBox.append(li);
      return;
    }
    grants.forEach((row) => {
      const li = document.createElement('li');
      const state = grantState(row);
      li.textContent = `${planLabel(row.plan_code)} · ${row.source || 'grant'} · ${row.ends_at ? formatTime(row.ends_at) : '长期'} · ${state.label}`;
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
    if (!(await askConfirm(`给「${dossierUser.email}」发放${what}。提权须二次确认并写入操作日志。`))) return;
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
      loadOverviewStats();
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
      await loadDossierDetail();
      paintDossierGrants(dossierEmail);
      loadOverviewStats();
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
    if (!(await askConfirm(`收回「${dossierUser.email}」当前生效的专业版权益。提权变更须二次确认并写入操作日志。`))) return;
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
      loadOverviewStats();
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
      await loadDossierDetail();
      paintDossierGrants(dossierEmail);
      loadOverviewStats();
      setMessage(msg, `已收回 ${Number(count) || 0} 条生效权益`);
    } catch (error) {
      setMessage(msg, setupHint(classifyError(error), GRANT_SQL) || error.message, true);
    }
  }

  function paintDossierAccount(found, extra) {
    const grant = nearestGrant(found?.email || dossierEmail);
    const state = grant ? grantState(grant) : null;
    fillDl(document.getElementById('dossier-account'), [
      ['昵称', found?.name || extra?.user?.name || '—'],
      ['角色', (found?.is_admin ?? extra?.user?.is_admin) ? '管理员' : '普通用户'],
      ['状态', (found?.is_disabled ?? extra?.user?.is_disabled) ? '已停用' : (found?.email_confirmed_at || extra?.user?.email_confirmed_at) ? '正常' : found || extra?.user ? '未验证' : '未在用户列表中'],
      ['注册', found?.created_at ? formatTime(found.created_at) : extra?.user?.created_at ? formatTime(extra.user.created_at) : '—'],
      ['最近登录', found?.last_sign_in_at ? formatTime(found.last_sign_in_at) : extra?.user?.last_sign_in_at ? formatTime(extra.user.last_sign_in_at) : '—'],
      ['二次验证', extra ? (extra.mfa_enabled ? '已开启' : '未开启') : '加载中'],
      ['试用到期', state ? `${planLabel(grant.plan_code)} · ${state.label}` : '无单独授予'],
    ]);
    paintDossierAccountActions(found || extra?.user);
  }

  function paintDossierAccountActions(user) {
    const box = document.getElementById('dossier-account-actions');
    const adminBtn = document.getElementById('dossier-toggle-admin');
    const disableBtn = document.getElementById('dossier-toggle-disabled');
    if (!box || !adminBtn || !disableBtn) return;
    const row = user || dossierUser;
    if (!row?.id) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const isAdmin = Boolean(row.is_admin);
    const disabled = Boolean(row.is_disabled);
    const self = row.id === (typeof currentAdminId === 'function' ? currentAdminId() : '');
    const adminCount = (typeof usersCache !== 'undefined' ? usersCache : [])
      .filter((item) => item.is_admin && !item.is_disabled).length;
    adminBtn.textContent = isAdmin ? '取消管理员' : '设为管理员';
    adminBtn.disabled = Boolean(isAdmin && (self || adminCount <= 1));
    disableBtn.textContent = disabled ? '启用' : '停用';
    disableBtn.className = disabled ? 'secondary' : 'delete';
    disableBtn.disabled = Boolean(!disabled && (self || (isAdmin && adminCount <= 1)));
  }

  function paintDossierProfile(profile) {
    fillDl(document.getElementById('dossier-profile'), [
      ['称呼', profile?.display_name || '—'],
      ['公司', profile?.company || '—'],
      ['职务', profile?.title || '—'],
      ['城市', profile?.city || '—'],
      ['简介', profile?.bio || '—'],
    ]);
  }

  function paintDossierCooldown(cooldown) {
    const el = document.getElementById('dossier-cooldown');
    if (!el) return;
    if (!cooldown) {
      el.textContent = '';
      return;
    }
    if (cooldown.locked) {
      el.textContent = `登录冷却中，失败 ${cooldown.failure_count ?? '—'} 次，解锁时间 ${formatTime(cooldown.locked_until)}。可到风控台解锁。`;
      return;
    }
    el.textContent = cooldown.failure_count
      ? `最近连续失败 ${cooldown.failure_count} 次，当前未锁。`
      : '';
  }

  function paintJumpList(listId, emptyId, rows, format, onClick) {
    const list = document.getElementById(listId);
    const empty = document.getElementById(emptyId);
    if (!list) return;
    list.replaceChildren();
    const items = Array.isArray(rows) ? rows : [];
    if (empty) empty.hidden = items.length > 0;
    items.forEach((row) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'linkish';
      btn.textContent = format(row);
      btn.addEventListener('click', () => onClick(row));
      li.append(btn);
      list.append(li);
    });
  }

  const followLabels = { new: '未联系', contacted: '已联系', follow_up: '待回访', closed: '已关闭' };
  const feedbackLabels = { new: '新留言', processing: '处理中', completed: '已完成', closed: '已关闭' };

  function paintDossierRelatedLists(extra) {
    paintJumpList('dossier-intents', 'dossier-intents-empty', extra?.intents, (row) => {
      const follow = followLabels[row.follow_status] || row.follow_status || '未联系';
      const due = row.next_follow_on ? ` · 下次 ${(row.next_follow_on || '').toString().slice(0, 10)}` : '';
      const trial = row.trial_granted ? ' · 已发试用' : '';
      return `${row.use_case || '意向'} · ${follow}${due}${trial} · ${formatTime(row.created_at)}`;
    }, (row) => window.AdminJump?.openIntent?.(row.id));
    paintJumpList('dossier-feedback', 'dossier-feedback-empty', extra?.feedback, (row) => {
      const status = feedbackLabels[row.status] || row.status || '新留言';
      return `${row.title || '留言'} · ${status} · ${formatTime(row.created_at)}`;
    }, (row) => window.AdminJump?.openFeedback?.(row.id));
  }

  function paintDossierSessions(sessions) {
    const body = document.getElementById('dossier-sessions');
    const empty = document.getElementById('dossier-sessions-empty');
    const kick = document.getElementById('dossier-kick');
    if (!body) return;
    body.replaceChildren();
    const rows = Array.isArray(sessions) ? sessions : [];
    if (empty) empty.hidden = rows.length > 0;
    if (kick) kick.disabled = !dossierUser?.id || !rows.some((row) => !row.is_current);
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const device = document.createElement('td');
      device.textContent = shortAgent(row.user_agent) + (row.is_current ? ' · 当前这一处' : '');
      const status = document.createElement('td');
      status.textContent = row.online ? '在线' : '仍登录';
      const seen = document.createElement('td');
      seen.textContent = formatTime(row.last_active);
      const act = document.createElement('td');
      act.className = 'row-actions';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'secondary';
      btn.textContent = row.is_current ? '当前会话' : '下线这一处';
      btn.disabled = Boolean(row.is_current) || !dossierUser?.id;
      if (!row.is_current) {
        btn.addEventListener('click', () => kickDossierSession(row));
      }
      act.append(btn);
      tr.append(device, status, seen, act);
      body.append(tr);
    });
  }

  function paintDossierLocations(locations) {
    const list = document.getElementById('dossier-locations');
    const empty = document.getElementById('dossier-locations-empty');
    if (!list) return;
    list.replaceChildren();
    const rows = Array.isArray(locations) ? locations : [];
    if (empty) empty.hidden = rows.length > 0;
    rows.forEach((row) => {
      const li = document.createElement('li');
      li.textContent = `网络 ${row.network || '—'} · 最近 ${formatTime(row.last_seen)} · 首次 ${formatTime(row.first_seen)}`;
      list.append(li);
    });
  }

  async function loadDossierDetail() {
    if (!dossierEmail) return;
    if (isPreview() && !getSession()) {
      dossierDetail = {
        found: true,
        user: dossierUser,
        mfa_enabled: Boolean(dossierUser?.is_admin),
        sessions: [
          {
            session_id: 's-current',
            user_id: dossierUser?.id,
            last_active: new Date().toISOString(),
            user_agent: 'Macintosh',
            online: true,
            is_current: Boolean(dossierUser?.is_admin),
          },
        ],
        locations: [{ network: 'a1b2c3d4', first_seen: '2026-08-01T08:00:00Z', last_seen: new Date().toISOString() }],
        grants: (grantsCache || []).filter((row) => row.email === dossierEmail),
        profile: { display_name: dossierUser?.name || '李然', company: '示例工作室', title: '记账', city: '上海', bio: '预览资料' },
        intents: [{ id: 'i1', email: dossierEmail, use_case: '银行流水', created_at: '2026-08-20T08:00:00Z', follow_status: 'follow_up', next_follow_on: '2026-08-31', trial_granted: false }],
        feedback: [{ id: 'f1', created_at: '2026-08-30T08:00:00Z', name: dossierUser?.name || '李然', title: '想导出对账单', status: 'new' }],
        cooldown: { subject_type: 'email', failure_count: 2, locked_until: null, locked: false },
      };
      paintDossierAccount(dossierUser, dossierDetail);
      paintDossierProfile(dossierDetail.profile);
      paintDossierCooldown(dossierDetail.cooldown);
      paintDossierRelatedLists(dossierDetail);
      paintDossierSessions(dossierDetail.sessions);
      paintDossierLocations(dossierDetail.locations);
      paintDossierGrants(dossierEmail);
      return;
    }
    try {
      const response = await request('rpc/admin_user_dossier', {
        method: 'POST',
        body: JSON.stringify({ p_user_id: dossierUser?.id || null, p_email: dossierEmail }),
      });
      const data = await response.json();
      dossierDetail = data && data.found ? data : { found: false, mfa_enabled: false, sessions: [], locations: [], grants: [] };
      if (data?.user?.id) {
        dossierUser = { ...(dossierUser || {}), ...data.user };
        setGrantFormVisible(true);
      }
      paintDossierAccount(dossierUser, dossierDetail);
      paintDossierProfile(dossierDetail.profile);
      paintDossierCooldown(dossierDetail.cooldown);
      paintDossierRelatedLists(dossierDetail);
      paintDossierSessions(dossierDetail.sessions);
      paintDossierLocations(dossierDetail.locations);
      paintDossierGrants(dossierEmail);
    } catch (error) {
      paintDossierSessions([]);
      paintDossierLocations([]);
      setMessage(document.getElementById('dossier-message'), setupHint(classifyError(error), 'supabase/migrations/202609020020_admin_dossier_expiry.sql') || error.message, true);
    }
  }

  async function kickDossierUser() {
    if (!dossierUser?.id) return;
    await window.AdminSessions?.forceUserById?.(dossierUser);
    await loadDossierDetail();
  }

  async function kickDossierSession(row) {
    if (!dossierUser?.id || !row?.session_id) return;
    await window.AdminSessions?.forceSessionByIds?.(dossierUser, row.session_id);
    await loadDossierDetail();
  }

  async function openDossier(email, user) {
    const panel = document.getElementById('dossier');
    if (!panel || !email) return;
    dossierEmail = email;
    const found = user || (typeof usersCache !== 'undefined' ? usersCache.find((row) => row.email === email) : null);
    dossierUser = found || null;
    dossierDetail = null;
    panel.hidden = false;
    document.getElementById('dossier-title').textContent = email;
    paintDossierAccount(found, null);
    paintDossierProfile(null);
    paintDossierCooldown(null);
    paintDossierRelatedLists(null);
    document.getElementById('dossier-meta').textContent = found?.id ? '来自用户管理、会话与最近日志' : '正在按邮箱匹配注册用户。';
    resetGrantForm();
    setGrantFormVisible(Boolean(found?.id));
    paintDossierGrants(email);
    paintDossierSessions([]);
    paintDossierLocations([]);
    const logsBody = document.getElementById('dossier-logs');
    logsBody.replaceChildren();
    setMessage(document.getElementById('dossier-message'), '正在加载详情……');
    try {
      const logsTask = (async () => {
        if (isPreview() && !getSession()) return mockLogs.items.filter((row) => row.email === email);
        const response = await request('rpc/admin_list_activity_logs', {
          method: 'POST',
          body: JSON.stringify({ p_email: email, p_limit: 20, p_offset: 0 }),
        });
        return asArray(await response.json());
      })();
      await Promise.all([loadDossierDetail(), logsTask.then((items) => {
        logsBody.replaceChildren();
        if (!items.length) {
          const tr = document.createElement('tr');
          const td = document.createElement('td');
          td.colSpan = 4;
          td.textContent = '没有带该邮箱的日志。';
          tr.append(td);
          logsBody.append(tr);
          return;
        }
        items.forEach((row) => {
          const tr = document.createElement('tr');
          [formatTime(row.created_at), categoryLabel[row.category] || row.category || '—', row.event_type || '—', row.path || '—'].forEach((value) => {
            const td = document.createElement('td');
            td.textContent = value;
            tr.append(td);
          });
          logsBody.append(tr);
        });
      })]);
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
      downloadCsv(`utilora-intents-${stamp}.csv`, ['时间', '邮箱', '用途', '规模', '方案', '跟进', '下次跟进', '结果', '已发试用', '处理人', '备注'], filteredIntents().map((row) => [
        row.created_at || '',
        row.email || '',
        row.use_case || '',
        row.company_size || '',
        row.intended_plan || '',
        row.follow_status || 'new',
        (row.next_follow_on || '').toString().slice(0, 10),
        row.follow_result || '',
        row.trial_granted ? '是' : '',
        row.handler_email || '',
        row.follow_note || '',
      ]));
      return;
    }
    if (kind === 'feedback') {
      const rows = typeof filteredFeedback === 'function' ? filteredFeedback() : (feedbackCache || []);
      downloadCsv(`utilora-feedback-${stamp}.csv`, ['时间', '提交账号', '称呼', '功能', '说明', '联系方式', '状态', '处理人', '内部备注'], rows.map((row) => [
        row.created_at || '',
        row.user_email || '',
        row.name || '',
        row.title || '',
        row.message || '',
        row.contact || '',
        row.status || '',
        row.handler_email || '',
        row.admin_note || '',
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
      downloadCsv(`utilora-entitlements-${stamp}.csv`, ['邮箱', '方案', '来源', '开始', '结束', '状态'], filteredGrants().map((row) => [
        row.email || '',
        row.plan_code || '',
        row.source || '',
        row.starts_at || '',
        row.ends_at || '',
        grantState(row).label,
      ]));
    }
  }

  async function exportLogs() {
    if (!isPreview() || getSession()) {
      if (!currentAdminId()) throw new Error('仅管理员可导出审计日志');
    }
    const stamp = todayISO();
    let items = [];
    if (isPreview() && !getSession()) {
      items = mockLogs.items;
    } else {
      const filters = logFilters();
      filters.p_limit = 200;
      let offset = 0;
      while (offset < 2000) {
        filters.p_offset = offset;
        const response = await request('rpc/admin_list_activity_logs', { method: 'POST', body: JSON.stringify(filters) });
        const data = await response.json();
        const page = asArray(data);
        items = items.concat(page);
        if (page.length < 200) break;
        offset += 200;
      }
    }
    downloadCsv(`utilora-logs-${stamp}.csv`, ['时间戳', '操作者', '动作', '目标摘要', '变更前', '变更后', '类型', '来源'], items.map((row) => {
      const summary = summarizeAuditRow(row);
      return [summary.at, summary.actor, summary.action, summary.target, summary.before, summary.after, summary.event_type, row.source || ''];
    }));
  }

  document.getElementById('promo-form')?.addEventListener('submit', savePromotion);
  document.getElementById('announcement-form')?.addEventListener('submit', saveAnnouncement);
  document.getElementById('announcement-reset')?.addEventListener('click', resetAnnouncementForm);
  document.getElementById('launch-promo-off')?.addEventListener('click', () => setLaunchPromo(false));
  document.getElementById('launch-promo-on')?.addEventListener('click', () => setLaunchPromo(true));
  document.getElementById('export-promo-impact')?.addEventListener('click', exportPromoImpact);
  document.getElementById('grant-search')?.addEventListener('input', renderEntitlements);
  document.getElementById('grant-filter')?.addEventListener('change', renderEntitlements);
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
  document.getElementById('dossier-kick')?.addEventListener('click', () => {
    kickDossierUser().catch((error) => setMessage(document.getElementById('dossier-message'), error.message, true));
  });
  document.getElementById('dossier-toggle-admin')?.addEventListener('click', () => {
    if (!dossierUser?.id || typeof setUserAdmin !== 'function') return;
    setUserAdmin(dossierUser, !dossierUser.is_admin).then(() => loadDossierDetail());
  });
  document.getElementById('dossier-toggle-disabled')?.addEventListener('click', () => {
    if (!dossierUser?.id || typeof setUserDisabled !== 'function') return;
    setUserDisabled(dossierUser, !dossierUser.is_disabled).then(() => loadDossierDetail());
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
    issueIntentTrial,
    openDossier,
    closeDossier,
    grantEntitlement,
    revokeEntitlements,
  };

  if (isPreview() && !getSession()) {
    showManager();
    refreshAll();
  } else if (!getSession()) {
    showLogin();
  } else {
    Promise.resolve(window.ensureAdminMfaSession ? window.ensureAdminMfaSession() : { ok: true }).then((gate) => {
      if (!gate || gate.ok) {
        showManager();
        refreshAll();
        return;
      }
      sessionStorage.removeItem(sessionKey);
      showLogin();
      setMessage(loginMessage, gate.message || '请先完成二次验证', true);
    }).catch(() => {
      showLogin();
    });
  }
})();
