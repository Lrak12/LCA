import * as AnnouncementModel from "../models/announcement.model.js";
import * as NotificationService from "./notification.service.js";
import { supabaseAdmin }      from "../config/supabase.js";

// Resolve which users should receive a notification for an announcement's audience.
const resolveRecipients = async (audience_role) => {
  const roleMap = { Student: "student", Teacher: "teacher", Parent: "parent" };
  const roles = audience_role === "All"
    ? ["student", "teacher", "parent"]
    : roleMap[audience_role] ? [roleMap[audience_role]] : [];
  if (!roles.length) return [];
  const { data } = await supabaseAdmin
    .from("users")
    .select("user_id")
    .eq("is_active", true)
    .in("role", roles);
  return (data ?? []).map((u) => u.user_id);
};

const resolvePrincipalId = async (user_id) => {
  const { data, error } = await supabaseAdmin
    .from("principal")
    .select("principal_id")
    .eq("user_id", user_id)
    .single();
  if (error || !data) throw new Error("Principal profile not found");
  return data.principal_id;
};

const ANNOUNCEMENT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const PRIORITY_MARKER = "<!--LCA:PRIORITY-->";
const normalizeAnnouncement = (announcement) => {
  if (!announcement) return announcement;
  const markedPriority = String(announcement.content ?? "").startsWith(PRIORITY_MARKER);
  return {
    ...announcement,
    is_priority: Boolean(announcement.is_priority) || markedPriority,
    content: markedPriority ? announcement.content.slice(PRIORITY_MARKER.length) : announcement.content,
  };
};
const storedContent = (content, isPriority) =>
  `${isPriority ? PRIORITY_MARKER : ""}${String(content ?? "").replace(PRIORITY_MARKER, "")}`;
const normalizePostedDate = (value) => {
  const postedAt = value ? new Date(value) : new Date();
  if (Number.isNaN(postedAt.getTime())) {
    const error = new Error("A valid announcement publication date and time is required.");
    error.statusCode = 400;
    throw error;
  }
  return postedAt.toISOString();
};
const isExpired = (announcement, now = Date.now()) => {
  if (!announcement?.posted_date) return false;
  const postedAt = new Date(announcement.posted_date).getTime();
  return Number.isFinite(postedAt) && postedAt + ANNOUNCEMENT_LIFETIME_MS <= now;
};

// Remove expired announcement notifications first, then the announcements. This
// prevents bell entries from pointing to posts that no longer exist.
export const deleteExpiredAnnouncements = async () => {
  const cutoff = new Date(Date.now() - ANNOUNCEMENT_LIFETIME_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("announcement")
    .select("ann_id")
    .eq("is_active", true)
    .lte("posted_date", cutoff);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((announcement) => announcement.ann_id);
  if (!ids.length) return 0;

  await NotificationService.deleteForAnnouncements(ids);
  const { error: deleteError } = await AnnouncementModel.removeMany(ids);
  if (deleteError) throw new Error(deleteError.message);
  return ids.length;
};

export const getAnnouncements = async (role, user_id = null) => {
  await deleteExpiredAnnouncements();
  const { data, error } = await AnnouncementModel.findAll(role);
  if (error) throw new Error(error.message);
  const now = Date.now();
  // Keep drafts available to the principal, but remove expired published posts
  // for everyone. Sorting then promotes the next valid priority post.
  const visible = (data ?? []).map(normalizeAnnouncement).filter((announcement) => {
    if (announcement.is_active === false) return role === "administrator" || role === "principal";
    const publishTime = announcement.posted_date ? new Date(announcement.posted_date).getTime() : 0;
    if (role !== "administrator" && role !== "principal" && publishTime > now) return false;
    return !isExpired(announcement, now);
  }).sort((a, b) => Number(Boolean(b.is_priority)) - Number(Boolean(a.is_priority))
    || (new Date(b.posted_date).getTime() || 0) - (new Date(a.posted_date).getTime() || 0));

  if (!user_id || role === "administrator" || role === "principal" || !visible.length) {
    return visible.map((announcement) => ({ ...announcement, is_read: true, notification_id: null }));
  }

  const markers = visible.map((announcement) => `announcement:${announcement.ann_id}`);
  const { data: notificationRows, error: notificationError } = await supabaseAdmin
    .from("notification")
    .select("notification_id, message_content, is_read")
    .eq("user_id", user_id)
    .in("message_content", markers);
  if (notificationError) console.warn("[announcements] read-state lookup skipped:", notificationError.message);
  const readState = new Map((notificationRows ?? []).map((row) => [row.message_content, row]));
  return visible.map((announcement) => {
    const notification = readState.get(`announcement:${announcement.ann_id}`);
    return {
      ...announcement,
      // Announcements that predate notification fan-out are treated as read.
      is_read: notification?.is_read ?? true,
      notification_id: notification?.notification_id ?? null,
    };
  });
};

export const getAnnouncementById = async (ann_id) => {
  const { data, error } = await AnnouncementModel.findById(ann_id);
  if (error) throw new Error("Announcement not found");
  return normalizeAnnouncement(data);
};

export const createAnnouncement = async (payload, requestingUser) => {
  const principal_id = await resolvePrincipalId(requestingUser.user_id);
  const createPayload = {
    ...payload,
    content: storedContent(payload.content, payload.is_priority),
    posted_date: normalizePostedDate(payload.posted_date),
    principal_id,
  };
  delete createPayload.is_priority;
  const { data, error } = await AnnouncementModel.create(createPayload);
  if (error) throw new Error(error.message);

  // Fan out a notification to every targeted user (non-fatal — posting still
  // succeeds if the notification table can't be written yet).
  if (data?.is_active !== false) {
    const recipients = await resolveRecipients(data.audience_role);
    await NotificationService.createForUsers(recipients, {
      title:           data.title,
      // Keep the body on the announcement page; the marker lets the bell open it.
      message_content: `announcement:${data.ann_id}`,
    }).catch((e) => console.warn("[announcement] notification fan-out skipped:", e.message));
  }

  return normalizeAnnouncement(data);
};

export const updateAnnouncement = async (ann_id, payload, requestingUser) => {
  const principal_id = await resolvePrincipalId(requestingUser.user_id);
  const editable = {};
  if (payload.title !== undefined) editable.title = String(payload.title).trim();
  if (payload.content !== undefined) editable.content = storedContent(String(payload.content).trim(), payload.is_priority);
  if (payload.audience_role !== undefined) editable.audience_role = payload.audience_role;
  if (payload.posted_date !== undefined) editable.posted_date = normalizePostedDate(payload.posted_date);
  if (payload.is_active !== undefined) editable.is_active = Boolean(payload.is_active);
  if (editable.title === "") throw new Error("Announcement title is required.");
  if (editable.content === "") throw new Error("Announcement message is required.");

  const { data, error } = await AnnouncementModel.update(ann_id, principal_id, editable);
  if (error) throw new Error(error.message);
  return normalizeAnnouncement(data);
};

export const deleteAnnouncement = async (ann_id) => {
  await NotificationService.deleteForAnnouncements([ann_id]);
  const { error } = await AnnouncementModel.remove(ann_id);
  if (error) throw new Error(error.message);
};
