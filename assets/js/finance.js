(() => {
  const MONEY = "零壹贰叁肆伍陆柒捌玖";
  const SMALL = ["", "拾", "佰", "仟"];
  const BIG = ["", "万", "亿"];

  function section(n, digits, small) {
    const text = String(n).padStart(4, "0");
    let out = "";
    let pendingZero = false;
    for (let i = 0; i < 4; i += 1) {
      const d = Number(text[i]);
      if (d === 0) {
        pendingZero = out.length > 0;
        continue;
      }
      if (pendingZero) out += digits[0];
      pendingZero = false;
      out += digits[d] + small[3 - i];
    }
    return out;
  }

  function integerPart(n) {
    if (n === 0) return MONEY[0];
    const blocks = [];
    let rest = n;
    while (rest > 0) {
      blocks.push(rest % 10000);
      rest = Math.floor(rest / 10000);
    }
    let out = "";
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const piece = section(blocks[i], MONEY, SMALL);
      if (piece) {
        if (out && blocks[i] < 1000) out += MONEY[0];
        out += piece + BIG[i];
      } else if (i > 0 && out && !out.endsWith(MONEY[0])) {
        out += MONEY[0];
      }
    }
    return out.replace(/零+/g, "零").replace(/零+$/g, "") || MONEY[0];
  }

  function roundFen(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100 + Number.EPSILON) / 100;
  }

  function formatRmb(n) {
    if (!Number.isFinite(n)) return "—";
    return roundFen(n).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function toMoney(value) {
    const neg = value < 0;
    const cents = Math.round(Math.abs(value) * 100);
    const yuan = Math.floor(cents / 100);
    const jiao = Math.floor((cents % 100) / 10);
    const fen = cents % 10;
    let body = integerPart(yuan) + "元";
    if (jiao === 0 && fen === 0) body += "整";
    else {
      if (jiao) body += MONEY[jiao] + "角";
      else if (fen && yuan) body += "零";
      if (fen) body += MONEY[fen] + "分";
    }
    return (neg ? "负" : "") + body;
  }

  function parseAmount(raw) {
    const text = String(raw || "").trim().replace(/,/g, "").replace(/[￥¥元]/g, "");
    if (!text) return { error: "空行" };
    if (!/^-?\d+(\.\d+)?$/.test(text)) return { error: "无效数字" };
    const value = Number(text);
    if (!Number.isFinite(value) || Math.abs(value) >= 1e12) return { error: "超出范围" };
    return { value };
  }

  const VAT_RATES = [
    { value: 0.13, label: "13%" },
    { value: 0.09, label: "9%" },
    { value: 0.06, label: "6%" },
    { value: 0.05, label: "5%" },
    { value: 0.03, label: "3%" },
    { value: 0.01, label: "1%" },
    { value: 0, label: "0%" },
  ];

  function vatFromInclusive(inclusive, rate) {
    const gross = roundFen(inclusive);
    if (rate <= 0) return { exclusive: gross, tax: 0, inclusive: gross, rate };
    const exclusive = roundFen(gross / (1 + rate));
    return { exclusive, tax: roundFen(gross - exclusive), inclusive: gross, rate };
  }

  function vatFromExclusive(exclusive, rate) {
    const net = roundFen(exclusive);
    const tax = roundFen(net * rate);
    return { exclusive: net, tax, inclusive: roundFen(net + tax), rate };
  }

  const PIT_BRACKETS = [
    { max: 36000, rate: 0.03, quick: 0 },
    { max: 144000, rate: 0.1, quick: 2520 },
    { max: 300000, rate: 0.2, quick: 16920 },
    { max: 420000, rate: 0.25, quick: 31920 },
    { max: 660000, rate: 0.3, quick: 52920 },
    { max: 960000, rate: 0.35, quick: 85920 },
    { max: Infinity, rate: 0.45, quick: 181920 },
  ];
  const MONTHLY_THRESHOLD = 5000;

  function pitOnTaxable(taxable) {
    const amount = Math.max(0, roundFen(taxable));
    const bracket = PIT_BRACKETS.find((item) => amount <= item.max) ?? PIT_BRACKETS[PIT_BRACKETS.length - 1];
    const tax = roundFen(amount * bracket.rate - bracket.quick);
    return {
      taxable: amount,
      tax: Math.max(0, tax),
      rate: amount === 0 ? 0 : bracket.rate,
      quick: amount === 0 ? 0 : bracket.quick,
    };
  }

  function withholdingSchedule({ incomes, specialMonthly, extraMonthly }) {
    const rows = [];
    let prevTax = 0;
    let cumulativeIncome = 0;
    for (let i = 0; i < incomes.length; i += 1) {
      const month = i + 1;
      const income = roundFen(incomes[i] ?? 0);
      cumulativeIncome = roundFen(cumulativeIncome + income);
      const cumulativeDeduction = MONTHLY_THRESHOLD * month;
      const cumulativeSpecial = roundFen(specialMonthly * month);
      const cumulativeExtra = roundFen(extraMonthly * month);
      const taxable = Math.max(0, roundFen(cumulativeIncome - cumulativeDeduction - cumulativeSpecial - cumulativeExtra));
      const assessed = pitOnTaxable(taxable);
      const tax = Math.max(0, roundFen(assessed.tax - prevTax));
      rows.push({
        month,
        income,
        cumulativeIncome,
        taxable,
        cumulativeTax: assessed.tax,
        tax,
        rate: assessed.rate,
      });
      prevTax = assessed.tax;
    }
    return rows;
  }

  const CITY_PRESETS = [
    {
      id: "beijing",
      name: "北京",
      socialMin: 7270,
      socialMax: 36348,
      fundMin: 2540,
      fundMax: 36348,
      employee: { pension: 0.08, medical: 0.02, unemployment: 0.005, injury: 0, maternity: 0, housing: 0.12 },
      employer: { pension: 0.16, medical: 0.098, unemployment: 0.005, injury: 0.004, maternity: 0.008, housing: 0.12 },
      note: "2026 版已核验：社保基数自 2026 年 7 月起；公积金年度为 2026.7–2027.6，比例 5%–12%可调",
      policyYear: "2026", verified: true, verifiedAt: "2026-08-25",
      sources: ["https://rsj.beijing.gov.cn/xxgk/2024zcwj/202608/t20260821_4831461.html", "https://gjj.beijing.gov.cn/web/zwgk61/2024zcwj/436433461/744103382/index.html"],
    },
    {
      id: "shanghai",
      name: "上海",
      socialMin: 7384,
      socialMax: 36921,
      fundMin: 2690,
      fundMax: 36921,
      employee: { pension: 0.08, medical: 0.02, unemployment: 0.005, injury: 0, maternity: 0, housing: 0.07 },
      employer: { pension: 0.16, medical: 0.09, unemployment: 0.005, injury: 0.0026, maternity: 0.01, housing: 0.07 },
      note: "公积金默认 7%（上海上限常见 7%）",
      verifiedParts: "2026 年职工医保单位 9%、个人 2%已核验；完整社保基数仍待官方公布",
      sources: ["https://www.shanghai.gov.cn/gwk/search/content/921e047144694b61b6df8ca0c5ef2cfc"],
    },
    {
      id: "guangzhou",
      name: "广州",
      socialMin: 5500,
      socialMax: 30054,
      fundMin: 2300,
      fundMax: 39579,
      employee: { pension: 0.08, medical: 0.02, unemployment: 0.002, injury: 0, maternity: 0, housing: 0.08 },
      employer: { pension: 0.16, medical: 0.055, unemployment: 0.008, injury: 0.004, maternity: 0.01, housing: 0.08 },
      note: "失业个人常见 0.2%",
    },
    {
      id: "shenzhen",
      name: "深圳",
      socialMin: 4490,
      socialMax: 31938,
      fundMin: 2360,
      fundMax: 41910,
      employee: { pension: 0.08, medical: 0.02, unemployment: 0.003, injury: 0, maternity: 0, housing: 0.05 },
      employer: { pension: 0.16, medical: 0.062, unemployment: 0.007, injury: 0.004, maternity: 0.0045, housing: 0.05 },
      note: "医保按一档口径，公积金默认 5%",
      verifiedParts: "2026 年职工医保基数 6,727–33,633 和一档单位医保费率 6% 已核验；其他险种仍为参考",
      sources: ["https://hsa.sz.gov.cn/szsylbzjwzgkml/szsylbzjwzgkml/qt/tzgg/content/post_12574511.html"],
    },
    {
      id: "hangzhou",
      name: "杭州",
      socialMin: 4932,
      socialMax: 24933,
      fundMin: 2490,
      fundMax: 39582,
      employee: { pension: 0.08, medical: 0.02, unemployment: 0.005, injury: 0, maternity: 0, housing: 0.12 },
      employer: { pension: 0.14, medical: 0.095, unemployment: 0.005, injury: 0.006, maternity: 0.012, housing: 0.12 },
      note: "浙江单位养老常见 14%",
    },
    {
      id: "chengdu",
      name: "成都",
      socialMin: 4511,
      socialMax: 22554,
      fundMin: 2100,
      fundMax: 31986,
      employee: { pension: 0.08, medical: 0.02, unemployment: 0.004, injury: 0, maternity: 0, housing: 0.06 },
      employer: { pension: 0.16, medical: 0.0635, unemployment: 0.006, injury: 0.006, maternity: 0.008, housing: 0.06 },
      note: "公积金默认 6%",
    },
  ];

  const SI_LABELS = [
    { key: "pension", label: "养老保险" },
    { key: "medical", label: "医疗保险" },
    { key: "unemployment", label: "失业保险" },
    { key: "injury", label: "工伤保险" },
    { key: "maternity", label: "生育保险" },
    { key: "housing", label: "住房公积金" },
  ];

  function clampBase(value, min, max) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.min(max, Math.max(min, roundFen(value)));
  }

  function siAmount(base, rate) {
    return roundFen(base * rate);
  }

  function calcSocial({ socialBase, fundBase, employee, employer }) {
    const map = (rates) => {
      const pension = siAmount(socialBase, rates.pension);
      const medical = siAmount(socialBase, rates.medical);
      const unemployment = siAmount(socialBase, rates.unemployment);
      const injury = siAmount(socialBase, rates.injury);
      const maternity = siAmount(socialBase, rates.maternity);
      const housing = siAmount(fundBase, rates.housing);
      return {
        pension,
        medical,
        unemployment,
        injury,
        maternity,
        housing,
        total: roundFen(pension + medical + unemployment + injury + maternity + housing),
      };
    };
    return {
      socialBase: roundFen(socialBase),
      fundBase: roundFen(fundBase),
      employee: map(employee),
      employer: map(employer),
    };
  }

  window.UtiloraFinance = {
    roundFen,
    formatRmb,
    toMoney,
    parseAmount,
    VAT_RATES,
    vatFromInclusive,
    vatFromExclusive,
    PIT_BRACKETS,
    MONTHLY_THRESHOLD,
    pitOnTaxable,
    withholdingSchedule,
    CITY_PRESETS,
    SI_LABELS,
    clampBase,
    calcSocial,
  };
})();
