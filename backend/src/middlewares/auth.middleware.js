import { supabaseAdmin } from "../config/supabase.js";
import { sendError } from "../helpers/response.js";

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, "Unauthorized: No token provided", 401);
  }

  const token = authHeader.split(" ")[1];

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    return sendError(res, "Unauthorized: Invalid or expired token", 401);
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("user_id, auth_id, username, email, role, is_active")
    .eq("auth_id", data.user.id)
    .single();

  if (profileError || !profile) {
    return sendError(res, "Unauthorized: User profile not found", 401);
  }

  if (!profile.is_active) {
    return sendError(res, "Forbidden: Account is inactive", 403);
  }

  req.user = profile;
  next();
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, "Unauthorized", 401);
    }
    if (!roles.includes(req.user.role)) {
      return sendError(res, "Forbidden: Insufficient permissions", 403);
    }
    next();
  };
};
