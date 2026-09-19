(function (global) {
  const CARD_A_LABELS = {
    full: { label: "Розподіл", placeholder: "Вставте текст із файлу Розподіл..." },
    surname: { label: "Прізвища", placeholder: "Вставте прізвища, імена та по батькові..." },
  };

  function applyCardALabel(tabName) {
    const config = CARD_A_LABELS[tabName];
    document.getElementById("cardALabel").textContent = config.label;
    document.getElementById("textInputA").placeholder = config.placeholder;
    document.getElementById("cardBLabel").textContent = "БР Щоденна";

    if (tabName === "surname" && typeof global.refreshSurnameCounts === "function") {
      global.refreshSurnameCounts();
    }
  }

  function initTabs() {
    const tabs = [
      { name: "full", button: document.getElementById("tabButtonFull"), panel: document.getElementById("tabPanelFull") },
      { name: "surname", button: document.getElementById("tabButtonSurname"), panel: document.getElementById("tabPanelSurname") },
    ];

    tabs.forEach(({ name, button }) => {
      button.addEventListener("click", () => {
        tabs.forEach(({ button: btn, panel: pnl }) => {
          const active = btn === button;
          btn.classList.toggle("compare__tab--active", active);
          btn.setAttribute("aria-selected", String(active));
          pnl.hidden = !active;
        });
        applyCardALabel(name);
      });
    });
  }

  global.initTabs = initTabs;
})(window);
