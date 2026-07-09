const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

const getToken = () => localStorage.getItem("lca_token");

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
    throw new Error(data.message || "Something went wrong");
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