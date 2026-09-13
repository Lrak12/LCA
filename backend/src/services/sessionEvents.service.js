const activeConnections = new Map();

const addConnection = (userId, response) => {
  const connections = activeConnections.get(userId) ?? new Set();
  connections.add(response);
  activeConnections.set(userId, connections);
};

const removeConnection = (userId, response) => {
  const connections = activeConnections.get(userId);
  if (!connections) return;
  connections.delete(response);
  if (connections.size === 0) activeConnections.delete(userId);
};

export const subscribe = (userId, req, res) => {
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write("event: connected\ndata: {}\n\n");

  addConnection(userId, res);

  // Keep proxies from closing an otherwise idle event stream.
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": keep-alive\n\n");
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    removeConnection(userId, res);
  };
  req.on("close", cleanup);
  res.on("close", cleanup);
};

export const terminateExistingConnections = (userId) => {
  const connections = [...(activeConnections.get(userId) ?? [])];
  activeConnections.delete(userId);

  const payload = JSON.stringify({
    message: "Someone logged into this account on another device.",
  });

  for (const response of connections) {
    if (response.writableEnded) continue;
    response.write(`event: session-replaced\ndata: ${payload}\n\n`);
    response.end();
  }
};
