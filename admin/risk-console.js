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
    limits: {
      registration_success_per_ip_per_day: 3,
      otp_per_email_per_hour: 3,
      otp_per_ip_per_hour: 10,
    },
    tables_ready: { registration_ip_log: true, otp_send_log: true },
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
      hint.textContent = parts.length
        ? `明细表：${parts.join('；')}。今日新注册与一键停用仍可用。`
        : 'IP/验证码明细表已就绪。限额来自平台配置（缺省见 COLLAB 默认值）。';
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
      renderRiskConsole(data);
      setMessage(msg, '已刷新。');
    } catch (error) {
      renderRiskConsole(mockRisk);
      setMessage(msg, error.message || String(error), true);
    }
  }

  async function riskSetDisabled(user, disabled) {
    const label = disabled ? '停用' : '启用';
    if (!confirm(`确定${label}「${user.email}」吗？`)) return;
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
})();
