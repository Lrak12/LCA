export const PACE_MIN = 1001;
export const PACE_MAX = 1144;

export const PACE_OPTIONS = Object.freeze(
  Array.from({ length: PACE_MAX - PACE_MIN + 1 }, (_, index) => PACE_MIN + index),
);

export const isPaceInRange = (value) => {
  const pace = Number(value);
  return Number.isInteger(pace) && pace >= PACE_MIN && pace <= PACE_MAX;
};

// Keep an already-saved out-of-range value visible without offering it as a new
// choice. No existing record is changed until the user deliberately saves.
export const paceOptionsWithLegacy = (value) => {
  const pace = Number(value);
  return Number.isInteger(pace) && !isPaceInRange(pace)
    ? [pace, ...PACE_OPTIONS]
    : PACE_OPTIONS;
};

export const boundedPaceCount = (start, requestedCount) => {
  const pace = Number(start);
  if (!isPaceInRange(pace)) return 0;
  return Math.min(Math.max(Number(requestedCount) || 1, 1), PACE_MAX - pace + 1);
};
