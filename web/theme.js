(() => {
  let stored = null;
  try {
    stored = localStorage.getItem("theme");
  } catch {}

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const hasChoice = stored === "light" || stored === "dark";
  const initialTheme = hasChoice ? stored : media.matches ? "dark" : "light";
  document.documentElement.dataset.theme = initialTheme;
  document.documentElement.dataset.themeSource = hasChoice ? "user" : "system";

  function currentTheme() {
    return document.documentElement.dataset.theme || (media.matches ? "dark" : "light");
  }

  function updateThemeColor() {
    const themeColor = document.querySelector('meta[name="theme-color"]');
    const value = themeColor?.getAttribute(currentTheme() === "dark" ? "data-dark" : "data-light");
    if (value) themeColor.setAttribute("content", value);
  }

  function updateFavicons() {
    const attribute = currentTheme() === "dark" ? "dark" : "light";
    for (const favicon of document.querySelectorAll("[data-theme-favicon]")) {
      const href = favicon.dataset[attribute];
      if (href) favicon.setAttribute("href", href);
    }
  }

  function bindThemeControl() {
    const control = document.querySelector("[data-theme-control]");
    const label = control?.querySelector("[data-theme-label]");
    if (!(control instanceof HTMLButtonElement) || !label) return;

    control.hidden = false;
    const updateControl = () => {
      const theme = currentTheme();
      const next = theme === "dark" ? "light" : "dark";
      control.setAttribute("aria-pressed", String(theme === "dark"));
      control.setAttribute("aria-label", `Switch to ${next} theme`);
      label.textContent = theme === "dark" ? "Dark" : "Light";
    };

    control.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      document.documentElement.dataset.themeSource = "user";
      try {
        localStorage.setItem("theme", next);
      } catch {}
      updateThemeColor();
      updateFavicons();
      updateControl();
    });

    media.addEventListener("change", () => {
      if (document.documentElement.dataset.themeSource !== "user") {
        document.documentElement.dataset.theme = media.matches ? "dark" : "light";
        updateThemeColor();
        updateFavicons();
        updateControl();
      }
    });

    updateFavicons();
    updateControl();
  }

  updateThemeColor();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindThemeControl, { once: true });
  } else {
    bindThemeControl();
  }
})();
