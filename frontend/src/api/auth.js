import client from "./client.js";

export const loginRequest = (id_number, password) =>
  client.post("/auth/login", { id_number, password });

export const logoutRequest = () =>
  client.post("/auth/logout", {});

export const getMeRequest = () =>
  client.get("/auth/me");

export const resetPasswordRequest = (id_number, new_password) =>
  client.post("/auth/reset-password", { id_number, new_password });

// Complete a reset started from a Supabase recovery-email link (token from the URL).
export const resetPasswordWithToken = (access_token, new_password) =>
  client.post("/auth/reset-with-token", { access_token, new_password });

export const forgotPasswordRequest = (id_number) =>
  client.post("/auth/forgot-password", { id_number });

export const contactAdminRequest = ({ full_name, id_number, reason, message }) =>
  client.post("/auth/contact-admin", { full_name, id_number, reason, message });
