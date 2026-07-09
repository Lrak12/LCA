import client from "./client.js";

export const fetchNotifications        = ()   => client.get("/notifications");
export const markNotificationRead      = (id) => client.patch(`/notifications/${id}/read`);
export const markAllNotificationsRead  = ()   => client.patch("/notifications/read-all");
