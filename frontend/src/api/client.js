const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

const getToken = () => localStorage.getItem("lca_token");

export const notifySessionClosing = () => {
  const token = getToken();
  if (!token) return;
  // Keepalive gives a tab-close request a chance to reach the server. The live
  // event stream closing provides a second signal if this request is dropped.
  fetch(`${BASE_URL}/auth/session-closing`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    keepalive: true,
  }).catch(() => {});
};

export const watchSessionEvents = async ({ signal, onSessionReplaced }) => {
  const token = getToken();
  if (!token) return;

  const response = await fetch(`${BASE_URL}/auth/session-events`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok) {
    let message = "Unauthorized: Invalid or expired token";
    try {
      const errorBody = await response.json();
      message = errorBody.message ?? message;
    } catch {
      // The default message is enough to end an invalid local session.
    }

    // A newer request or login may have replaced this token already. Only the
    // request that still owns the local session may end it or raise a notice.
    if (getToken() !== token) return;
    localStorage.removeItem("lca_token");
    localStorage.removeItem("lca_user");
    const replacedByAnotherDevice = /signed in on another device/i.test(message);
    if (replacedByAnotherDevice) {
      onSessionReplaced(message);
    } else {
      window.dispatchEvent(new CustomEvent("lca:session-ended"));
    }
    return;
  }
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const eventBlock = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      if (eventBlock.includes("event: session-replaced")) {
        const dataLine = eventBlock.split("\n").find((line) => line.startsWith("data: "));
        let message = "Someone logged into this account on another device.";
        if (dataLine) {
          try {
            message = JSON.parse(dataLine.slice(6)).message ?? message;
          } catch {
            // Keep the safe default message when an event payload is malformed.
          }
        }
        if (getToken() === token) onSessionReplaced(message);
        return;
      }

      boundary = buffer.indexOf("\n\n");
    }
  }
};

const request = async (endpoint, options = {}) => {
  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const { params, ...fetchOptions } = options;
  let url = `${BASE_URL}${endpoint}`;
  if (params && Object.keys(params).length) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
    );
    url += `?${qs}`;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = data.message || "Something went wrong";

    // Any rejected authenticated token is no longer usable. Clear it centrally
    // so every page reacts consistently, including a session replaced by a login
    // from another device.
    if (response.status === 401 && token && getToken() === token) {
      localStorage.removeItem("lca_token");
      localStorage.removeItem("lca_user");
      const replacedByAnotherDevice = /signed in on another device/i.test(message);
      window.dispatchEvent(new CustomEvent("lca:session-ended", {
        detail: { message, replacedByAnotherDevice },
      }));
    }

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
};

const client = {
  get:    (endpoint, options = {}) =>
    request(endpoint, { ...options, method: "GET" }),

  post:   (endpoint, body, options = {}) =>
    request(endpoint, { ...options, method: "POST", body: JSON.stringify(body) }),

  put:    (endpoint, body, options = {}) =>
    request(endpoint, { ...options, method: "PUT", body: JSON.stringify(body) }),

  patch:  (endpoint, body, options = {}) =>
    request(endpoint, { ...options, method: "PATCH", body: JSON.stringify(body) }),

  delete: (endpoint, options = {}) =>
    request(endpoint, { ...options, method: "DELETE" }),
};

export default client;
