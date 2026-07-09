import client from "./client.js";

export const fetchDashboardStats = () => client.get("/dashboard/stats");