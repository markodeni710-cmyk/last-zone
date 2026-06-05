// Admin/reserved username utilities — keep in sync with DB trigger `validate_username_reserved`

export const ADMIN_USERNAMES = ["moniromran"];

export function isAdminUsername(username?: string | null): boolean {
  if (!username) return false;
  return ADMIN_USERNAMES.includes(username.trim().toLowerCase());
}

// Words/patterns that are forbidden in any user-chosen username.
// Matching is case-insensitive and substring-based (e.g. "xadminx" is also blocked).
export const RESERVED_USERNAME_PATTERNS = [
  "admin", "administrator", "admın", "adm1n",
  "mod", "moderator", "owner", "founder",
  "support", "helpdesk", "staff", "team",
  "official", "verified", "root", "system",
  "lovable", "lastzone", "last_zone", "last-zone",
  "ceo", "manager", "boss",
  "اداره", "إداره", "ادارة", "إدارة", "مدير", "ادمن", "أدمن", "مشرف", "دعم", "الدعم",
];

export function isReservedUsername(username: string): boolean {
  const u = username.trim().toLowerCase();
  if (!u) return false;
  // Allow the actual admin to keep their handle
  if (ADMIN_USERNAMES.includes(u)) return false;
  return RESERVED_USERNAME_PATTERNS.some((p) => u.includes(p.toLowerCase()));
}
