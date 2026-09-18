export const announcementPreview = (content = "", limit = 160) => {
  const plainText = String(content).replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  if (plainText.length <= limit) return plainText;
  return `${plainText.slice(0, limit).trimEnd()}…`;
};
