(() => {
  const menu = document.querySelector(".mobile-menu");
  const links = document.querySelector(".finance-nav-links");
  menu?.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    menu.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll(".finance-nav-links a").forEach((a) => {
    a.addEventListener("click", () => links.classList.remove("open"));
  });
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  const amount = document.getElementById("home-vat-amount");
  const rate = document.getElementById("home-vat-rate");
  if (!amount || !rate) return;
  const fmt = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" });
  const calc = () => {
    const gross = Math.max(0, Number(amount.value) || 0);
    const r = (Number(rate.value) || 0) / 100;
    const net = Math.round((gross / (1 + r)) * 100) / 100;
    document.getElementById("home-vat-net").textContent = fmt.format(net);
    document.getElementById("home-vat-tax").textContent = fmt.format(Math.round((gross - net) * 100) / 100);
  };
  amount.addEventListener("input", calc);
  rate.addEventListener("change", calc);
  calc();
})();
