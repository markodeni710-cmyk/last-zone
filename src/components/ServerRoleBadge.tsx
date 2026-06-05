import { Crown, Shield, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Role = "owner" | "admin" | "moderator" | "member" | null | undefined;
type Size = "xs" | "sm";

const sizeMap: Record<Size, { wrap: string; icon: string }> = {
  xs: { wrap: "px-1.5 py-0.5 gap-1 text-[9px]", icon: "size-2.5" },
  sm: { wrap: "px-2 py-0.5 gap-1 text-[10px]", icon: "size-3" },
};

/**
 * Badge shown next to a member's name inside a server context.
 * - owner     → ذهبي + تاج + نص "مدير"
 * - admin     → ذهبي/أحمر + درع + نص "مدير مساعد"
 * - moderator → أزرق + درع + نص "مشرف"
 * - member    → لا يعرض شيئاً
 */
export function ServerRoleBadge({
  role,
  size = "xs",
  className,
}: {
  role: Role;
  size?: Size;
  className?: string;
}) {
  if (role !== "owner" && role !== "admin" && role !== "moderator") return null;
  const s = sizeMap[size];

  if (role === "owner") {
    return (
      <span
        title="مدير السيرفر"
        className={cn(
          "inline-flex items-center rounded-full font-bold align-middle shrink-0",
          "bg-gradient-gold text-primary-foreground border border-primary/60",
          "shadow-[0_0_10px_rgba(212,170,80,0.4)]",
          s.wrap,
          className,
        )}
      >
        <Crown className={s.icon} />
        مدير
      </span>
    );
  }

  if (role === "admin") {
    return (
      <span
        title="مدير مساعد"
        className={cn(
          "inline-flex items-center rounded-full font-bold align-middle shrink-0",
          "bg-amber-500/15 text-amber-300 border border-amber-400/50",
          "shadow-[0_0_8px_rgba(245,158,11,0.35)]",
          s.wrap,
          className,
        )}
      >
        <ShieldCheck className={s.icon} />
        مدير مساعد
      </span>
    );
  }

  return (
    <span
      title="مشرف السيرفر"
      className={cn(
        "inline-flex items-center rounded-full font-bold align-middle shrink-0",
        "bg-blue-500/15 text-blue-300 border border-blue-400/40",
        s.wrap,
        className,
      )}
    >
      <Shield className={s.icon} />
      مشرف
    </span>
  );
}
