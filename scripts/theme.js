(function (global) {
  const THEME_STORAGE_KEY = "zpm-theme";

  function applyTheme(theme, themeToggle) {
    const normalizedTheme = theme === "light" ? "light" : "dark";
    document.body.setAttribute("data-theme", normalizedTheme);

    if (themeToggle) {
      themeToggle.checked = normalizedTheme === "light";
    }
  }

  function initThemeToggle(themeToggle) {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || "dark";
    applyTheme(savedTheme, themeToggle);

    if (!themeToggle) {
      return;
    }

    themeToggle.addEventListener("change", () => {
      const nextTheme = themeToggle.checked ? "light" : "dark";
      applyTheme(nextTheme, themeToggle);
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    });
  }

  global.initThemeToggle = initThemeToggle;
})(window);
