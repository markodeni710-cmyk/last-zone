import { supabase } from "@/integrations/supabase/client";

export type FriendStatus =
  | { kind: "none" }
  | { kind: "pending_outgoing"; id: string }
  | { kind: "pending_incoming"; id: string }
  | { kind: "friends"; id: string };

export async function getFriendStatus(otherId: string): Promise<FriendStatus> {
  const { data: me } = await supabase.auth.getUser();
  const myId = me.user?.id;
  if (!myId || myId === otherId) return { kind: "none" };
  const { data } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .or(
      `and(requester_id.eq.${myId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${myId})`,
    )
    .maybeSingle();
  if (!data) return { kind: "none" };
  if (data.status === "accepted") return { kind: "friends", id: data.id };
  return data.requester_id === myId
    ? { kind: "pending_outgoing", id: data.id }
    : { kind: "pending_incoming", id: data.id };
}

export async function sendFriendRequest(otherId: string) {
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) throw new Error("not authenticated");
  const { error } = await supabase
    .from("friendships")
    .insert({ requester_id: me.user.id, addressee_id: otherId, status: "pending" });
  if (error) throw error;
}

export async function cancelFriendRequest(id: string) {
  const { error } = await supabase.from("friendships").delete().eq("id", id);
  if (error) throw error;
}

export async function acceptFriendRequest(id: string) {
  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function rejectFriendRequest(id: string) {
  const { error } = await supabase.from("friendships").delete().eq("id", id);
  if (error) throw error;
}

export async function unfriend(id: string) {
  const { error } = await supabase.from("friendships").delete().eq("id", id);
  if (error) throw error;
}

export async function getOrCreateDmThread(otherId: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_or_create_dm_thread", { _other: otherId });
  if (error) throw error;
  return data as string;
}

export type BlockStatus = { blockedByMe: boolean; blockedMe: boolean; myBlockId: string | null };

export async function getBlockStatus(otherId: string): Promise<BlockStatus> {
  const { data: me } = await supabase.auth.getUser();
  const myId = me.user?.id;
  if (!myId) return { blockedByMe: false, blockedMe: false, myBlockId: null };
  const { data } = await supabase
    .from("user_blocks")
    .select("id, blocker_id, blocked_id")
    .or(`and(blocker_id.eq.${myId},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${myId})`);
  let blockedByMe = false, blockedMe = false, myBlockId: string | null = null;
  (data ?? []).forEach((r) => {
    if (r.blocker_id === myId) { blockedByMe = true; myBlockId = r.id; }
    if (r.blocked_id === myId) { blockedMe = true; }
  });
  return { blockedByMe, blockedMe, myBlockId };
}

export async function blockUser(otherId: string) {
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) throw new Error("not authenticated");
  // remove any friendship first
  await supabase.from("friendships").delete()
    .or(`and(requester_id.eq.${me.user.id},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${me.user.id})`);
  const { error } = await supabase.from("user_blocks")
    .insert({ blocker_id: me.user.id, blocked_id: otherId });
  if (error) throw error;
}

export async function unblockUser(blockId: string) {
  const { error } = await supabase.from("user_blocks").delete().eq("id", blockId);
  if (error) throw error;
}

export async function unblockUserByOther(otherId: string) {
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) throw new Error("not authenticated");
  const { error } = await supabase.from("user_blocks").delete()
    .eq("blocker_id", me.user.id).eq("blocked_id", otherId);
  if (error) throw error;
}

export async function deleteDmThread(threadId: string) {
  // Delete messages first then the thread (no cascade configured).
  await supabase.from("direct_messages").delete().eq("thread_id", threadId);
  const { error } = await supabase.from("dm_threads").delete().eq("id", threadId);
  if (error) throw error;
}
