(() => {
  const INVITE_SQL = 'supabase/migrations/202609020024_admin_ops_crm_invite.sql';
  const STATUS = {
    bound: '已绑定',
    pending_payment: '待付费',
    credited: '已入账',
    invalid: '无效',
  };

  let invitesCache = [];

  function setMessage(el, text, isError) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('error', !!isError);
  }

  function fmtTime(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    } catch {
      return String(value);
    }
  }

  function renderInvites(payload) {
    const items = Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload) ? payload : []);
    invitesCache = items;
    const list = document.getElementById('invites-list');
    const empty = document.getElementById('invites-empty');
    const state = document.getElementById('invites-ui-state');
    if (state) {
      const ui = Boolean(payload?.invite_ui_enabled);
      const pay = Boolean(payload?.payment_connected);
      state.textContent = pay && ui
        ? '邀请对用户已打开。入账仍须首次真实付款。'
        : '邀请对用户默认关闭。支付接通前不能打开，也不会入账。';
    }
    if (!list) return;
    list.replaceChildren();
    if (!items.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    items.forEach((row) => {
      const tr = document.createElement('tr');
      [
        row.inviter_email || '—',
        row.invitee_user_email || row.invitee_email || '—',
        row.code || '—',
        STATUS[row.status] || row.status || '—',
        fmtTime(row.bound_at),
        fmtTime(row.credited_at),
      ].forEach((text) => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.append(td);
      });
      list.append(tr);
    });
  }

  async function loadInvites() {
    const msg = document.getElementById('invites-message');
    const isPreview = typeof window.isPreview === 'function' ? window.isPreview() : !/utilora\.github\.io$/i.test(location.hostname);
    const getSession = window.getSession || (() => null);
    const request = window.request;
    if ((isPreview && !getSession()) || !request) {
      renderInvites({ items: [], invite_ui_enabled: false, payment_connected: false });
      setMessage(msg, '预览：邀请对用户关闭，无入账记录。');
      return;
    }
    try {
      const response = await request('rpc/admin_list_invites', { method: 'POST', body: '{}' });
      renderInvites(await response.json());
      setMessage(msg, invitesCache.length ? `共 ${invitesCache.length} 条` : '还没有邀请记录。');
    } catch (error) {
      renderInvites({ items: [], invite_ui_enabled: false, payment_connected: false });
      setMessage(msg, error.message || String(error), true);
    }
  }

  document.getElementById('export-invites')?.addEventListener('click', () => {
    if (typeof downloadCsv !== 'function') return;
    const stamp = typeof todayISO === 'function' ? todayISO() : 'export';
    downloadCsv(`utilora-invites-${stamp}.csv`, ['邀请人', '被邀请人', '邀请码', '状态', '绑定时间', '入账时间'], invitesCache.map((row) => [
      row.inviter_email || '',
      row.invitee_user_email || row.invitee_email || '',
      row.code || '',
      STATUS[row.status] || row.status || '',
      row.bound_at || '',
      row.credited_at || '',
    ]));
  });

  window.AdminInvites = { loadInvites };
})();
