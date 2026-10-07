(function (global) {
  // web: true — шрифт вантажиться з інтернету; інші — системні шрифти Windows.
  const FONTS = [
    { label: "Mistral", name: "Hand Mistral", weight: 400, size: "1.6rem" },
    { label: "Caveat", name: "Caveat", weight: 400, size: "1.55rem", web: true },
    { label: "Comforter Brush", name: "Comforter Brush", weight: 400, size: "1.75rem", web: true },
    { label: "Ink Free", name: "Hand Ink Free", weight: 400, size: "1.25rem" },
    { label: "Segoe Print", name: "Hand Segoe Print", weight: 400, size: "1.05rem" },
    { label: "Yomogi", name: "Yomogi", weight: 400, size: "1.2rem", web: true },
    { label: "Bad Script", name: "Bad Script", weight: 400, size: "1.25rem", web: true },
    { label: "Кобзар (почерк Шевченка)", name: "Kobzar KS", weight: 400, size: "1.5rem", web: true },
    { label: "Segoe Script", name: "Hand Segoe Script", weight: 400, size: "1.15rem" },
    { label: "Segoe Script (жирний)", name: "Hand Segoe Script", weight: 700, size: "1.15rem" },
  ];

  const SAMPLE_TEXT = "Їжа ґрунт Євген";

  function fontFamily(font) {
    return `'${font.name}', cursive`;
  }

  // Порожній результат document.fonts.load означає, що шрифт не знайдено (немає файлу або інтернету).
  function isFontAvailable(font) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve(true);
    return document.fonts
      .load(`${font.weight} 16px '${font.name}'`, SAMPLE_TEXT)
      .then((faces) => faces.length > 0)
      .catch(() => false);
  }

  function initHandwriting() {
    const switcher = document.getElementById("fontSwitcher");
    const sheet = document.getElementById("handwritingSheet");
    const buttons = [];

    function applyFont(index) {
      const font = FONTS[index];
      sheet.style.setProperty("--handwriting-font", fontFamily(font));
      sheet.style.setProperty("--handwriting-size", font.size);
      sheet.style.setProperty("--handwriting-weight", font.weight);
      buttons.forEach((btn, i) => {
        const active = i === index;
        btn.classList.toggle("compare__variant-btn--active", active);
        btn.setAttribute("aria-pressed", String(active));
      });
    }

    FONTS.forEach((font, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "compare__variant-btn compare__font-btn";
      button.textContent = font.label;
      button.style.fontFamily = fontFamily(font);
      button.style.fontWeight = font.weight;
      button.addEventListener("click", () => applyFont(index));
      switcher.appendChild(button);
      buttons.push(button);
    });

    applyFont(0);

    Promise.all(FONTS.map(isFontAvailable)).then((available) => {
      available.forEach((ok, i) => {
        if (ok) return;
        const font = FONTS[i];
        if (!font.web) {
          buttons[i].hidden = true;
          return;
        }
        buttons[i].disabled = true;
        buttons[i].style.fontFamily = "";
        buttons[i].textContent = `${font.label} — не завантажився з інтернету`;
        buttons[i].title = "Браузер не зміг завантажити шрифт: немає інтернету або сайт заблоковано в мережі";
      });
      const firstAvailable = available.indexOf(true);
      if (!available[0] && firstAvailable !== -1) applyFont(firstAvailable);
    });
  }

  global.initHandwriting = initHandwriting;
})(window);
