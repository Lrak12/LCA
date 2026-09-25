export const PACE_MIN = 1001;
export const PACE_MAX = 1144;

export const isPaceInRange = (value) => {
  const pace = Number(value);
  return Number.isInteger(pace) && pace >= PACE_MIN && pace <= PACE_MAX;
};

export const boundedPaceCount = (start, requestedCount) => {
  const pace = Number(start);
  if (!isPaceInRange(pace)) return 0;
  return Math.min(Math.max(Number(requestedCount) || 1, 1), PACE_MAX - pace + 1);
};

export const requirePaceInRange = (value) => {
  if (!isPaceInRange(value)) {
    throw new Error(`PACE number must be between ${PACE_MIN} and ${PACE_MAX}.`);
  }
  return Number(value);
};
