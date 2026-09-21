import { supabaseAdmin } from "../config/supabase.js";

const TABLE = "notification";

// Columns: notification_id (PK auto), user_id (FK→users), title, message_content,
// created_date (default CURRENT_DATE), is_read (default false).

export const findByUser = (user_id, limit = 30) =>
  supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("user_id", user_id)
    .order("created_date", { ascending: false })
    .order("notification_id", { ascending: false })
    .limit(limit);

export const markRead = (notification_id, user_id) =>
  supabaseAdmin
    .from(TABLE)
    .update({ is_read: true })
    .eq("notification_id", notification_id)
    .eq("user_id", user_id)
    .select()
    .maybeSingle();

export const markAllRead = (user_id) =>
  supabaseAdmin
    .from(TABLE)
    .update({ is_read: true })
    .eq("user_id", user_id)
    .eq("is_read", false)
    .select();

export const insertMany = (rows) =>
  supabaseAdmin.from(TABLE).insert(rows).select();

export const removeForAnnouncements = (announcementIds) => {
  const markers = (announcementIds ?? []).map((id) => `announcement:${id}`);
  if (!markers.length) return Promise.resolve({ error: null });
  return supabaseAdmin
    .from(TABLE)
    .delete()
    .in("message_content", markers);
};
