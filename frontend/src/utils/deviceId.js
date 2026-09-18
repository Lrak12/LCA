const STORAGE_KEY = "lca_device_id";
const DEVICE_ID_PATTERN = /^[0-9a-f]{32}$/i;

// A stable, random browser identifier lets a person sign in again after closing
// the page without treating a different browser as the same active device.
export const getOrCreateDeviceId = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && DEVICE_ID_PATTERN.test(saved)) return saved;

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const deviceId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(STORAGE_KEY, deviceId);
  return deviceId;
};
