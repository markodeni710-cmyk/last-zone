import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_USER_ID = "fcd2e2c7-9673-4adc-b1d0-d4fa27aff1d8";
async function assertAdmin(supabase: any, userId: string) {
  if (userId === ADMIN_USER_ID) return;
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  if (!data || data.username !== "moniromran") {
    throw new Error("forbidden");
  }
}

export const setUserSuspension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        suspend: z.boolean(),
        reason: z.string().max(500).optional().nullable(),
        // duration in hours; null/undefined = permanent when suspend=true
        durationHours: z.number().int().positive().max(24 * 365).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const now = new Date();
    const until =
      data.suspend && data.durationHours
        ? new Date(now.getTime() + data.durationHours * 3600 * 1000).toISOString()
        : null;
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        suspended_at: data.suspend ? now.toISOString() : null,
        suspension_reason: data.suspend ? data.reason ?? null : null,
        suspended_until: until,
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    if (data.suspend) {
      await supabaseAdmin.auth.admin.signOut(data.userId).catch(() => {});
    } else {
      await supabaseAdmin.from("notifications").insert({
        user_id: data.userId,
        type: "account_reactivated",
        title: "تم تفعيل حسابك",
        body: "تم إلغاء التجميد عن حسابك ويمكنك استخدام التطبيق الآن.",
      });
    }
    return { ok: true };
  });

export const adminRenameUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        username: z
          .string()
          .trim()
          .min(3)
          .max(30)
          .regex(/^[a-zA-Z0-9_]+$/, "اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام و _ فقط")
          .optional(),
        displayName: z.string().trim().min(1).max(50).optional(),
        reason: z.string().trim().max(500).optional().default(""),
      })
      .refine((d) => d.username || d.displayName, { message: "يجب تغيير الاسم أو المعرف" })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    // Fetch existing values for the notification body
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("username, display_name")
      .eq("id", data.userId)
      .maybeSingle();
    if (!existing) throw new Error("user_not_found");

    // Ensure username is unique if changing
    if (data.username && data.username !== existing.username) {
      const { data: clash } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("username", data.username)
        .neq("id", data.userId)
        .maybeSingle();
      if (clash) throw new Error("username_taken");
    }

    const updates: { username?: string; display_name?: string } = {};
    if (data.username) updates.username = data.username;
    if (data.displayName) updates.display_name = data.displayName;

    const { error } = await supabaseAdmin.from("profiles").update(updates).eq("id", data.userId);

    if (error) throw new Error(error.message);

    const changes: string[] = [];
    if (data.username && data.username !== existing.username) {
      changes.push(`المعرف: @${existing.username} ← @${data.username}`);
    }
    if (data.displayName && data.displayName !== existing.display_name) {
      changes.push(`الاسم: ${existing.display_name ?? "—"} ← ${data.displayName}`);
    }

    await supabaseAdmin.from("notifications").insert({
      user_id: data.userId,
      type: "name_violation",
      title: "تم تعديل اسمك لمخالفته الشروط",
      body: `${data.reason}\n\n${changes.join("\n")}`,
      metadata: {
        previous_username: existing.username,
        previous_display_name: existing.display_name,
        new_username: data.username ?? existing.username,
        new_display_name: data.displayName ?? existing.display_name,
        reason: data.reason,
      },
    });

    return { ok: true };
  });




export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("cannot_delete_self");

    // 1. Collect this user's session signatures BEFORE deletion
    const { data: mySessions } = await supabaseAdmin
      .from("account_sessions")
      .select("ip_hash, fingerprint")
      .eq("user_id", data.userId);
    const ipHashes = Array.from(
      new Set((mySessions ?? []).map((s: any) => s.ip_hash).filter(Boolean)),
    );
    const fingerprints = Array.from(
      new Set((mySessions ?? []).map((s: any) => s.fingerprint).filter(Boolean)),
    );

    // 2. Find users linked to this account (sharing IP or fingerprint)
    const linkedUserIds = new Set<string>();
    if (ipHashes.length) {
      const { data: r } = await supabaseAdmin
        .from("account_sessions")
        .select("user_id")
        .in("ip_hash", ipHashes)
        .neq("user_id", data.userId);
      (r ?? []).forEach((s: any) => linkedUserIds.add(s.user_id));
    }
    if (fingerprints.length) {
      const { data: r } = await supabaseAdmin
        .from("account_sessions")
        .select("user_id")
        .in("fingerprint", fingerprints)
        .neq("user_id", data.userId);
      (r ?? []).forEach((s: any) => linkedUserIds.add(s.user_id));
    }

    // 3. Delete sessions + auth user
    await supabaseAdmin.from("account_sessions").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    // 4. For each previously linked user, check if they're still linked to any
    //    other account. If not, and they're suspended, unsuspend + notify.
    const reactivated: string[] = [];
    for (const uid of linkedUserIds) {
      const { data: us } = await supabaseAdmin
        .from("account_sessions")
        .select("ip_hash, fingerprint")
        .eq("user_id", uid);
      const uIp = Array.from(new Set((us ?? []).map((s: any) => s.ip_hash).filter(Boolean)));
      const uFp = Array.from(new Set((us ?? []).map((s: any) => s.fingerprint).filter(Boolean)));

      let stillLinked = false;
      if (uIp.length) {
        const { count } = await supabaseAdmin
          .from("account_sessions")
          .select("user_id", { count: "exact", head: true })
          .in("ip_hash", uIp)
          .neq("user_id", uid);
        if ((count ?? 0) > 0) stillLinked = true;
      }
      if (!stillLinked && uFp.length) {
        const { count } = await supabaseAdmin
          .from("account_sessions")
          .select("user_id", { count: "exact", head: true })
          .in("fingerprint", uFp)
          .neq("user_id", uid);
        if ((count ?? 0) > 0) stillLinked = true;
      }

      if (!stillLinked) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("suspended_at")
          .eq("id", uid)
          .maybeSingle();
        if (prof?.suspended_at) {
          await supabaseAdmin
            .from("profiles")
            .update({
              suspended_at: null,
              suspension_reason: null,
              suspended_until: null,
            })
            .eq("id", uid);
          await supabaseAdmin.from("notifications").insert({
            user_id: uid,
            type: "account_reactivated",
            title: "تم تفعيل حسابك ✅",
            body: "تم إلغاء تجميد حسابك بعد التحقق من حذف الحسابات المكررة. أهلاً بعودتك!",
          });
          reactivated.push(uid);
        }
      }
    }

    return { ok: true, reactivated_count: reactivated.length };
  });

// ===== Self-service for suspended users =====

export const getMyLinkedAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const { data: mySessions } = await supabaseAdmin
      .from("account_sessions")
      .select("ip_hash, fingerprint")
      .eq("user_id", uid);
    const ipHashes = Array.from(
      new Set((mySessions ?? []).map((s: any) => s.ip_hash).filter(Boolean)),
    );
    const fingerprints = Array.from(
      new Set((mySessions ?? []).map((s: any) => s.fingerprint).filter(Boolean)),
    );

    const linked = new Set<string>();
    if (ipHashes.length) {
      const { data: r } = await supabaseAdmin
        .from("account_sessions")
        .select("user_id")
        .in("ip_hash", ipHashes)
        .neq("user_id", uid);
      (r ?? []).forEach((s: any) => linked.add(s.user_id));
    }
    if (fingerprints.length) {
      const { data: r } = await supabaseAdmin
        .from("account_sessions")
        .select("user_id")
        .in("fingerprint", fingerprints)
        .neq("user_id", uid);
      (r ?? []).forEach((s: any) => linked.add(s.user_id));
    }

    const ids = Array.from(linked);
    if (!ids.length) return { accounts: [] };

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, username, display_name, avatar_url, suspended_at")
      .in("id", ids);

    return { accounts: profiles ?? [] };
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;

    const { data: mySessions } = await supabaseAdmin
      .from("account_sessions")
      .select("ip_hash, fingerprint")
      .eq("user_id", uid);
    const ipHashes = Array.from(
      new Set((mySessions ?? []).map((s: any) => s.ip_hash).filter(Boolean)),
    );
    const fingerprints = Array.from(
      new Set((mySessions ?? []).map((s: any) => s.fingerprint).filter(Boolean)),
    );

    const linkedUserIds = new Set<string>();
    if (ipHashes.length) {
      const { data: r } = await supabaseAdmin
        .from("account_sessions")
        .select("user_id")
        .in("ip_hash", ipHashes)
        .neq("user_id", uid);
      (r ?? []).forEach((s: any) => linkedUserIds.add(s.user_id));
    }
    if (fingerprints.length) {
      const { data: r } = await supabaseAdmin
        .from("account_sessions")
        .select("user_id")
        .in("fingerprint", fingerprints)
        .neq("user_id", uid);
      (r ?? []).forEach((s: any) => linkedUserIds.add(s.user_id));
    }

    await supabaseAdmin.from("account_sessions").delete().eq("user_id", uid);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (error) throw new Error(error.message);

    for (const otherId of linkedUserIds) {
      const { data: us } = await supabaseAdmin
        .from("account_sessions")
        .select("ip_hash, fingerprint")
        .eq("user_id", otherId);
      const uIp = Array.from(new Set((us ?? []).map((s: any) => s.ip_hash).filter(Boolean)));
      const uFp = Array.from(new Set((us ?? []).map((s: any) => s.fingerprint).filter(Boolean)));

      let stillLinked = false;
      if (uIp.length) {
        const { count } = await supabaseAdmin
          .from("account_sessions")
          .select("user_id", { count: "exact", head: true })
          .in("ip_hash", uIp)
          .neq("user_id", otherId);
        if ((count ?? 0) > 0) stillLinked = true;
      }
      if (!stillLinked && uFp.length) {
        const { count } = await supabaseAdmin
          .from("account_sessions")
          .select("user_id", { count: "exact", head: true })
          .in("fingerprint", uFp)
          .neq("user_id", otherId);
        if ((count ?? 0) > 0) stillLinked = true;
      }

      if (!stillLinked) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("suspended_at")
          .eq("id", otherId)
          .maybeSingle();
        if (prof?.suspended_at) {
          await supabaseAdmin
            .from("profiles")
            .update({
              suspended_at: null,
              suspension_reason: null,
              suspended_until: null,
            })
            .eq("id", otherId);
          await supabaseAdmin.from("notifications").insert({
            user_id: otherId,
            type: "account_reactivated",
            title: "تم تفعيل حسابك ✅",
            body: "تم إلغاء تجميد حسابك بعد التحقق من حذف الحسابات المكررة. أهلاً بعودتك!",
          });
        }
      }
    }

    return { ok: true };
  });

export const getUserOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const uid = data.userId;

    const [
      profile,
      ownedServers,
      memberServers,
      clipsPosted,
      clipComments,
      squadsPosted,
      squadJoined,
      tournamentsOrganized,
      tournamentRegs,
    ] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, country, rank, pubg_id, role, kd, last_seen_at, created_at, suspended_at, suspension_reason, suspended_until")
        .eq("id", uid)
        .maybeSingle(),
      supabaseAdmin
        .from("servers")
        .select("id, name, member_count, is_public, created_at")
        .eq("owner_id", uid)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("server_members")
        .select("role, joined_at, servers!inner(id, name, member_count)")
        .eq("user_id", uid)
        .neq("role", "owner")
        .order("joined_at", { ascending: false }),
      supabaseAdmin
        .from("clips")
        .select("id, caption, likes_count, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("clip_comments")
        .select("id, content, created_at, clip_id")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("squad_listings")
        .select("id, title, mode, status, slots_needed, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("squad_applications")
        .select("id, status, created_at, listing_id, squad_listings(title, mode)")
        .eq("applicant_id", uid)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("tournaments")
        .select("id, name, status, max_teams, starts_at, created_at")
        .eq("organizer_id", uid)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("tournament_registrations")
        .select("id, team_name, status, created_at, tournaments(name, status)")
        .or(`captain_id.eq.${uid},members_ids.cs.{${uid}}`)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    return {
      profile: profile.data,
      ownedServers: ownedServers.data ?? [],
      memberServers: memberServers.data ?? [],
      clipsPosted: clipsPosted.data ?? [],
      clipComments: clipComments.data ?? [],
      squadsPosted: squadsPosted.data ?? [],
      squadJoined: squadJoined.data ?? [],
      tournamentsOrganized: tournamentsOrganized.data ?? [],
      tournamentsJoined: tournamentRegs.data ?? [],
    };
  });


const idsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

export const adminDeleteServers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("servers").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminLeaveServers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid(), serverIds: z.array(z.string().uuid()).min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("server_members")
      .delete()
      .eq("user_id", data.userId)
      .in("server_id", data.serverIds);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteClips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("clips").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteClipComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("clip_comments").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteSquads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("squad_listings").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteSquadApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("squad_applications").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteTournaments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("tournaments").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteTournamentRegistrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("tournament_registrations").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
