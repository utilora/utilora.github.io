(() => {
  const LIMITS_SQL = 'supabase/migrations/202609020020_admin_dossier_expiry.sql';
  const GROUP_LABEL = {
    security: '注册与登录',
    strategy: '运营策略',
    aging: '账龄分桶',
    ops: '试用与邀请',
  };
  const LIMIT_FIELDS = [
    { key: 'registration_success_per_ip_per_day', label: '每 IP 每天成功注册次数', hint: 'Asia/Shanghai 自然日；验证成功才计数', min: 1, max: 100, default: 3, group: 'security' },
    { key: 'otp_per_email_per_hour', label: '每邮箱每小时验证码', hint: '点发送即计', min: 1, max: 50, default: 3, group: 'security' },
    { key: 'otp_per_ip_per_hour', label: '每 IP 每小时验证码', hint: '点发送即计', min: 1, max: 200, default: 10, group: 'security' },
    { key: 'login_failure_max_attempts', label: '登录连续失败次数', hint: '同邮箱或同 IP', min: 1, max: 30, default: 5, group: 'security' },
    { key: 'login_cooldown_minutes', label: '登录冷却分钟', hint: '达到失败次数后', min: 1, max: 1440, default: 15, group: 'security' },
    { key: 'password_reset_per_email_per_hour', label: '每邮箱每小时找回密码', hint: '点发送重置邮件即计', min: 1, max: 50, default: 3, group: 'security' },
    { key: 'password_reset_per_ip_per_hour', label: '每 IP 每小时找回密码', hint: '点发送重置邮件即计', min: 1, max: 200, default: 10, group: 'security' },
    { key: 'feedback_per_user_per_hour', label: '每用户每小时留言', hint: '登录用户提交功能建议；超限拒绝', min: 1, max: 50, default: 5, group: 'security' },
    { key: 'feedback_per_ip_per_hour', label: '每 IP 每小时留言', hint: '功能建议提交；超限拒绝', min: 1, max: 200, default: 10, group: 'security' },
    { key: 'purchase_intent_per_email_per_hour', label: '每邮箱每小时购买意向', hint: '购买意向提交；超限拒绝', min: 1, max: 50, default: 3, group: 'security' },
    { key: 'purchase_intent_per_ip_per_hour', label: '每 IP 每小时购买意向', hint: '购买意向提交；超限拒绝', min: 1, max: 200, default: 10, group: 'security' },
    { key: 'edge_function_daily_call_limit', label: 'Edge Function 每日调用上限', hint: '按 function 计', min: 1, max: 1000000, default: 10000, group: 'security' },
    { key: 'match_date_near_days', label: '匹配日期接近天数', hint: '流水与应收建议匹配时，日期差不超过此值（天）', min: 0, max: 30, default: 3, group: 'strategy' },
    { key: 'match_amount_tolerance_cents', label: '匹配金额容差（分）', hint: '0 表示必须分毫不差才可作高/中置信建议', min: 0, max: 100, default: 0, group: 'strategy' },
    { key: 'backup_stale_days', label: '备份过期天数', hint: '超过此天数未成功导出则在工作台提醒', min: 1, max: 90, default: 7, group: 'strategy' },
    { key: 'aging_bucket_1_days', label: '账龄桶1上限天', hint: '逾期 1–N 天为第一桶；须满足 0 < 桶1 < 桶2 < 桶3 ≤ 365', min: 1, max: 365, default: 30, group: 'aging' },
    { key: 'aging_bucket_2_days', label: '账龄桶2上限天', hint: '逾期 桶1+1–桶2 天为第二桶', min: 1, max: 365, default: 60, group: 'aging' },
    { key: 'aging_bucket_3_days', label: '账龄桶3上限天', hint: '逾期 桶2+1–桶3 天为第三桶；超过为桶3+', min: 1, max: 365, default: 90, group: 'aging' },
    { key: 'trial_days', label: '试用天数', hint: '发放试用的默认天数，单次仍可手填', min: 1, max: 365, default: 14, group: 'ops' },
    { key: 'trial_expiry_warn_days', label: '试用到期预警天数', hint: '工作台列出该天数内到期的单独授予', min: 1, max: 30, default: 7, group: 'ops' },
    { key: 'invite_reward_months', label: '邀请成功奖励月数', hint: '被邀请人首次实际付费后才入账；支付接通前不展示邀请', min: 1, max: 24, default: 3, group: 'ops' },
  ];

  let limitsCache = LIMIT_FIELDS.map((field) => ({ ...field, value: field.default }));
  let savedValues = Object.fromEntries(limitsCache.map((field) => [field.key, field.value]));

  function parseLimitValue(field, raw) {
    const text = String(raw ?? '').trim();
    if (!text || !/^-?\d+$/.test(text)) return { ok: false, error: `${field.label} 须为整数` };
    const value = Number(text);
    if (!Number.isInteger(value) || value < field.min || value > field.max) {
      return { ok: false, error: `${field.label} 须为 ${field.min}–${field.max} 的整数` };
    }
    return { ok: true, value };
  }

  function validateLimits(values) {
    const next = {};
    for (const field of LIMIT_FIELDS) {
      const parsed = parseLimitValue(field, values[field.key]);
      if (!parsed.ok) return parsed;
      next[field.key] = parsed.value;
    }
    const b1 = next.aging_bucket_1_days;
    const b2 = next.aging_bucket_2_days;
    const b3 = next.aging_bucket_3_days;
    if (!(b1 > 0 && b1 < b2 && b2 < b3 && b3 <= 365)) {
      return { ok: false, error: '账龄分桶须满足 0 < 桶1 < 桶2 < 桶3 ≤ 365' };
    }
    return { ok: true, values: next };
  }

  function agingPreviewLabels(b1, b2, b3) {
    const n1 = Number(b1);
    const n2 = Number(b2);
    const n3 = Number(b3);
    if (!(Number.isInteger(n1) && Number.isInteger(n2) && Number.isInteger(n3) && n1 > 0 && n1 < n2 && n2 < n3 && n3 <= 365)) {
      return { ok: false, error: '账龄分桶须满足 0 < 桶1 < 桶2 < 桶3 ≤ 365', labels: [] };
    }
    return {
      ok: true,
      error: '',
      labels: [
        '未到期',
        `逾期 1–${n1} 天`,
        `逾期 ${n1 + 1}–${n2} 天`,
        `逾期 ${n2 + 1}–${n3} 天`,
        `逾期 ${n3} 天以上`,
      ],
    };
  }

  function renderAgingPreview(values) {
    const box = document.getElementById('aging-preview');
    if (!box) return;
    const preview = agingPreviewLabels(
      values?.aging_bucket_1_days,
      values?.aging_bucket_2_days,
      values?.aging_bucket_3_days,
    );
    if (!preview.ok) {
      box.dataset.invalid = '1';
      box.innerHTML = `<p class="aging-preview-title">账龄视图预览</p><p class="error">${preview.error}</p>`;
      return;
    }
    box.dataset.invalid = '0';
    box.innerHTML = `<p class="aging-preview-title">新打开的账龄视图将显示为</p><ol>${preview.labels.map((label) => `<li>${label}</li>`).join('')}</ol>`;
  }

  function mergeItems(items) {
    const byKey = new Map((items || []).map((row) => [row.key, row]));
    return LIMIT_FIELDS.map((field) => {
      const row = byKey.get(field.key) || {};
      const value = Number.isInteger(Number(row.value)) ? Number(row.value) : field.default;
      return {
        ...field,
        label: row.label || field.label,
        min: Number.isInteger(Number(row.min)) ? Number(row.min) : field.min,
        max: Number.isInteger(Number(row.max)) ? Number(row.max) : field.max,
        value,
      };
    });
  }

  function renderLimitsForm(items) {
    limitsCache = mergeItems(items);
    savedValues = Object.fromEntries(limitsCache.map((field) => [field.key, field.value]));
    const form = document.getElementById('limits-form');
    if (!form) return;
    const groups = [];
    limitsCache.forEach((field) => {
      let group = groups.find((row) => row.group === field.group);
      if (!group) {
        group = { group: field.group, fields: [] };
        groups.push(group);
      }
      group.fields.push(field);
    });
    form.innerHTML = groups.map((group) => `
      <div class="limits-group" data-group="${group.group}">
        <h2>${GROUP_LABEL[group.group] || group.group}</h2>
        <div class="limits-grid">
          ${group.fields.map((field) => `
            <div class="field">
              <label for="limit-${field.key}">${field.label}</label>
              <input id="limit-${field.key}" name="${field.key}" type="number" min="${field.min}" max="${field.max}" step="1" value="${field.value}" required>
              <small>${field.hint} · ${field.min}–${field.max}</small>
            </div>
          `).join('')}
        </div>
        ${group.group === 'aging' ? '<div class="aging-preview" id="aging-preview"></div>' : ''}
      </div>
    `).join('') + `
      <div class="row-actions">
        <button id="limits-save" type="submit">保存限额</button>
        <button id="limits-reset" class="secondary" type="button">恢复当前值</button>
      </div>
    `;
    const trial = limitsCache.find((field) => field.key === 'trial_days')?.value;
    const days = document.getElementById('dossier-grant-days');
    if (days && trial) {
      days.placeholder = `试用默认 ${trial}`;
      if (!days.value || days.value === '14') days.value = String(trial);
    }
    const hint = document.querySelector('#dossier-grant-form .hint');
    if (hint && trial) hint.textContent = `试用默认 ${trial} 天，可改。专业版天数留空为长期。支付未接通，只写 entitlement_grants。`;
    renderAgingPreview(savedValues);
  }

  function readFormValues() {
    const values = {};
    LIMIT_FIELDS.forEach((field) => {
      values[field.key] = document.getElementById(`limit-${field.key}`)?.value;
    });
    return values;
  }

  function changedSummary(next) {
    return LIMIT_FIELDS
      .filter((field) => next[field.key] !== savedValues[field.key])
      .map((field) => `${field.label} ${savedValues[field.key]} → ${next[field.key]}`);
  }

  async function loadLimits() {
    const msg = document.getElementById('limits-message');
    if (isPreview() && !getSession()) {
      renderLimitsForm(LIMIT_FIELDS.map((field) => ({ ...field, value: field.default })));
      setMessage(msg, '当前为界面预览数据。');
      return;
    }
    setMessage(msg, '正在加载限额……');
    try {
      const response = await request('rpc/admin_list_platform_limits', { method: 'POST', body: '{}' });
      const data = await response.json();
      const items = Array.isArray(data) ? data : (data?.items || []);
      renderLimitsForm(items);
      setMessage(msg, `共 ${LIMIT_FIELDS.length} 项，保存后立即生效。`);
      setPageSummary(`限额 ${LIMIT_FIELDS.length} 项`);
    } catch (error) {
      renderLimitsForm(limitsCache);
      setMessage(msg, setupHint(classifyError(error), LIMITS_SQL) || error.message, true);
    }
  }

  async function saveLimits(event) {
    event?.preventDefault();
    const msg = document.getElementById('limits-message');
    const parsed = validateLimits(readFormValues());
    if (!parsed.ok) {
      setMessage(msg, parsed.error, true);
      return;
    }
    const changes = changedSummary(parsed.values);
    if (!changes.length) {
      setMessage(msg, '没有改动。');
      return;
    }
    const ask = window.confirmLimitChange || window.confirmSensitive || ((text) => Promise.resolve(window.confirm(text)));
    if (!(await ask(changes.join('；')))) return;
    if (isPreview() && !getSession()) {
      renderLimitsForm(LIMIT_FIELDS.map((field) => ({ ...field, value: parsed.values[field.key] })));
      setMessage(msg, `预览已保存 ${changes.length} 项，未写入生产。`);
      return;
    }
    setMessage(msg, '正在保存……');
    try {
      const response = await request('rpc/admin_set_platform_limits', {
        method: 'POST',
        body: JSON.stringify({ p_items: parsed.values }),
      });
      const data = await response.json();
      const changed = Array.isArray(data?.changed) ? data.changed.length : (Array.isArray(data?.changes) ? data.changes.length : changes.length);
      await loadLimits();
      setMessage(msg, changed ? `已保存 ${changed} 项，立即生效。` : '没有改动。');
    } catch (error) {
      setMessage(msg, setupHint(classifyError(error), LIMITS_SQL) || error.message, true);
    }
  }

  document.getElementById('limits-form')?.addEventListener('submit', (event) => {
    saveLimits(event).catch((error) => setMessage(document.getElementById('limits-message'), error.message, true));
  });
  document.getElementById('limits-form')?.addEventListener('input', () => {
    renderAgingPreview(readFormValues());
  });
  document.getElementById('limits-form')?.addEventListener('click', (event) => {
    if (event.target?.id === 'limits-reset') {
      renderLimitsForm(limitsCache);
      setMessage(document.getElementById('limits-message'), '已恢复为上次加载的值。');
    }
  });

  window.AdminLimits = { loadLimits, validateLimits, agingPreviewLabels, LIMIT_FIELDS };
  window.AdminOps = window.AdminOps || {};
  window.AdminOps.loadLimits = loadLimits;
})();
