const STORAGE_KEY = "lca_accessibility";

const TEXT_SIZES = { Small: "13px", Medium: "16px", Large: "19px" };

const FONTS = {
  Default: "",
  Serif: "Georgia, 'Times New Roman', serif",
  Monospace: "ui-monospace, SFMono-Regular, Menlo, monospace",
  "Dyslexic-Friendly": "'Comic Sans MS', 'Arial Rounded MT Bold', cursive",
};

const MODE_CLASSES = ["mode-dark", "mode-high-contrast", "mode-color-blind"];

export const DEFAULT_SETTINGS = {
  textSize: "Medium",
  highContrast: false,
  colorMode: "Default",
  worksheetScale: 100,
  fontStyle: "Default",
};

export function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable
  }
}

export function applySettings(settings) {
  const root = document.documentElement;
  const { textSize, highContrast, colorMode, worksheetScale, fontStyle } = settings;

  root.style.setProperty("--app-font-size", TEXT_SIZES[textSize] ?? "16px");

  const font = FONTS[fontStyle] ?? "";
  if (font) root.style.setProperty("--app-font-family", font);
  else root.style.removeProperty("--app-font-family");

  MODE_CLASSES.forEach((c) => root.classList.remove(c));
  if (highContrast || colorMode === "High Contrast") {
    root.classList.add("mode-high-contrast");
  } else if (colorMode === "Dark") {
    root.classList.add("mode-dark");
  } else if (colorMode === "Color Blind") {
    root.classList.add("mode-color-blind");
  }

  root.style.setProperty("--worksheet-scale", worksheetScale / 100);
}
