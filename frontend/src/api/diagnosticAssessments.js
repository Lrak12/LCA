import client from "./client.js";

export const fetchDiagnostics        = (student_id) =>
  client.get(student_id ? `/assessments/diagnostic?student_id=${student_id}` : "/assessments/diagnostic");

export const createDiagnostic        = (payload) =>
  client.post("/assessments/diagnostic", payload);

export const updateDiagnostic        = (id, payload) =>
  client.put(`/assessments/diagnostic/${id}`, payload);

export const generateProjection      = (student_id, paces) =>
  client.post("/assessments/diagnostic/generate-projection", { student_id, paces });
