import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KEYS = ["AGORA_APP_ID", "AGORA_APP_CERTIFICATE"] as const;

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
  if (!data || data.username !== "moniromran") throw new Error("unauthorized");
}

function mask(v: string | null | undefined) {
  if (!v) return "";
  if (v.length <= 6) return "•".repeat(v.length);
  return v.slice(0, 3) + "•".repeat(Math.max(v.length - 6, 4)) + v.slice(-3);
}

export const getAgoraSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data } = await supabase.from("app_settings").select("key, value, updated_at").in("key", KEYS as unknown as string[]);
    const map = new Map((data ?? []).map((r: any) => [r.key, r]));

    const result: Record<string, { hasValue: boolean; masked: string; updated_at: string | null; fromEnv: boolean }> = {};
    for (const k of KEYS) {
      const row: any = map.get(k);
      const dbVal = row?.value as string | undefined;
      const envVal = process.env[k];
      const effective = dbVal || envVal || "";
      result[k] = {
        hasValue: !!effective,
        masked: mask(effective),
        updated_at: row?.updated_at ?? null,
        fromEnv: !dbVal && !!envVal,
      };
    }
    return result;
  });

const updateSchema = z.object({
  key: z.enum(KEYS),
  value: z.string().min(1).max(512),
});

export const updateAgoraSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: data.key, value: data.value.trim(), updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
