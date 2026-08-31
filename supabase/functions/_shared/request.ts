/** 请求 IP 与哈希。盐只用 REGISTRATION_IP_SALT，不用 service-role。 */

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for") || "";
  const first = xf.split(",")[0]?.trim();
  if (first) return first;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  return "0.0.0.0";
}

export async function hashIp(value: string): Promise<string> {
  const salt = Deno.env.get("REGISTRATION_IP_SALT") || "utilora";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(salt + "|" + value),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function rpc(
  name: string,
  args: Record<string, unknown>,
  serviceKey: string,
  apiUrl: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const response = await fetch(`${apiUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  return { ok: response.ok, status: response.status, data };
}
