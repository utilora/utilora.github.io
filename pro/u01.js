(() => {
  const STORAGE_KEY = "utilora_bank_ignored_v1";
  const view = document.getElementById("view");
  if (!view) return;

  const readIgnored = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const writeIgnored = (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value));

  const bankPanel = () => [...view.querySelectorAll(".panel")].find((panel) =>
    panel.querySelector("h2")?.textContent?.trim() === "流水明细" || panel.dataset.u01Queue === "1"
  );

  const enhance = () => {
    if (location.hash !== "#/bank") return;
    const panel = bankPanel();
    if (!panel) return;
    panel.dataset.u01Queue = "1";
    const heading = panel.querySelector("h2");
    if (heading) heading.textContent = "待处理流水";

    let note = panel.querySelector("[data-u01-note]");
    if (!note) {
      note = document.createElement("p");
      note.className = "data-note";
      note.dataset.u01Note = "1";
      note.textContent = "这里只显示仍有待匹配金额的流水；已匹配和已忽略流水不进入待处理队列。";
      heading?.insertAdjacentElement("afterend", note);
    }

    const ignored = readIgnored();
    const rows = [...panel.querySelectorAll("tbody tr")];
    let visible = 0;
    rows.forEach((row) => {
      const matchButton = row.querySelector("[data-bank-match]");
      const txId = matchButton?.dataset.bankMatch;
      if (!txId) {
        row.hidden = true;
        return;
      }
      if (ignored[txId]) {
        row.hidden = true;
        return;
      }
      row.hidden = false;
      visible += 1;
      const actionCell = row.lastElementChild;
      if (actionCell && !row.querySelector("[data-bank-ignore]")) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary";
        button.dataset.bankIgnore = txId;
        button.textContent = "忽略";
        actionCell.append(" ", button);
      }
    });

    let empty = panel.querySelector("[data-u01-empty]");
    if (!visible) {
      if (!empty) {
        empty = document.createElement("p");
        empty.className = "empty";
        empty.dataset.u01Empty = "1";
        panel.appendChild(empty);
      }
      empty.textContent = "当前没有待处理流水。";
    } else if (empty) {
      empty.remove();
    }

    view.querySelectorAll("[data-suggest]").forEach((input) => {
      const row = input.closest("tr");
      if (row) row.hidden = Boolean(ignored[input.dataset.tx]);
    });

    const oldIgnoredPanel = view.querySelector("[data-u01-ignored-panel]");
    oldIgnoredPanel?.remove();
    const entries = Object.entries(ignored);
    if (entries.length) {
      const ignoredPanel = document.createElement("div");
      ignoredPanel.className = "panel";
      ignoredPanel.style.marginTop = "14px";
      ignoredPanel.dataset.u01IgnoredPanel = "1";
      ignoredPanel.innerHTML = `<h2>已忽略流水</h2><p class="data-note">忽略只把流水移出待处理队列，不会生成收款或修改应收；可随时撤销。</p><div class="table-wrap"><table class="sheet-table"><thead><tr><th>日期</th><th>摘要</th><th>金额</th><th></th></tr></thead><tbody>${entries.map(([id, item]) => `<tr><td>${item.date || "—"}</td><td>${item.summary || "—"}</td><td>${item.amount || "—"}</td><td><button class="secondary" type="button" data-bank-restore="${id}">撤销忽略</button></td></tr>`).join("")}</tbody></table></div>`;
      panel.insertAdjacentElement("afterend", ignoredPanel);
    }
  };

  view.addEventListener("click", (event) => {
    const ignoreButton = event.target.closest("[data-bank-ignore]");
    if (ignoreButton) {
      const txId = ignoreButton.dataset.bankIgnore;
      const row = ignoreButton.closest("tr");
      const cells = row ? [...row.children] : [];
      const ignored = readIgnored();
      ignored[txId] = {
        date: cells[0]?.textContent?.trim() || "",
        summary: cells[1]?.textContent?.trim() || "",
        amount: cells[2]?.textContent?.trim() || ""
      };
      writeIgnored(ignored);
      enhance();
      return;
    }

    const restoreButton = event.target.closest("[data-bank-restore]");
    if (restoreButton) {
      const ignored = readIgnored();
      delete ignored[restoreButton.dataset.bankRestore];
      writeIgnored(ignored);
      enhance();
    }
  });

  let queued = false;
  const queueEnhance = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhance();
    });
  };

  new MutationObserver(queueEnhance).observe(view, { childList: true, subtree: true });
  window.addEventListener("hashchange", queueEnhance);
  queueEnhance();
})();
