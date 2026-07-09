import client from "./client.js";

export const fetchRolloverPreview = () => client.get("/rollover/preview");

export const commitRollover = (payload) => client.post("/rollover/commit", payload);
