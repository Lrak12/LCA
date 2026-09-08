import * as AnnouncementModel from "../models/announcement.model.js";
import * as NotificationService from "./notification.service.js";
import { supabaseAdmin }      from "../config/supabase.js";

// Resolve which users should receive a notification for an announcement's audience.
const resolveRecipients = async (audience_role) => {
  let query = supabaseAdmin.from("users").select("user_id").eq("is_active", true);
  const roleMap = { Student: "student", Teacher: "teacher", Parent: "parent" };
  const role = roleMap[audience_role];
  if (role) query = query.eq("role", role);     // "All" (or unknown) → everyone
  const { data } = await query;
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

export const getAnnouncements = async (role) => {
  const { data, error } = await AnnouncementModel.findAll(role);
  if (error) throw new Error(error.message);
  return data;
};

export const getAnnouncementById = async (ann_id) => {
  const { data, error } = await AnnouncementModel.findById(ann_id);
  if (error) throw new Error("Announcement not found");
  return data;
};

export const createAnnouncement = async (payload, requestingUser) => {
  const principal_id = await resolvePrincipalId(requestingUser.user_id);
  const { data, error } = await AnnouncementModel.create({ ...payload, principal_id });
  if (error) throw new Error(error.message);

  // Fan out a notification to every targeted user (non-fatal — posting still
  // succeeds if the notification table can't be written yet).
  if (data?.is_active !== false) {
    const recipients = await resolveRecipients(data.audience_role);
    await NotificationService.createForUsers(recipients, {
      title:           data.title,
      message_content: data.content,
    }).catch((e) => console.warn("[announcement] notification fan-out skipped:", e.message));
  }

  return data;
};

export const updateAnnouncement = async (ann_id, payload, requestingUser) => {
  const principal_id = await resolvePrincipalId(requestingUser.user_id);
  const editable = {};
  if (payload.title !== undefined) editable.title = String(payload.title).trim();
  if (payload.content !== undefined) editable.content = String(payload.content).trim();
  if (payload.audience_role !== undefined) editable.audience_role = payload.audience_role;
  if (payload.posted_date !== undefined) editable.posted_date = payload.posted_date;
  if (payload.is_active !== undefined) editable.is_active = Boolean(payload.is_active);
  if (editable.title === "") throw new Error("Announcement title is required.");
  if (editable.content === "") throw new Error("Announcement message is required.");

  const { data, error } = await AnnouncementModel.update(ann_id, principal_id, editable);
  if (error) throw new Error(error.message);
  return data;
};

export const deleteAnnouncement = async (ann_id) => {
  const { error } = await AnnouncementModel.remove(ann_id);
  if (error) throw new Error(error.message);
};
