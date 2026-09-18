export const isActiveSessionConflict = ({
  activeSessionId,
  activeExpiresAt,
  newSessionId,
  sameBrowser,
  ownsPreviousSession,
  nowSeconds = Date.now() / 1000,
}) => Boolean(
  activeSessionId &&
  activeSessionId !== newSessionId &&
  Number(activeExpiresAt) > nowSeconds &&
  !sameBrowser &&
  !ownsPreviousSession
);
