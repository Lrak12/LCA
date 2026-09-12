import client from "./client.js";

export const fetchParentDashboard = () => client.get("/parent/dashboard");
