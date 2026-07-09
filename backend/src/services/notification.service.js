import * as NotificationModel from "../models/notification.model.js";

// Reading degrades gracefully: if the notification table is still permission-locked
// (grants not yet applied), return an empty feed instead of erroring the dashboard.
export const getMyNotifications = async (user_id) => {
  const { data, error } = await NotificationModel.findByUser(user_id);
  if (error) {
    console.warn("[notifications] read failed:", error.message);
    return { notifications: [], unreadCount: 0 };
  }
  const notifications = data ?? [];
  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.is_read).length,
  };
};

export const markRead = async (notification_id, user_id) => {
  const { error } = await NotificationModel.markRead(notification_id, user_id);
  if (error) throw new Error(error.message);
};

export const markAllRead = async (user_id) => {
  const { error } = await NotificationModel.markAllRead(user_id);
  if (error) throw new Error(error.message);
};

// Fan-out: create one notification per recipient user. Caller should treat failures
// as non-fatal (e.g. announcement posting still succeeds if notifications can't write).
export const createForUsers = async (userIds, { title, message_content }) => {
  const ids = [...new Set((userIds ?? []).filter((id) => id != null))];
  if (!ids.length) return;
  const rows = ids.map((user_id) => ({ user_id, title, message_content }));
  const { error } = await NotificationModel.insertMany(rows);
  if (error) throw new Error(error.message);
};
