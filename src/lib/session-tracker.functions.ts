import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { createHash } from "crypto";

function hashIp(ip: string): string {
  // Salt prevents trivial rainbow lookups while keeping matching stable
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 16) ?? "lz-salt";
  return createHash("sha256").update(salt + ":" + ip).digest("hex");
}

function ipPrefix(ip: string): string | null {
  if (!ip) return null;
  // IPv4 /24 (first 3 octets) or IPv6 first 4 groups
  if (ip.includes(":")) {
    return ip.split(":").slice(0, 4).join(":") + "::/64";
  }
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  return null;
}

async function fetchCountryFallback(ip: string): Promise<string | null> {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/country/`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const txt = (await res.text()).trim();
    if (/^[A-Z]{2}$/.test(txt)) return txt;
    return null;
  } catch {
    return null;
  }
}

export const recordSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        fingerprint: z.string().max(128).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Prefer Cloudflare's connecting IP; fall back to standard headers
    const cfIp = getRequestHeader("cf-connecting-ip");
    const xff = getRequestHeader("x-forwarded-for");
    const ip =
      cfIp ||
      (xff ? xff.split(",")[0].trim() : "") ||
      getRequestIP({ xForwardedFor: true }) ||
      "0.0.0.0";

    // Cloudflare provides country code for free in CF-IPCountry header
    const cfCountry = getRequestHeader("cf-ipcountry");
    let country: string | null = null;
    if (cfCountry && /^[A-Z]{2}$/.test(cfCountry) && cfCountry !== "XX") {
      country = cfCountry;
    } else {
      country = await fetchCountryFallback(ip);
    }

    const ua = getRequestHeader("user-agent")?.slice(0, 500) ?? null;
    const asn = getRequestHeader("cf-ipasn") ?? null;

    const { error } = await supabase.rpc("record_account_session", {
      _ip_hash: hashIp(ip),
      _ip_prefix: ipPrefix(ip) as any,
      _country_code: country as any,
      _fingerprint: (data.fingerprint ?? null) as any,
      _user_agent: ua as any,
      _asn: asn as any,
    });

    if (error) throw new Error(error.message);

    return { country };
  });

export const getSuspiciousAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("get_suspicious_accounts");
    if (error) throw new Error(error.message);
    return { groups: data ?? [] };
  });

export const getUserSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // RLS allows only admin to read; will return [] for non-admins
    const { data: sessions, error } = await supabase
      .from("account_sessions")
      .select("id, ip_hash, ip_prefix, country_code, fingerprint, user_agent, asn, created_at, last_seen_at")
      .eq("user_id", data.userId)
      .order("last_seen_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { sessions: sessions ?? [] };
  });
