/**
 * S-10：公开页必须带 CSP meta；禁止可执行内联脚本（JSON-LD 除外，须带哈希）。
 * 运行：node tests/csp.test.js
 * 构建产物：CHECK_DIST=1 node tests/csp.test.js
 */
const { createHash } = require("node:crypto");
const { existsSync, readdirSync, readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const POLICY =
  "default-src 'self'; base-uri 'none'; object-src 'none'; script-src 'self' 'sha256-Qh+9xkTNhTOw2jXvTpp0GWe0474h6HJvhkkrM/ZlwhE=' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://challenges.cloudflare.com; font-src 'self'; connect-src 'self' https://nkxgnqzdswugbjjquxfj.supabase.co wss://nkxgnqzdswugbjjquxfj.supabase.co https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; form-action 'self'; manifest-src 'self'; worker-src 'self' blob:; upgrade-insecure-requests";

const JSON_LD =
  '{"@context":"https://schema.org","@type":"WebSite","name":"Utilora 财务工具","url":"https://utilora.github.io/","description":"免费财务工具 + 专业财务工作台。免费工具永久免费、匿名、无需登录。"}';

const expectedHash = createHash("sha256").update(JSON_LD, "utf8").digest("base64");
assert(expectedHash === "Qh+9xkTNhTOw2jXvTpp0GWe0474h6HJvhkkrM/ZlwhE=", "json-ld hash mismatch");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, out);
    else if (name.endsWith(".html")) out.push(path);
  }
  return out;
}

function checkPage(path, html) {
  assert(html.includes(`http-equiv="Content-Security-Policy"`), `${path} missing CSP meta`);
  assert(html.includes(POLICY), `${path} CSP policy mismatch`);
  assert(html.includes('name="referrer"'), `${path} missing referrer policy`);
  assert(/object-src 'none'/.test(html), `${path} missing object-src none`);
  assert(/base-uri 'none'/.test(html), `${path} missing base-uri none`);
  assert(!/script-src[^;]*'unsafe-inline'/.test(html), `${path} must not allow unsafe-inline scripts`);
  const scriptTag = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptTag.exec(html))) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = /type\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] || "";
    if (type.toLowerCase() === "application/ld+json") {
      assert(body.trim() === JSON_LD, `${path} json-ld body must match hashed payload`);
      continue;
    }
    if (body.trim()) {
      throw new Error(`${path} has executable inline script`);
    }
  }
}

const vite = readFileSync("vite.config.ts", "utf8");
assert(/modulePreload:\s*\{\s*polyfill:\s*false\s*\}/.test(vite), "vite must disable modulepreload polyfill");

const pages = walk(".").filter((path) => !path.includes("supabase/templates"));
assert(pages.length >= 10, "expected public html pages");
for (const path of pages) {
  checkPage(path, readFileSync(path, "utf8"));
}

if (process.env.CHECK_DIST === "1") {
  assert(existsSync("dist"), "dist/ missing; run npm run build first");
  const distPages = walk("dist");
  assert(distPages.length >= 10, "expected dist html pages");
  for (const path of distPages) {
    checkPage(path, readFileSync(path, "utf8"));
  }
  console.log(`csp.test.js: ok (${pages.length} source, ${distPages.length} dist)`);
} else {
  console.log(`csp.test.js: ok (${pages.length} pages)`);
}
