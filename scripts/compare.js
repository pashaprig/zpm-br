(function (global) {
  const HISTORY_STORAGE_KEY = "zpm-compare-history";
  const HISTORY_LIMIT = 50;

  let currentItems = [];

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isUpperCaseWord(token) {
    const cleaned = token.replace(/[^A-Za-zА-Яа-яЁёІіЇїЄєҐґ'’ʼ-]/g, "");
    if (cleaned.length < 2) {
      return false;
    }
    return cleaned === cleaned.toUpperCase() && cleaned !== cleaned.toLowerCase();
  }

  function splitEntries(text) {
    return String(text || "")
      .split(";")
      .map((chunk) => chunk.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function stripOrdinal(chunk) {
    return chunk.replace(/^\d+\s*[.)]\s*/, "").trim();
  }

  function buildLine(rank, surname, firstName, patronymic, position) {
    const namePart = [surname, firstName, patronymic].filter(Boolean).join(" ");
    const left = [rank, namePart].filter(Boolean).join(" ");
    return position ? `${left}, ${position}` : left;
  }

  function parseEntry(chunk, index) {
    const cleaned = stripOrdinal(chunk);
    const commaIndex = cleaned.indexOf(",");
    const left = commaIndex === -1 ? cleaned : cleaned.slice(0, commaIndex);
    const position = commaIndex === -1 ? "" : cleaned.slice(commaIndex + 1).trim();
    const tokens = left.trim().split(" ").filter(Boolean);
    const surnameIndex = tokens.findIndex(isUpperCaseWord);

    if (surnameIndex === -1) {
      return {
        index,
        valid: false,
        rank: "",
        surname: "",
        surnameKey: `__invalid_${index}`,
        firstName: "",
        patronymic: "",
        position,
        line: cleaned,
      };
    }

    const rank = tokens.slice(0, surnameIndex).join(" ");
    const surname = tokens[surnameIndex];
    const firstName = tokens[surnameIndex + 1] || "";
    const patronymic = tokens.slice(surnameIndex + 2).join(" ");

    return {
      index,
      valid: true,
      rank,
      surname,
      surnameKey: surname.toUpperCase(),
      firstName,
      patronymic,
      position,
      line: buildLine(rank, surname, firstName, patronymic, position),
    };
  }

  function parseList(text) {
    return splitEntries(text).map(parseEntry);
  }

  function groupBySurname(records) {
    const map = new Map();
    const order = [];
    records.forEach((rec) => {
      if (!map.has(rec.surnameKey)) {
        map.set(rec.surnameKey, []);
        order.push(rec.surnameKey);
      }
      map.get(rec.surnameKey).push(rec);
    });
    return { map, order };
  }

  function buildComparison(textA, textB) {
    const groupA = groupBySurname(parseList(textA));
    const groupB = groupBySurname(parseList(textB));

    const allKeys = [];
    const seen = new Set();
    groupA.order.forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        allKeys.push(key);
      }
    });
    groupB.order.forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        allKeys.push(key);
      }
    });

    const items = [];
    let uid = 0;

    allKeys.forEach((key) => {
      const listA = groupA.map.get(key) || [];
      const listB = groupB.map.get(key) || [];
      const pairCount = Math.min(listA.length, listB.length);

      for (let i = 0; i < pairCount; i += 1) {
        const a = listA[i];
        const b = listB[i];
        const same =
          a.rank === b.rank &&
          a.firstName === b.firstName &&
          a.patronymic === b.patronymic &&
          a.position === b.position;
        uid += 1;

        if (same) {
          items.push({ id: `item-${uid}`, type: "match", surname: a.surname, line: a.line });
        } else {
          items.push({
            id: `item-${uid}`,
            type: "conflict",
            surname: a.surname || b.surname,
            lineA: a.line,
            lineB: b.line,
            resolved: a.line,
          });
        }
      }

      for (let i = pairCount; i < listA.length; i += 1) {
        uid += 1;
        items.push({
          id: `item-${uid}`,
          type: "removed",
          surname: listA[i].surname,
          line: listA[i].line,
          included: true,
        });
      }

      for (let i = pairCount; i < listB.length; i += 1) {
        uid += 1;
        items.push({
          id: `item-${uid}`,
          type: "added",
          surname: listB[i].surname,
          line: listB[i].line,
          included: true,
        });
      }
    });

    return items;
  }

  function renderConflictItem(li, item) {
    li.className = "compare__result-item compare__result-item--changed";
    li.innerHTML = `
      <span class="compare__conflict-label">Прізвище: ${escapeHtml(item.surname)}</span>
      <div class="compare__conflict-variants">
        <button type="button" class="compare__variant-btn compare__variant-btn--active" data-variant="A">Текст 1: ${escapeHtml(item.lineA)}</button>
        <button type="button" class="compare__variant-btn" data-variant="B">Текст 2: ${escapeHtml(item.lineB)}</button>
      </div>
      <textarea class="compare__inline-input compare__inline-textarea" rows="2">${escapeHtml(item.resolved)}</textarea>
    `;

    const buttons = Array.from(li.querySelectorAll(".compare__variant-btn"));
    const textarea = li.querySelector(".compare__inline-textarea");

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("compare__variant-btn--active"));
        btn.classList.add("compare__variant-btn--active");
        const value = btn.dataset.variant === "A" ? item.lineA : item.lineB;
        textarea.value = value;
        item.resolved = value;
      });
    });

    textarea.addEventListener("input", () => {
      item.resolved = textarea.value;
      buttons.forEach((b) => b.classList.remove("compare__variant-btn--active"));
    });
  }

  function renderAddedRemovedItem(li, item) {
    const modifier = item.type === "added" ? "compare__result-item--added" : "compare__result-item--removed";
    const tag = item.type === "added" ? "Лише в Тексті 2" : "Лише в Тексті 1";
    li.className = `compare__result-item ${modifier}`;
    li.innerHTML = `
      <input type="checkbox" checked />
      <span class="compare__item-tag">${tag}:</span>
      <input type="text" class="compare__inline-input" value="${escapeHtml(item.line)}" />
    `;

    const checkbox = li.querySelector('input[type="checkbox"]');
    const input = li.querySelector('input[type="text"]');

    checkbox.addEventListener("change", () => {
      item.included = checkbox.checked;
      input.disabled = !checkbox.checked;
    });

    input.addEventListener("input", () => {
      item.line = input.value;
    });
  }

  function renderItem(item) {
    const li = document.createElement("li");
    li.dataset.id = item.id;

    if (item.type === "conflict") {
      renderConflictItem(li, item);
    } else {
      renderAddedRemovedItem(li, item);
    }

    return li;
  }

  function renderDiff(items) {
    currentItems = items;

    const list = document.getElementById("diffList");
    const placeholder = document.getElementById("diffPlaceholder");
    const generateButton = document.getElementById("generateButton");

    list.innerHTML = "";

    const visibleItems = items.filter((item) => item.type !== "match");

    if (visibleItems.length === 0) {
      placeholder.hidden = false;
      placeholder.textContent = "Розбіжностей не знайдено — списки збігаються.";
      list.hidden = true;
    } else {
      placeholder.hidden = true;
      list.hidden = false;
      visibleItems.forEach((item) => {
        list.appendChild(renderItem(item));
      });
    }

    generateButton.hidden = items.length === 0;
  }

  function showCorrectedView() {
    document.getElementById("cardA").hidden = true;
    document.getElementById("cardB").hidden = true;
    document.getElementById("cardCorrected").hidden = false;
    document.getElementById("compareWrapper").classList.add("compare__wrapper--single");
  }

  function showEditView() {
    document.getElementById("cardA").hidden = false;
    document.getElementById("cardB").hidden = false;
    document.getElementById("cardCorrected").hidden = true;
    document.getElementById("compareWrapper").classList.remove("compare__wrapper--single");
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  function renderHistoryOptions(history) {
    const select = document.getElementById("compareHistory");
    const current = select.value;
    select.innerHTML = '<option value="">— Обрати збережене —</option>';

    history.forEach((entry) => {
      const option = document.createElement("option");
      option.value = entry.id;
      const time = new Date(entry.createdAt);
      const timeLabel = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
      option.textContent = `${entry.date} · ${timeLabel}`;
      select.appendChild(option);
    });

    select.value = history.some((entry) => entry.id === current) ? current : "";
  }

  function saveHistoryEntry(correctedText) {
    const history = loadHistory();
    const dateInput = document.getElementById("compareDate");
    const entry = {
      id: `h-${Date.now()}`,
      date: dateInput.value || new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
      textA: document.getElementById("textInputA").value,
      textB: document.getElementById("textInputB").value,
      corrected: correctedText,
    };

    history.unshift(entry);
    if (history.length > HISTORY_LIMIT) {
      history.length = HISTORY_LIMIT;
    }

    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (err) {
      /* сховище недоступне або переповнене — ігноруємо */
    }

    renderHistoryOptions(history);
  }

  function handleHistoryChange(event) {
    const id = event.target.value;
    if (!id) {
      return;
    }

    const entry = loadHistory().find((item) => item.id === id);
    if (!entry) {
      return;
    }

    document.getElementById("compareDate").value = entry.date;
    document.getElementById("textInputA").value = entry.textA;
    document.getElementById("textInputB").value = entry.textB;

    if (entry.corrected) {
      document.getElementById("correctedOutput").value = entry.corrected;
      showCorrectedView();
    } else {
      showEditView();
    }
  }

  function handleCompareClick() {
    const textA = document.getElementById("textInputA").value;
    const textB = document.getElementById("textInputB").value;
    renderDiff(buildComparison(textA, textB));
  }

  function handleGenerateClick() {
    const finalLines = [];

    currentItems.forEach((item) => {
      if (item.type === "match") {
        finalLines.push(item.line);
      } else if (item.type === "conflict") {
        const value = (item.resolved || "").trim();
        if (value) {
          finalLines.push(value);
        }
      } else if (item.type === "added" || item.type === "removed") {
        if (item.included !== false) {
          const value = (item.line || "").trim();
          if (value) {
            finalLines.push(value);
          }
        }
      }
    });

    const formatted = finalLines.map((line, idx) => `${idx + 1}.\t${line};`).join("\n");

    document.getElementById("correctedOutput").value = formatted;
    showCorrectedView();
    saveHistoryEntry(formatted);
  }

  function fallbackCopy(textarea) {
    textarea.removeAttribute("readonly");
    textarea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      /* копіювання недоступне в цьому середовищі */
    }
    textarea.setAttribute("readonly", "readonly");
    textarea.blur();
  }

  function handleCopyClick() {
    const output = document.getElementById("correctedOutput");
    const button = document.getElementById("copyCorrectedButton");

    const showCopied = () => {
      const original = button.textContent;
      button.textContent = "Скопійовано!";
      setTimeout(() => {
        button.textContent = original;
      }, 1500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(output.value)
        .then(showCopied)
        .catch(() => {
          fallbackCopy(output);
          showCopied();
        });
    } else {
      fallbackCopy(output);
      showCopied();
    }
  }

  function initCompare() {
    const dateInput = document.getElementById("compareDate");
    if (!dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }

    renderHistoryOptions(loadHistory());

    document.getElementById("compareButton").addEventListener("click", handleCompareClick);
    document.getElementById("generateButton").addEventListener("click", handleGenerateClick);
    document.getElementById("copyCorrectedButton").addEventListener("click", handleCopyClick);
    document.getElementById("editAgainButton").addEventListener("click", showEditView);
    document.getElementById("compareHistory").addEventListener("change", handleHistoryChange);
  }

  global.initCompare = initCompare;
})(window);
