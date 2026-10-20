/**
 * Best-effort localStorage persistence for store slices.
 * Storage can be unavailable or full; a flag then simply does not survive a reload.
 */

export const readBool = (key: string, fallback: boolean): boolean => {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
};

export const readStr = (key: string, fallback: string): string => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

export const writeStr = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Persistence is best-effort; ignore quota/availability failures.
  }
};
