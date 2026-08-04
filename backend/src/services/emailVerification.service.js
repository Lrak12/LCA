// Email-change verification, Supabase-native. No custom table and no third-party mailer:
// Supabase (GoTrue) generates + emails the code (via the SMTP configured in the Supabase
// dashboard) and validates it. We drive it server-side using the signed-in user's access
// token, then mirror the new email into our `users` table.
//
// REQUIRED Supabase dashboard config (Authentication settings):
//   • SMTP configured (Auth → Emails → SMTP) so Supabase can actually send.
//   • "Confirm email" ON  (so an email change sends a code instead of applying immediately).
//   • "Secure email change" OFF (otherwise BOTH the old and new address must confirm,
//     which breaks a single-code flow).
//   • "Change Email Address" template edited to include the code, e.g. {{ .Token }}
//     (the default template only contains a confirmation link).
import { supabase, supabaseAdmin } from "../config/supabase.js";

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e ?? "").trim());

// Step 1: ask Supabase to change this user's email. With "Confirm email" on, GoTrue emails
// a verification code to the NEW address instead of changing it immediately.
export const requestEmailChange = async (accessToken, newEmailRaw) => {
  if (!accessToken) throw new Error("Not authenticated.");
  const newEmail = String(newEmailRaw ?? "").trim().toLowerCase();
  if (!isValidEmail(newEmail)) throw new Error("Please enter a valid email address.");

  // Call GoTrue's "update user" endpoint AS the user (their bearer token). We hit the REST
  // endpoint directly because the anon SDK's updateUser expects a persisted session, which
  // the backend doesn't hold.
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: newEmail }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.msg || body.error_description || body.error || "Failed to start email change.");
  }
  return { sent: true, email: newEmail };
};

// Step 2: confirm the code with Supabase, then mirror the new email into our users table.
export const verifyEmailChange = async (newEmailRaw, codeRaw) => {
  const newEmail = String(newEmailRaw ?? "").trim().toLowerCase();
  const code     = String(codeRaw ?? "").trim();
  if (!isValidEmail(newEmail)) throw new Error("Missing the new email address.");
  if (!code) throw new Error("Please enter the verification code.");

  const { data, error } = await supabase.auth.verifyOtp({
    email: newEmail, token: code, type: "email_change",
  });
  if (error) throw new Error(error.message);

  // Supabase Auth email is now updated — keep our users table in sync.
  const authId = data?.user?.id;
  if (authId) {
    await supabaseAdmin.from("users").update({ email: newEmail }).eq("auth_id", authId);
  }
  return { email: newEmail };
};
