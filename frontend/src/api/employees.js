import client from "./client.js";

export const fetchEmployees = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return client.get(`/employees?${query}`);
};

export const fetchEmployeeStats = () => client.get("/employees/stats");
export const addEmployee        = (data) => client.post("/employees", data);

// Supervisors (teaching staff)
export const fetchSupervisors     = () => client.get("/employees/supervisors");
export const fetchSupervisorStats = () => client.get("/employees/supervisors/stats");
export const addSupervisor        = (data) => client.post("/employees", data);
export const updateSupervisor     = (id, data) => client.put(`/employees/supervisors/${id}`, data);