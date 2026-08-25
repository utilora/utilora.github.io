(() => {
  const F = window.UtiloraFinance;
  const citySel = document.getElementById("city");
  const monthSel = document.getElementById("month");
  const now = new Date().getMonth() + 1;
  citySel.innerHTML = F.CITY_PRESETS.map((item) => `<option value="${item.id}" ${item.id === "shanghai" ? "selected" : ""}>${item.name}</option>`).join("");
  monthSel.innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === now ? "selected" : ""}>${i + 1} 月</option>`).join("");

  function pct(rate) {
    return `${F.roundFen(rate * 100)}%`;
  }

  function num(id) {
    return Math.max(0, Number(document.getElementById(id).value) || 0);
  }

  function city() {
    return F.CITY_PRESETS.find((item) => item.id === citySel.value) ?? F.CITY_PRESETS[0];
  }

  function render() {
    const preset = city();
    const pay = num("gross");
    const housing = Math.min(0.12, Math.max(0, num("housingPct") / 100));
    const extraMonthly = num("extra");
    const month = Math.min(12, Math.max(1, Number(monthSel.value) || 1));
    const customSocial = document.getElementById("customSocial").value.trim();
    const customFund = document.getElementById("customFund").value.trim();
    const socialBase = customSocial ? num("customSocial") : F.clampBase(pay, preset.socialMin, preset.socialMax);
    const fundBase = customFund ? num("customFund") : F.clampBase(pay, preset.fundMin, preset.fundMax);
    document.getElementById("socialHint").textContent = `${preset.name} ${preset.socialMin}–${preset.socialMax}`;
    document.getElementById("fundHint").textContent = `${preset.fundMin}–${preset.fundMax}`;
    document.getElementById("cityNote").innerHTML = preset.verified ? `✅ ${preset.note}。<a href="${preset.sources[0]}" target="_blank" rel="noopener">社保来源</a> · <a href="${preset.sources[1]}" target="_blank" rel="noopener">公积金来源</a>` : `⚠️ ${preset.note}。当前为参考参数，请以当地最新通知为准；基数与比例均可改。`;
    if (!customSocial) document.getElementById("customSocial").placeholder = String(socialBase);
    if (!customFund) document.getElementById("customFund").placeholder = String(fundBase);

    const employee = { ...preset.employee, housing };
    const employer = { ...preset.employer, housing };
    const si = F.calcSocial({ socialBase, fundBase, employee, employer });
    const schedule = F.withholdingSchedule({
      incomes: Array.from({ length: month }, () => pay),
      specialMonthly: si.employee.total,
      extraMonthly,
    });
    const taxRow = schedule[schedule.length - 1];
    const net = F.roundFen(pay - si.employee.total - extraMonthly - taxRow.tax);
    const companyCost = F.roundFen(pay + si.employer.total);

    document.getElementById("stats").innerHTML = `
      <div class="stat"><strong>${F.formatRmb(net)}</strong>实发工资</div>
      <div class="stat"><strong>${F.formatRmb(si.employee.total)}</strong>个人五险一金</div>
      <div class="stat"><strong>${F.formatRmb(taxRow.tax)}</strong>${month} 月个税</div>
      <div class="stat"><strong>${F.formatRmb(companyCost)}</strong>企业成本</div>`;
    document.getElementById("siTable").innerHTML = F.SI_LABELS.map((item) => `
      <tr>
        <td>${item.label}</td>
        <td>${F.formatRmb(si.employee[item.key])}</td>
        <td>${F.formatRmb(si.employer[item.key])}</td>
        <td>${pct(employee[item.key])}</td>
        <td>${pct(employer[item.key])}</td>
      </tr>`).join("") + `
      <tr>
        <td>合计</td>
        <td>${F.formatRmb(si.employee.total)}</td>
        <td>${F.formatRmb(si.employer.total)}</td>
        <td colspan="2">社保基数 ${F.formatRmb(si.socialBase)}　公积金 ${F.formatRmb(si.fundBase)}</td>
      </tr>`;
    document.getElementById("formula").innerHTML = `
      <p>应发 ${F.formatRmb(pay)} − 个人社保公积金 ${F.formatRmb(si.employee.total)}${extraMonthly ? ` − 专项附加 ${F.formatRmb(extraMonthly)}` : ""} − 个税 ${F.formatRmb(taxRow.tax)} = <strong>实发 ${F.formatRmb(net)}</strong></p>
      <p class="muted">累计应纳税所得额 ${F.formatRmb(taxRow.taxable)}，适用 ${pct(taxRow.rate)}。企业另缴 ${F.formatRmb(si.employer.total)}，合计用工成本 ${F.formatRmb(companyCost)}。</p>`;
    document.getElementById("copy").onclick = async () => {
      await navigator.clipboard.writeText(`税前 ${F.formatRmb(pay)}｜个人五险一金 ${F.formatRmb(si.employee.total)}｜个税 ${F.formatRmb(taxRow.tax)}｜实发 ${F.formatRmb(net)}｜企业成本 ${F.formatRmb(companyCost)}`);
      document.getElementById("message").textContent = "已复制工资拆分";
    };
  }

  citySel.addEventListener("change", () => {
    const preset = city();
    document.getElementById("housingPct").value = String(F.roundFen(preset.employee.housing * 100));
    render();
  });
  document.getElementById("sample").onclick = () => {
    document.getElementById("gross").value = "20000";
    document.getElementById("extra").value = "0";
    document.getElementById("customSocial").value = "";
    document.getElementById("customFund").value = "";
    render();
  };
  document.querySelectorAll("input, select").forEach((node) => {
    node.addEventListener("input", render);
    node.addEventListener("change", render);
  });
  render();
})();
