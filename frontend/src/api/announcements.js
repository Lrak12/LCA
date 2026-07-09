import client from "./client.js";

export const fetchAnnouncements    = ()     => client.get("/announcements");
export const createAnnouncement    = (data) => client.post("/announcements", data);
export const updateAnnouncement    = (id, data) => client.put(`/announcements/${id}`, data);
export const deleteAnnouncement    = (id)   => client.delete(`/announcements/${id}`);