(() => {
  const SESSIONS_SQL = 'supabase/migrations/202609020019_admin_online_sessions.sql';
  let cache = [];
  let loadState = 'ok';

  const mockSessions = [
    {
      session_id: 's-current',
      user_id: '1',
      email: 'admin@utilora.local',
      created_at: '2026-09-02T00:10:00Z',
      last_active: new Date().toISOString(),
      user_agent: 'Macintosh',
      online: true,
      is_admin: true,
      is_self: true,
      is_current: true,
    },
    {
      session_id: 's-other',
      user_id: '2',
      email: 'li@example.com',
      created_at: '2026-09-01T08:00:00Z',
      last_active: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      user_agent: 'iPhone',
      online: true,
      is_admin: false,
      is_self: false,
      is_current: false,
    },
    {
      session_id: 's-stale',
      user_id: '2',
      email: 'li@example.com',
      created_at: '2026-08-28T02:00:00Z',
      last_active: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      user_agent: 'Windows',
      online: false,
      is_admin: false,
      is_self: false,
      is_current: false,
    },
  ];

  const askConfirm = (summary) => (window.confirmSensitive || ((text) => Promise.resolve(window.confirm(text))))(summary);

  const shortAgent = (raw) => {
    const text = String(raw || '');
    if (!text) return '未知设备';
    if (/iPhone|iPad/i.test(text)) return 'Apple 设备';
    if (/Android/i.test(text)) return 'Android 设备';
    if (/Macintosh/i.test(text)) return 'Mac';
    if (/Windows/i.test(text)) return 'Windows';
    if (/Linux/i.test(text)) return 'Linux';
    return text.slice(0, 48);
  };

  const onlyOnline = () => document.getElementById('session-online-only')?.checked !== false;

  const grouped = () => {
    const rows = onlyOnline() ? cache.filter((row) => row.online) : cache.slice();
    const map = new Map();
    rows.forEach((row) => {
      const key = row.user_id || row.email || row.session_id;
      if (!map.has(key)) {
        map.set(key, {
          user_id: row.user_id,
          email: row.email || '—',
          is_admin: Boolean(row.is_admin),
          is_self: Boolean(row.is_self),
          online: false,
          last_active: row.last_active,
          sessions: [],
        });
      }
      const group = map.get(key);
      group.sessions.push(row);
      if (row.online) group.online = true;
      if (row.last_active && (!group.last_active || row.last_active > group.last_active)) {
        group.last_active = row.last_active;
      }
    });
    return Array.from(map.values()).sort((a, b) => String(b.last_active || '').localeCompare(String(a.last_active || '')));
  };

  const renderSessions = () => {
    const list = document.getElementById('sessions-list');
    const emptyBox = document.getElementById('sessions-empty');
    const summary = document.getElementById('sessions-summary');
    if (!list) return;
    list.replaceChildren();
    if (loadState !== 'ok') {
      const title = loadState === 'missing'
        ? '尚未启用在线会话'
        : loadState === 'permission'
          ? '没有权限查看在线会话'
          : '在线会话加载失败';
      setEmptyState(emptyBox, title, setupHint(loadState, SESSIONS_SQL));
      if (summary) summary.textContent = '';
      return;
    }
    const groups = grouped();
    const onlineUsers = new Set(cache.filter((row) => row.online).map((row) => row.user_id)).size;
    if (summary) {
      summary.textContent = `在线账号 ${onlineUsers} · 有效会话 ${cache.length}`;
    }
    if (!groups.length) {
      setEmptyState(
        emptyBox,
        onlyOnline() ? '当前没有 30 分钟内活动的账号。' : '当前没有仍有效的登录会话。',
        onlyOnline() ? '可取消「只看在线」查看仍登录但暂时无活动的会话。' : '',
      );
      return;
    }
    hideEmpty(emptyBox);
    groups.forEach((group) => {
      const head = document.createElement('tr');
      head.className = 'session-user';
      const who = document.createElement('td');
      const name = document.createElement('b');
      name.textContent = group.email;
      who.append(name);
      if (group.is_self) {
        const me = document.createElement('span');
        me.className = 'hint tight';
        me.textContent = '（当前账号）';
        who.append(me);
      }
      const role = document.createElement('td');
      const rolePill = document.createElement('span');
      rolePill.className = `role-pill ${group.is_admin ? 'admin' : 'user'}`;
      rolePill.textContent = group.is_admin ? '管理员' : '普通用户';
      role.append(rolePill);
      const status = document.createElement('td');
      const statusPill = document.createElement('span');
      statusPill.className = `status-pill ${group.online ? 'ok' : 'wait'}`;
      statusPill.textContent = group.online ? '在线' : '仍登录';
      status.append(statusPill);
      const count = document.createElement('td');
      count.textContent = `${group.sessions.length} 处`;
      const seen = document.createElement('td');
      seen.textContent = formatTime(group.last_active);
      const actions = document.createElement('td');
      actions.className = 'row-actions';
      const kickAll = document.createElement('button');
      kickAll.type = 'button';
      kickAll.className = 'delete';
      kickAll.textContent = group.is_self ? '下线其他设备' : '下线该账号';
      kickAll.addEventListener('click', () => forceUser(group));
      actions.append(kickAll);
      head.append(who, role, status, count, seen, actions);
      list.append(head);
      group.sessions.forEach((row) => {
        const tr = document.createElement('tr');
        tr.className = 'session-child';
        const device = document.createElement('td');
        device.colSpan = 3;
        const label = document.createElement('span');
        label.textContent = shortAgent(row.user_agent) + (row.is_current ? ' · 当前这一处' : '');
        device.append(label);
        const online = document.createElement('td');
        online.textContent = row.online ? '活动中' : '空闲';
        const time = document.createElement('td');
        time.textContent = formatTime(row.last_active);
        const act = document.createElement('td');
        act.className = 'row-actions';
        const kick = document.createElement('button');
        kick.type = 'button';
        kick.className = 'secondary';
        kick.textContent = row.is_current ? '当前会话' : '下线这一处';
        kick.disabled = Boolean(row.is_current);
        if (!row.is_current) kick.addEventListener('click', () => forceSession(group, row));
        act.append(kick);
        tr.append(device, online, time, act);
        list.append(tr);
      });
    });
  };

  async function loadSessions() {
    const msg = document.getElementById('sessions-message');
    if (isPreview() && !getSession()) {
      loadState = 'ok';
      cache = mockSessions;
      renderSessions();
      setMessage(msg, '当前为界面预览数据，正式环境登录后显示真实会话。');
      setPageSummary('预览：在线账号');
      return;
    }
    setMessage(msg, '正在加载在线会话……');
    try {
      const response = await request('rpc/admin_list_sessions', { method: 'POST', body: '{}' });
      const data = await response.json();
      loadState = 'ok';
      cache = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
      renderSessions();
      const onlineUsers = new Set(cache.filter((row) => row.online).map((row) => row.user_id)).size;
      setMessage(msg, `在线账号 ${onlineUsers}，有效会话 ${cache.length}`);
      setPageSummary(`在线账号 ${onlineUsers}`);
    } catch (error) {
      loadState = classifyError(error);
      cache = [];
      const hint = setupHint(loadState, SESSIONS_SQL) || error.message;
      setMessage(msg, hint, true);
      renderSessions();
      setPageSummary('在线会话不可用');
    }
  }

  async function forceUser(group) {
    const label = group.is_self ? `下线 ${group.email} 的其他设备` : `强制下线 ${group.email} 的全部会话`;
    const ok = await askConfirm(`${label}。对方下次刷新即退出。`);
    if (!ok) return;
    if (isPreview() && !getSession()) {
      cache = cache.filter((row) => row.user_id !== group.user_id || row.is_current);
      renderSessions();
      setMessage(document.getElementById('sessions-message'), '预览：已模拟下线。');
      return;
    }
    try {
      await request('rpc/admin_force_logout', {
        method: 'POST',
        body: JSON.stringify({ p_user_id: group.user_id, p_session_id: null }),
      });
      await loadSessions();
      setMessage(document.getElementById('sessions-message'), '已强制下线。');
    } catch (error) {
      setMessage(document.getElementById('sessions-message'), error.message || '下线失败', true);
    }
  }

  async function forceSession(group, row) {
    const ok = await askConfirm(`强制下线 ${group.email} 的这一处登录。对方下次刷新即退出。`);
    if (!ok) return;
    if (isPreview() && !getSession()) {
      cache = cache.filter((item) => item.session_id !== row.session_id);
      renderSessions();
      setMessage(document.getElementById('sessions-message'), '预览：已模拟下线。');
      return;
    }
    try {
      await request('rpc/admin_force_logout', {
        method: 'POST',
        body: JSON.stringify({ p_user_id: group.user_id, p_session_id: row.session_id }),
      });
      await loadSessions();
      setMessage(document.getElementById('sessions-message'), '已下线这一处。');
    } catch (error) {
      setMessage(document.getElementById('sessions-message'), error.message || '下线失败', true);
    }
  }

  document.getElementById('session-online-only')?.addEventListener('change', renderSessions);

  window.AdminSessions = {
    loadSessions,
    forceUserById: async (user) => {
      if (!user?.id) return;
      await forceUser({
        user_id: user.id,
        email: user.email || '',
        is_self: user.id === currentAdminId(),
        sessions: [],
      });
    },
  };
})();
