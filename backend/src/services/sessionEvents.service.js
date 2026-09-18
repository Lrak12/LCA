import { getTokenSessionId, logout } from "./auth.service.js";

const activeConnections = new Map();
const pendingRelease = new Map();
const RELEASE_GRACE_MS = 5000;

const releaseKey = (userId, sessionId) => `${userId}:${sessionId}`;

const hasConnection = (userId, sessionId) =>
  [...(activeConnections.get(userId) ?? [])].some((entry) => entry.sessionId === sessionId);

const cancelRelease = (userId, sessionId) => {
  const key = releaseKey(userId, sessionId);
  const timer = pendingRelease.get(key);
  if (timer) clearTimeout(timer);
  pendingRelease.delete(key);
};

export const keepSessionAlive = (userId, token) => {
  const sessionId = getTokenSessionId(token);
  if (sessionId) cancelRelease(userId, sessionId);
};

export const scheduleSessionRelease = (userId, token) => {
  const sessionId = getTokenSessionId(token);
  if (!sessionId) return;
  const key = releaseKey(userId, sessionId);
  if (pendingRelease.has(key)) return;

  const timer = setTimeout(async () => {
    pendingRelease.delete(key);
    if (hasConnection(userId, sessionId)) return;
    try {
      // logout checks that this is still the active session before clearing
      // its marker, so a newer login cannot be cleared by this old timer.
      await logout(token);
    } catch (error) {
      console.error("Could not release a closed browser session:", error);
    }
  }, RELEASE_GRACE_MS);
  timer.unref?.();
  pendingRelease.set(key, timer);
};

const addConnection = (userId, entry) => {
  const connections = activeConnections.get(userId) ?? new Set();
  connections.add(entry);
  activeConnections.set(userId, connections);
  cancelRelease(userId, entry.sessionId);
};

const removeConnection = (userId, entry) => {
  const connections = activeConnections.get(userId);
  if (!connections) return;
  connections.delete(entry);
  if (connections.size === 0) activeConnections.delete(userId);
  if (!hasConnection(userId, entry.sessionId)) scheduleSessionRelease(userId, entry.token);
};

export const subscribe = (userId, req, res) => {
  const token = req.headers.authorization?.slice(7);
  const sessionId = getTokenSessionId(token);
  if (!sessionId) return res.status(401).end();
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write("event: connected\ndata: {}\n\n");

  const entry = { response: res, sessionId, token };
  addConnection(userId, entry);

  // Keep proxies from closing an otherwise idle event stream.
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": keep-alive\n\n");
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    removeConnection(userId, entry);
  };
  // The request's "close" event can fire when the GET request body completes;
  // only the response close means the live event stream has ended.
  res.once("close", cleanup);
};

export const terminateExistingConnections = (userId) => {
  const connections = [...(activeConnections.get(userId) ?? [])];
  activeConnections.delete(userId);

  const payload = JSON.stringify({
    message: "Someone logged into this account on another device.",
  });

  for (const { response } of connections) {
    if (response.writableEnded) continue;
    response.write(`event: session-replaced\ndata: ${payload}\n\n`);
    response.end();
  }
};
