import { ShieldCheck } from "lucide-react";
import { isAdminUsername } from "@/lib/admin-utils";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md";

const sizeMap: Record<Size, { wrap: string; icon: string; text: string }> = {
  xs: { wrap: "px-1.5 py-0.5 gap-1 text-[9px]", icon: "size-2.5", text: "" },
  sm: { wrap: "px-2 py-0.5 gap-1 text-[10px]", icon: "size-3", text: "" },
  md: { wrap: "px-2.5 py-1 gap-1.5 text-xs", icon: "size-3.5", text: "" },
};

/**
 * Visual badge shown next to the admin's name everywhere in the app.
 * Pass either `username` (auto-detected) or `force` to render unconditionally.
 */
export function AdminBadge({
  username,
  size = "sm",
  className,
  label = "إدارة",
  force,
}: {
  username?: string | null;
  size?: Size;
  className?: string;
  label?: string;
  force?: boolean;
}) {
  if (!force && !isAdminUsername(username)) return null;
  const s = sizeMap[size];
  return (
    <span
      title="حساب الإدارة الرسمي"
      className={cn(
        "inline-flex items-center rounded-full font-bold uppercase tracking-wider",
        "bg-gradient-gold text-primary-foreground shadow-[0_0_12px_rgba(212,170,80,0.45)]",
        "border border-primary/60 align-middle shrink-0",
        s.wrap,
        className,
      )}
    >
      <ShieldCheck className={s.icon} />
      {label}
    </span>
  );
}

/**
 * Wraps a display name + admin badge in one inline flex container.
 * Use this anywhere a name is shown next to a profile.
 */
export function NameWithAdminBadge({
  username,
  name,
  size = "sm",
  className,
  nameClassName,
}: {
  username?: string | null;
  name: React.ReactNode;
  size?: Size;
  className?: string;
  nameClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 min-w-0", className)}>
      <span className={cn("truncate", isAdminUsername(username) && "text-primary", nameClassName)}>
        {name}
      </span>
      <AdminBadge username={username} size={size} />
    </span>
  );
}
