export const routes = {
  home: "/",
  login: "/login/",
  account: "/account/",
  pro: "/pro/",
  admin: "/admin/",
  feedback: "/feedback/"
} as const;

export const safeReturnPath = (value: string | null, fallback = routes.account): string => {
  if (!value || value.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(value)) return fallback;
  return value.startsWith("/") || value.startsWith("../") || value.startsWith("./") ? value : fallback;
};