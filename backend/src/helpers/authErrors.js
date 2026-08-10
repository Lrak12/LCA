// Turns Supabase Auth (GoTrue) createUser errors into specific, user-friendly
// messages. The main offender is duplicate accounts: when the email is already
// in auth, GoTrue says "...already been registered"; when the handle_new_user
// trigger hits the email UNIQUE conflict in public.users, GoTrue returns the
// unhelpful "Database error creating new user". Both mean the same thing to the
// admin — the email is already in use — so we say so plainly instead of leaking
// "Database error".
export const describeAuthCreateError = (authErr) => {
  const raw = String(authErr?.message ?? "").toLowerCase();

  if (raw.includes("already been registered") || raw.includes("already registered")) {
    return "An account with this email address already exists.";
  }

  // Trigger-side email UNIQUE violation surfaces as a generic "Database error".
  if (raw.includes("database error")) {
    return "An account with this email address already exists.";
  }

  if (raw.includes("password")) {
    // e.g. "Password should be at least 6 characters" — already specific.
    return authErr.message;
  }

  // Fall back to whatever GoTrue said rather than swallowing it.
  return authErr?.message || "Could not create the account. Please try again.";
};
