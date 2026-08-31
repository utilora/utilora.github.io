(() => {
  let framed = false;
  try {
    framed = window.top !== window.self;
  } catch {
    framed = true;
  }
  if (!framed) return;
  document.documentElement.style.display = "none";
  try {
    window.top.location.replace(location.href);
  } catch {
    /* 父页禁止跳出时保持空白 */
  }
})();
