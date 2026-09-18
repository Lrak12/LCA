import { supabaseAdmin } from "../config/supabase.js";
import { sendError } from "../helpers/response.js";
import { getTokenClaims } from "../services/auth.service.js";

const replacedSessionMessage =
  "Your session ended because this account signed in on another device.";
const endedSessionMessage = "Your session has ended. Please sign in again.";

const sessionMismatchMessage = (metadata) =>
  metadata?.active_session_ended_reason ? endedSessionMessage : replacedSessionMessage;

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, "Unauthorized: No token provided", 401);
  }

  const token = authHeader.split(" ")[1];
  const tokenClaims = getTokenClaims(token);

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    // Revoking older Supabase sessions can make getUser fail before the normal
    // metadata comparison below. Look up the protected user metadata by the
    // already-validated JWT identity so the displaced device still receives the
    // specific response that triggers its replacement popup. This lookup never
    // authenticates the request; either outcome below is still a 401 response.
    if (tokenClaims?.sub && tokenClaims?.session_id) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(tokenClaims.sub);
      const metadata = authUser?.user?.app_metadata;
      const activeSessionId = metadata?.active_session_id;
      if (activeSessionId && activeSessionId !== tokenClaims.session_id) {
        return sendError(res, sessionMismatchMessage(metadata), 401);
      }
    }
    return sendError(res, "Unauthorized: Invalid or expired token", 401);
  }

  const tokenSessionId = tokenClaims?.session_id;
  const metadata = data.user.app_metadata;
  const activeSessionId = metadata?.active_session_id;

  // Accounts without the marker are legacy sessions created before this feature
  // was deployed. As soon as the account signs in again, only that newest session
  // ID is accepted and all older devices are rejected on their next request.
  if (activeSessionId && tokenSessionId !== activeSessionId) {
    return sendError(res, sessionMismatchMessage(metadata), 401);
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
