(() => {
  const RISK_SQL = 'supabase/migrations/202608310002_admin_risk_console.sql';
  const mockRisk = {
    day: '2026-08-31',
    new_users_today: 2,
    new_users: [
      { id: '2', email: 'li@example.com', name: '李然', created_at: '2026-08-31T02:00:00Z', email_confirmed_at: '2026-08-31T02:05:00Z', is_disabled: false },
      { id: '3', email: 'unverified@example.com', name: '待验证', created_at: '2026-08-31T03:10:00Z', email_confirmed_at: null, is_disabled: false },
    ],
    registration_ip_today: [
      { ip_hash: 'a1b2c3d4', used: 2, limit_value: 3, user_ids: ['2', '3'] },
    ],
    otp_by_email_last_hour: [
      { email_norm: 'li@example.com', used: 2, limit_value: 3 },
    ],
    otp_by_ip_last_hour: [
      { ip_hash: 'a1b2c3d4', used: 4, limit_value: 10 },
    ],
    login_locked: [
      { subject_type: 'email', subject_key: 'li@example.com', failure_count: 5, locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() },
    ],
    password_reset_last_hour: [
      { email_norm: 'li@example.com', used: 2, limit_value: 3 },
    ],
    new_locations_today: [
      { user_id: '2', email: 'li@example.com', network: 'a1b2c3d4', first_seen: '2026-08-31T03:00:00Z', last_seen: '2026-08-31T03:00:00Z' },
    ],
    unverified_users: [
      { id: '3', email: 'unverified@example.com', name: '待验证', created_at: '2026-08-31T03:10:00Z', is_disabled: false },
    ],
    admins_mfa: [
      { user_id: '1', email: 'admin@utilora.local', name: '站长', mfa_enabled: true, is_disabled: false },
      { user_id: '5', email: 'ops@example.com', name: '值班', mfa_enabled: false, is_disabled: false },
    ],
    edge_usage: {
      day: '2026-08-31',
      limit: 10000,
      items: [
        { function_name: 'submit-feedback', used: 12, remaining: 9988, over_limit: false },
        { function_name: 'submit-purchase-intent', used: 4, remaining: 9996, over_limit: false },
      ],
    },
    limits: {
      registration_success_per_ip_per_day: 3,
      otp_per_email_per_hour: 3,
      otp_per_ip_per_hour: 10,
      login_failure_max_attempts: 5,
      password_reset_per_email_per_hour: 3,
    },
    tables_ready: { registration_ip_log: true, otp_send_log: true, login_attempt_state: true, password_reset_log: true, login_locations: true },
  };

  let riskCache = null;

  function fill(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value == null ? '—' : String(value);
  }

  function shortHash(value) {
    const s = String(value || '');
    if (s.length <= 12) return s || '—';
    return `${s.slice(0, 8)}…`;
  }

  function fmtTime(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    } catch {
      return String(value);
    }
  }

  function paintRiskEmpty(tbodyId, emptyId, isEmpty) {
    const tbody = document.getElementById(tbodyId);
    const empty = document.getElementById(emptyId);
    if (tbody) tbody.replaceChildren();
    if (empty) empty.hidden = !isEmpty;
  }

  function setMessage(el, text, isError) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', !!isError);
  }

  function renderRiskConsole(data) {
    riskCache = data || mockRisk;
    const d = riskCache;
    fill('risk-new-count', d.new_users_today ?? 0);
    fill('risk-ip-limit', d.limits?.registration_success_per_ip_per_day ?? '—');
    fill('risk-otp-email-limit', d.limits?.otp_per_email_per_hour ?? '—');
    fill('risk-otp-ip-limit', d.limits?.otp_per_ip_per_hour ?? '—');
    const dayEl = document.getElementById('risk-day');
    if (dayEl) dayEl.textContent = d.day ? `统计日（上海）：${d.day}` : '';

    const ready = d.tables_ready || {};
    const hint = document.getElementById('risk-tables-hint');
    if (hint) {
      const parts = [];
      if (!ready.registration_ip_log) parts.push('registration_ip_log 未就绪（安全线）');
      if (!ready.otp_send_log) parts.push('otp_send_log 未就绪（安全线）');
      if (!ready.login_attempt_state) parts.push('login_attempt_state 未就绪（安全线）');
      if (!ready.password_reset_log) parts.push('password_reset_log 未就绪（安全线）');
      if (!ready.login_locations) parts.push('login_locations 未就绪（安全线）');
      hint.textContent = parts.length
        ? `明细表：${parts.join('；')}。今日新注册与一键停用仍可用。`
        : 'IP/验证码/登录冷却明细表已就绪。限额来自平台配置（缺省见 COLLAB 默认值）。';
    }

    const users = Array.isArray(d.new_users) ? d.new_users : [];
    const usersBody = document.getElementById('risk-new-users');
    paintRiskEmpty('risk-new-users', 'risk-new-empty', users.length === 0);
    users.forEach((user) => {
      const tr = document.createElement('tr');
      const status = user.is_disabled ? '已停用' : user.email_confirmed_at ? '正常' : '未验证';
      [user.email || '—', user.name || '—', fmtTime(user.created_at), status].forEach((text) => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.append(td);
      });
      const act = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = user.is_disabled ? 'secondary' : 'delete';
      btn.textContent = user.is_disabled ? '启用' : '停用';
      btn.addEventListener('click', () => riskSetDisabled(user, !user.is_disabled));
      act.append(btn);
      const detail = document.createElement('button');
      detail.type = 'button';
      detail.className = 'secondary';
      detail.textContent = '详情';
      detail.style.marginLeft = '6px';
      detail.addEventListener('click', () => window.AdminOps?.openDossier?.(user.email, user));
      act.append(detail);
      tr.append(act);
      usersBody?.append(tr);
    });

    const ipRows = Array.isArray(d.registration_ip_today) ? d.registration_ip_today : [];
    paintRiskEmpty('risk-ip-regs', 'risk-ip-empty', ipRows.length === 0);
    const ipBody = document.getElementById('risk-ip-regs');
    ipRows.forEach((row) => {
      const tr = document.createElement('tr');
      const over = Number(row.used) >= Number(row.limit_value);
      [shortHash(row.ip_hash), String(row.used ?? 0), String(row.limit_value ?? '—'), Array.isArray(row.user_ids) ? `${row.user_ids.length} 人` : '—'].forEach((text, i) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (i === 1 && over) td.style.color = '#b91c1c';
        tr.append(td);
      });
      ipBody?.append(tr);
    });

    const otpEmail = Array.isArray(d.otp_by_email_last_hour) ? d.otp_by_email_last_hour : [];
    paintRiskEmpty('risk-otp-email', 'risk-otp-email-empty', otpEmail.length === 0);
    const oeBody = document.getElementById('risk-otp-email');
    otpEmail.forEach((row) => {
      const tr = document.createElement('tr');
      const over = Number(row.used) >= Number(row.limit_value);
      [row.email_norm || '—', String(row.used ?? 0), String(row.limit_value ?? '—')].forEach((text, i) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (i === 1 && over) td.style.color = '#b91c1c';
        tr.append(td);
      });
      oeBody?.append(tr);
    });

    const otpIp = Array.isArray(d.otp_by_ip_last_hour) ? d.otp_by_ip_last_hour : [];
    paintRiskEmpty('risk-otp-ip', 'risk-otp-ip-empty', otpIp.length === 0);
    const oiBody = document.getElementById('risk-otp-ip');
    otpIp.forEach((row) => {
      const tr = document.createElement('tr');
      const over = Number(row.used) >= Number(row.limit_value);
      [shortHash(row.ip_hash), String(row.used ?? 0), String(row.limit_value ?? '—')].forEach((text, i) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (i === 1 && over) td.style.color = '#b91c1c';
        tr.append(td);
      });
      oiBody?.append(tr);
    });

    const locked = Array.isArray(d.login_locked) ? d.login_locked : [];
    paintRiskEmpty('risk-locked', 'risk-locked-empty', locked.length === 0);
    const lockedBody = document.getElementById('risk-locked');
    locked.forEach((row) => {
      const tr = document.createElement('tr');
      const type = row.subject_type === 'ip' ? '网络' : '邮箱';
      const key = row.subject_type === 'ip' ? shortHash(row.subject_key) : (row.subject_key || '—');
      [type, key, String(row.failure_count ?? 0), fmtTime(row.locked_until)].forEach((text) => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.append(td);
      });
      const act = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'secondary';
      btn.textContent = '解锁';
      btn.addEventListener('click', () => unlockLogin(row));
      act.append(btn);
      tr.append(act);
      lockedBody?.append(tr);
    });

    const resets = Array.isArray(d.password_reset_last_hour) ? d.password_reset_last_hour : [];
    paintRiskEmpty('risk-resets', 'risk-resets-empty', resets.length === 0);
    const resetBody = document.getElementById('risk-resets');
    resets.forEach((row) => {
      const tr = document.createElement('tr');
      [row.email_norm || '—', String(row.used ?? 0), String(row.limit_value ?? '—')].forEach((text) => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.append(td);
      });
      resetBody?.append(tr);
    });

    const locations = Array.isArray(d.new_locations_today) ? d.new_locations_today : [];
    paintRiskEmpty('risk-new-locations', 'risk-new-locations-empty', locations.length === 0);
    const locBody = document.getElementById('risk-new-locations');
    locations.forEach((row) => {
      const tr = document.createElement('tr');
      const emailTd = document.createElement('td');
      if (row.email) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'linkish';
        btn.textContent = row.email;
        btn.addEventListener('click', () => window.AdminOps?.openDossier?.(row.email, row.user_id ? { id: row.user_id, email: row.email } : null));
        emailTd.append(btn);
      } else {
        emailTd.textContent = '—';
      }
      tr.append(emailTd);
      [row.network || '—', fmtTime(row.first_seen), fmtTime(row.last_seen)].forEach((text) => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.append(td);
      });
      locBody?.append(tr);
    });

    const unverified = Array.isArray(d.unverified_users) ? d.unverified_users : [];
    paintRiskEmpty('risk-unverified', 'risk-unverified-empty', unverified.length === 0);
    const unverifiedBody = document.getElementById('risk-unverified');
    unverified.forEach((user) => {
      const tr = document.createElement('tr');
      const status = user.is_disabled ? '已停用' : '未验证';
      [user.email || '—', user.name || '—', fmtTime(user.created_at), status].forEach((text) => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.append(td);
      });
      const act = document.createElement('td');
      const detail = document.createElement('button');
      detail.type = 'button';
      detail.className = 'secondary';
      detail.textContent = '详情';
      detail.addEventListener('click', () => window.AdminOps?.openDossier?.(user.email, user.id ? { id: user.id, email: user.email } : null));
      act.append(detail);
      tr.append(act);
      unverifiedBody?.append(tr);
    });
    fill('overview-unverified', unverified.length);

    const admins = Array.isArray(d.admins_mfa) ? d.admins_mfa : [];
    paintRiskEmpty('risk-admins-mfa', 'risk-admins-mfa-empty', admins.length === 0);
    const adminsBody = document.getElementById('risk-admins-mfa');
    admins.forEach((row) => {
      const tr = document.createElement('tr');
      const mfa = row.mfa_enabled ? '已开启' : '未开启';
      const status = row.is_disabled ? '已停用' : '正常';
      [row.email || '—', row.name || '—', mfa, status].forEach((text, i) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (i === 2 && !row.mfa_enabled) td.className = 'over-limit';
        tr.append(td);
      });
      adminsBody?.append(tr);
    });
    fill('overview-admins-no-mfa', admins.filter((row) => !row.mfa_enabled).length);

    const edge = d.edge_usage || {};
    const edgeItems = Array.isArray(edge.items) ? edge.items : [];
    paintRiskEmpty('risk-edge-usage', 'risk-edge-usage-empty', edgeItems.length === 0);
    const edgeBody = document.getElementById('risk-edge-usage');
    edgeItems.forEach((row) => {
      const tr = document.createElement('tr');
      const usedTd = document.createElement('td');
      usedTd.textContent = String(row.used ?? 0);
      if (row.over_limit) usedTd.className = 'over-limit';
      const nameTd = document.createElement('td');
      nameTd.textContent = row.function_name || '—';
      const remainTd = document.createElement('td');
      remainTd.textContent = String(row.remaining ?? '—');
      const limitTd = document.createElement('td');
      limitTd.textContent = String(edge.limit ?? '—');
      tr.append(nameTd, usedTd, remainTd, limitTd);
      edgeBody?.append(tr);
    });
    const hottest = edgeItems.reduce((max, row) => Math.max(max, Number(row.used) || 0), 0);
    fill('overview-edge-used', edgeItems.length ? hottest : 0);
    const edgeHint = document.getElementById('overview-edge-limit');
    if (edgeHint) edgeHint.textContent = edge.limit ? `每函数上限 ${edge.limit}` : '每函数有日上限';
  }

  async function loadRiskConsole() {
    const msg = document.getElementById('risk-message');
    const isPreview = typeof window.isPreview === 'function' ? window.isPreview() : !/utilora\.github\.io$/i.test(location.hostname);
    const getSession = window.getSession || (() => null);
    const request = window.request;
    if ((isPreview && !getSession()) || !request) {
      renderRiskConsole(mockRisk);
      setMessage(msg, '预览数据（未连生产）。');
      return;
    }
    try {
      const response = await request('rpc/admin_risk_console', { method: 'POST', body: '{}' });
      const data = await response.json();
      try {
        const locRes = await request('rpc/admin_list_new_login_locations', { method: 'POST', body: '{}' });
        data.new_locations_today = await locRes.json();
      } catch {
        data.new_locations_today = data.new_locations_today || [];
      }
      const extra = await Promise.allSettled([
        request('rpc/admin_list_unverified_users', { method: 'POST', body: '{}' }),
        request('rpc/admin_list_admins_mfa', { method: 'POST', body: '{}' }),
        request('rpc/admin_list_edge_function_usage', { method: 'POST', body: '{}' }),
      ]);
      if (extra[0].status === 'fulfilled') {
        data.unverified_users = await extra[0].value.json();
      } else {
        data.unverified_users = data.unverified_users || [];
      }
      if (extra[1].status === 'fulfilled') {
        data.admins_mfa = await extra[1].value.json();
      } else {
        data.admins_mfa = data.admins_mfa || [];
      }
      if (extra[2].status === 'fulfilled') {
        data.edge_usage = await extra[2].value.json();
      } else {
        data.edge_usage = data.edge_usage || { items: [] };
      }
      renderRiskConsole(data);
      setMessage(msg, '已刷新。');
    } catch (error) {
      renderRiskConsole(mockRisk);
      setMessage(msg, error.message || String(error), true);
    }
  }

  async function unlockLogin(row) {
    const label = row?.subject_type === 'ip'
      ? `网络 ${shortHash(row.subject_key)}`
      : `邮箱 ${row?.subject_key || ''}`;
    const ask = window.confirmSensitive || ((text) => Promise.resolve(confirm(text)));
    if (!(await ask(`解锁登录冷却：${label}。须二次确认并写入操作日志。`))) return;
    const msg = document.getElementById('risk-message');
    const isPreview = typeof window.isPreview === 'function' ? window.isPreview() : !/utilora\.github\.io$/i.test(location.hostname);
    const getSession = window.getSession || (() => null);
    const request = window.request;
    if (isPreview && !getSession()) {
      if (riskCache && Array.isArray(riskCache.login_locked)) {
        riskCache.login_locked = riskCache.login_locked.filter((item) => !(item.subject_type === row.subject_type && item.subject_key === row.subject_key));
      }
      renderRiskConsole(riskCache);
      setMessage(msg, '预览已解锁，未写入生产。');
      return;
    }
    try {
      await request('rpc/admin_unlock_login', {
        method: 'POST',
        body: JSON.stringify({ p_subject_type: row.subject_type, p_subject_key: row.subject_key }),
      });
      setMessage(msg, `已解锁 ${label}`);
      await loadRiskConsole();
    } catch (error) {
      setMessage(msg, error.message || String(error), true);
    }
  }

  async function riskSetDisabled(user, disabled) {
    const label = disabled ? '停用' : '启用';
    const ask = window.confirmSensitive || ((text) => Promise.resolve(confirm(text)));
    if (!(await ask(`${label}账号「${user.email}」。停用须二次确认并写入操作日志。`))) return;
    const msg = document.getElementById('risk-message');
    const isPreview = typeof window.isPreview === 'function' ? window.isPreview() : !/utilora\.github\.io$/i.test(location.hostname);
    const getSession = window.getSession || (() => null);
    const request = window.request;
    if (isPreview && !getSession()) {
      user.is_disabled = disabled;
      renderRiskConsole(riskCache);
      setMessage(msg, `预览已${label}，未写入生产。`);
      return;
    }
    try {
      await request('rpc/admin_set_user_disabled', {
        method: 'POST',
        body: JSON.stringify({ p_user_id: user.id, p_disabled: disabled }),
      });
      setMessage(msg, `已${label} ${user.email}`);
      await loadRiskConsole();
    } catch (error) {
      setMessage(msg, error.message || String(error), true);
    }
  }

  document.getElementById('risk-refresh')?.addEventListener('click', () => loadRiskConsole());

  window.AdminRisk = { loadRiskConsole, renderRiskConsole };
  const bridge = () => {
    if (window.AdminOps) window.AdminOps.loadRiskConsole = loadRiskConsole;
  };
  bridge();
  document.addEventListener('DOMContentLoaded', bridge);
  if (!document.getElementById('manager-panel')?.hidden) loadRiskConsole();
})();
