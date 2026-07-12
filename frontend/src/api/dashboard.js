import client from "./client.js";

// Principal dashboard stats (dashboard.service.getDashboardStats)
export const fetchDashboardStats = () => client.get("/dashboard/stats");