(function (global) {
  const HISTORY_STORAGE_KEY = "zpm-compare-history";
  const HISTORY_LIMIT = 50;

  let currentItems = null;
  let currentTrailingDivider = "";

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

  function findMarkerPositions(str) {
    const re = /(^|\s)(\d+)\s*[.)]\s/g;
    const positions = [];
    let m = re.exec(str);
    while (m !== null) {
      positions.push(m.index + m[1].length);
      m = re.exec(str);
    }
    return positions;
  }

  function tokenizeList(str) {
    const markers = findMarkerPositions(str);

    if (markers.length === 0) {
      const lines = str.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.length <= 1) {
        return { segments: [{ type: "record", raw: str }], trailingDivider: "" };
      }
      return {
        segments: lines.map((line) => ({ type: "record", raw: line })),
        trailingDivider: "",
      };
    }

    const segments = [];
    const leadingText = str.slice(0, markers[0]).trim();
    if (leadingText) {
      segments.push({ type: "divider", text: leadingText });
    }

    let trailingDivider = "";

    for (let i = 0; i < markers.length; i += 1) {
      const start = markers[i];
      const end = i + 1 < markers.length ? markers[i + 1] : str.length;
      const chunk = str.slice(start, end);
      const dividerMatch = chunk.match(/[;\n]/);
      const semiIndex = dividerMatch ? dividerMatch.index : -1;
      const recordRaw = semiIndex === -1 ? chunk : chunk.slice(0, semiIndex);
      const trailing = semiIndex === -1 ? "" : chunk.slice(semiIndex + 1).trim();

      segments.push({ type: "record", raw: recordRaw });

      if (trailing) {
        if (i + 1 < markers.length) {
          segments.push({ type: "divider", text: trailing });
        } else {
          trailingDivider = trailing;
        }
      }
    }

    return { segments, trailingDivider };
  }

  function uppercaseFirstWord(line) {
    const markerMatch = line.match(/^(\s*\d+\s*[.)]\s*)(\S+)(.*)$/);
    if (markerMatch) {
      const [, prefix, word, rest] = markerMatch;
      return `${prefix}${word.toUpperCase()}${rest}`;
    }
    const plainMatch = line.match(/^(\s*)(\S+)(.*)$/);
    if (!plainMatch) {
      return line;
    }
    const [, leading, word, rest] = plainMatch;
    return `${leading}${word.toUpperCase()}${rest}`;
  }

  function lineHasUppercaseSurname(line) {
    const withoutMarker = line.replace(/^\s*\d+\s*[.)]\s*/, "");
    const tokens = withoutMarker.split(" ").filter(Boolean);
    return tokens.some(isUpperCaseWord);
  }

  function normalizeSurnameCase(text) {
    return text
      .split("\n")
      .map((line) => {
        if (!line.trim()) {
          return line;
        }
        // Якщо прізвище вже написане великими літерами (напр. "Молодший сержант ПАСТУХ ..."),
        // не чіпаємо перше слово — інакше замість прізвища в капс переводиться звання.
        if (lineHasUppercaseSurname(line)) {
          return line;
        }
        return uppercaseFirstWord(line);
      })
      .join("\n");
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
    // Прізвище шукаємо як ОСТАННЄ слово у верхньому регістрі, а не перше:
    // звання іноді помилково набирають капсом (напр. "МОЛОДШИЙ сержант ПАСТУХ ..."),
    // і в такому разі прізвище все одно йде безпосередньо перед іменем.
    let surnameIndex = -1;
    tokens.forEach((token, idx) => {
      if (isUpperCaseWord(token)) {
        surnameIndex = idx;
      }
    });
    let caseIssue = false;

    if (surnameIndex === -1 && tokens.length > 0) {
      // Прізвище написане не в верхньому регістрі (наприклад, вставлено вручну без капіталізації) —
      // вважаємо перше слово прізвищем, аби не втрачати запис і не показувати його як "відсутній".
      surnameIndex = 0;
      caseIssue = true;
    }

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
        precedingDivider: "",
      };
    }

    const rank = tokens.slice(0, surnameIndex).join(" ");
    const surname = tokens[surnameIndex];
    const firstName = tokens[surnameIndex + 1] || "";
    const patronymic = tokens.slice(surnameIndex + 2).join(" ");

    return {
      index,
      valid: true,
      caseIssue,
      rank,
      surname,
      surnameKey: surname.toUpperCase(),
      firstName,
      patronymic,
      position,
      line: buildLine(rank, surname, firstName, patronymic, position),
      precedingDivider: "",
    };
  }

  function parseList(text) {
    const { segments, trailingDivider } = tokenizeList(String(text || ""));
    const records = [];
    let pendingDivider = "";

    segments.forEach((seg) => {
      if (seg.type === "divider") {
        pendingDivider = pendingDivider ? `${pendingDivider}\n${seg.text}` : seg.text;
        return;
      }

      const normalized = seg.raw.replace(/\s+/g, " ").trim();
      if (!normalized) {
        return;
      }

      const record = parseEntry(normalized, records.length);
      record.precedingDivider = pendingDivider;
      pendingDivider = "";
      records.push(record);
    });

    return { records, trailingDivider };
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

  function pairRecordsWithinSurname(listA, listB) {
    const usedB = new Array(listB.length).fill(false);
    const pairs = [];

    function takeMatch(a, predicate) {
      for (let j = 0; j < listB.length; j += 1) {
        if (!usedB[j] && predicate(listB[j])) {
          usedB[j] = true;
          return listB[j];
        }
      }
      return null;
    }

    const afterExact = [];
    listA.forEach((a) => {
      const b = takeMatch(a, (cand) => cand.firstName === a.firstName && cand.patronymic === a.patronymic);
      if (b) {
        pairs.push([a, b]);
      } else {
        afterExact.push(a);
      }
    });

    const afterFirstName = [];
    afterExact.forEach((a) => {
      const b = takeMatch(a, (cand) => cand.firstName === a.firstName);
      if (b) {
        pairs.push([a, b]);
      } else {
        afterFirstName.push(a);
      }
    });

    const remainingB = listB.filter((_, j) => !usedB[j]);
    const positionalCount = Math.min(afterFirstName.length, remainingB.length);
    for (let i = 0; i < positionalCount; i += 1) {
      pairs.push([afterFirstName[i], remainingB[i]]);
    }

    return {
      pairs,
      unmatchedA: afterFirstName.slice(positionalCount),
      unmatchedB: remainingB.slice(positionalCount),
    };
  }

  function buildComparison(textA, textB) {
    const parsedA = parseList(textA);
    const parsedB = parseList(textB);
    const trailingDivider = parsedA.trailingDivider || parsedB.trailingDivider || "";

    const groupA = groupBySurname(parsedA.records);
    const groupB = groupBySurname(parsedB.records);

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
      const { pairs, unmatchedA, unmatchedB } = pairRecordsWithinSurname(listA, listB);

      pairs.forEach(([a, b]) => {
        const same =
          a.rank === b.rank &&
          a.firstName === b.firstName &&
          a.patronymic === b.patronymic &&
          a.position === b.position;
        uid += 1;

        const precedingDivider = a.precedingDivider || b.precedingDivider || "";

        if (same) {
          items.push({ id: `item-${uid}`, type: "match", surname: a.surname, line: a.line, precedingDivider });
        } else {
          items.push({
            id: `item-${uid}`,
            type: "conflict",
            surname: a.surname || b.surname,
            a,
            b,
            resolved: a.line,
            precedingDivider,
          });
        }
      });

      unmatchedA.forEach((rec) => {
        uid += 1;
        items.push({
          id: `item-${uid}`,
          type: "removed",
          surname: rec.surname,
          line: rec.line,
          included: true,
          precedingDivider: rec.precedingDivider || "",
        });
      });

      unmatchedB.forEach((rec) => {
        uid += 1;
        items.push({
          id: `item-${uid}`,
          type: "added",
          surname: rec.surname,
          line: rec.line,
          included: true,
          precedingDivider: rec.precedingDivider || "",
        });
      });
    });

    return { items, trailingDivider };
  }

  function tokenizeForDiff(str) {
    return str.split(/(\s+)/).filter((token) => token.length > 0);
  }

  function computeWordDiff(a, b) {
    const tokensA = tokenizeForDiff(a);
    const tokensB = tokenizeForDiff(b);
    const n = tokensA.length;
    const m = tokensB.length;
    const dp = [];
    for (let i = 0; i <= n; i += 1) {
      dp.push(new Array(m + 1).fill(0));
    }
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        dp[i][j] = tokensA[i] === tokensB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    const opsA = [];
    const opsB = [];
    let i = 0;
    let j = 0;

    while (i < n && j < m) {
      if (tokensA[i] === tokensB[j]) {
        opsA.push({ text: tokensA[i], changed: false });
        opsB.push({ text: tokensB[j], changed: false });
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        opsA.push({ text: tokensA[i], changed: true });
        i += 1;
      } else {
        opsB.push({ text: tokensB[j], changed: true });
        j += 1;
      }
    }
    while (i < n) {
      opsA.push({ text: tokensA[i], changed: true });
      i += 1;
    }
    while (j < m) {
      opsB.push({ text: tokensB[j], changed: true });
      j += 1;
    }

    return { opsA, opsB };
  }

  function renderDiffOps(ops) {
    let html = "";
    let buffer = "";
    let bufferChanged = null;

    const flush = () => {
      if (!buffer) {
        return;
      }
      html += bufferChanged ? `<span class="compare__diff-mark">${escapeHtml(buffer)}</span>` : escapeHtml(buffer);
      buffer = "";
    };

    ops.forEach((op) => {
      const changed = /^\s+$/.test(op.text) ? false : op.changed;
      if (changed !== bufferChanged) {
        flush();
        bufferChanged = changed;
      }
      buffer += op.text;
    });
    flush();

    return html;
  }

  function renderConflictItem(li, item) {
    li.className = "compare__result-item compare__result-item--changed";
    const { opsA, opsB } = computeWordDiff(item.a.line, item.b.line);
    li.innerHTML = `
      <span class="compare__conflict-label">Прізвище: ${escapeHtml(item.surname)}</span>
      <div class="compare__conflict-variants">
        <button type="button" class="compare__variant-btn compare__variant-btn--active" data-variant="A">Текст 1: ${renderDiffOps(opsA)}</button>
        <button type="button" class="compare__variant-btn" data-variant="B">Текст 2: ${renderDiffOps(opsB)}</button>
      </div>
      <textarea class="compare__inline-input compare__inline-textarea" rows="2">${escapeHtml(item.resolved)}</textarea>
    `;

    const buttons = Array.from(li.querySelectorAll(".compare__variant-btn"));
    const textarea = li.querySelector(".compare__inline-textarea");

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("compare__variant-btn--active"));
        btn.classList.add("compare__variant-btn--active");
        const value = btn.dataset.variant === "A" ? item.a.line : item.b.line;
        textarea.value = value;
        item.resolved = value;
        refreshCorrectedOutput();
      });
    });

    textarea.addEventListener("input", () => {
      item.resolved = textarea.value;
      buttons.forEach((b) => b.classList.remove("compare__variant-btn--active"));
      refreshCorrectedOutput();
    });
  }

  function renderAddedRemovedItem(li, item) {
    const modifier = item.type === "added" ? "compare__result-item--added" : "compare__result-item--removed";
    const tag = item.type === "added" ? "Лише в БР Щоденна" : "Лише в Розподіл";
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
      refreshCorrectedOutput();
    });

    input.addEventListener("input", () => {
      item.line = input.value;
      refreshCorrectedOutput();
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

  function expandApp() {
    document.body.classList.add("app-expanded");
  }

  function scrollToDiffItem(targetId) {
    const list = document.getElementById("diffList");
    const target = list.querySelector(`[data-id="${targetId}"]`);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("compare__result-item--flash");
    setTimeout(() => {
      target.classList.remove("compare__result-item--flash");
    }, 1500);
  }

  function renderSurnameLinks(visibleItems) {
    const container = document.getElementById("surnameLinks");
    container.innerHTML = "";

    visibleItems.forEach((item) => {
      const link = document.createElement("button");
      link.type = "button";
      link.className = "compare__surname-link";
      link.textContent = item.surname || "?";
      link.addEventListener("click", () => scrollToDiffItem(item.id));
      container.appendChild(link);
    });
  }

  function renderDiff(items) {
    currentItems = items;

    const list = document.getElementById("diffList");
    const placeholder = document.getElementById("diffPlaceholder");

    list.innerHTML = "";

    const visibleItems = items.filter((item) => item.type !== "match");
    renderSurnameLinks(visibleItems);

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
  }

  function updateCopyButtonState() {
    const output = document.getElementById("correctedOutput");
    const button = document.getElementById("copyCorrectedButton");
    button.disabled = !output.value.trim();
  }

  function refreshCorrectedOutput() {
    if (!currentItems) {
      return;
    }

    const finalLines = [];
    let counter = 0;

    currentItems.forEach((item) => {
      if (item.precedingDivider) {
        finalLines.push(item.precedingDivider);
      }

      let value = "";
      if (item.type === "match") {
        value = item.line;
      } else if (item.type === "conflict") {
        value = (item.resolved || "").trim();
      } else if (item.type === "added" || item.type === "removed") {
        if (item.included !== false) {
          value = (item.line || "").trim();
        }
      }

      if (!value) {
        return;
      }

      counter += 1;
      finalLines.push(`${counter}.\t${value};`);
    });

    if (currentTrailingDivider) {
      finalLines.push(currentTrailingDivider);
    }

    const formatted = finalLines.join("\n");

    document.getElementById("correctedOutput").value = formatted;
    updateCopyButtonState();
    document.getElementById("correctedCard").hidden = false;
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

    expandApp();
    document.getElementById("compareDate").value = entry.date;
    document.getElementById("textInputA").value = entry.textA;
    document.getElementById("textInputB").value = entry.textB;

    const comparison = buildComparison(entry.textA, entry.textB);
    currentTrailingDivider = comparison.trailingDivider;
    renderDiff(comparison.items);

    document.getElementById("correctedOutput").value = entry.corrected || "";
    updateCopyButtonState();
    document.getElementById("correctedCard").hidden = false;
  }

  function handleCompareClick() {
    expandApp();
    const textA = document.getElementById("textInputA").value;
    const textB = document.getElementById("textInputB").value;
    const comparison = buildComparison(textA, textB);
    currentTrailingDivider = comparison.trailingDivider;
    renderDiff(comparison.items);
    refreshCorrectedOutput();
  }

  function handleSaveHistoryClick() {
    const button = document.getElementById("saveHistoryButton");
    saveHistoryEntry(document.getElementById("correctedOutput").value);

    const original = button.textContent;
    button.textContent = "Збережено!";
    setTimeout(() => {
      button.textContent = original;
    }, 1500);
  }

  function fallbackCopy(textarea) {
    textarea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      /* копіювання недоступне в цьому середовищі */
    }
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

    document.getElementById("compareButton").addEventListener("click", () => {
      if (!document.getElementById("tabPanelFull").hidden) {
        handleCompareClick();
      }
    });
    document.getElementById("saveHistoryButton").addEventListener("click", handleSaveHistoryClick);
    document.getElementById("copyCorrectedButton").addEventListener("click", handleCopyClick);
    document.getElementById("correctedOutput").addEventListener("input", updateCopyButtonState);
    document.getElementById("compareHistory").addEventListener("change", handleHistoryChange);

    const textInputA = document.getElementById("textInputA");
    textInputA.addEventListener("paste", () => {
      setTimeout(() => {
        textInputA.value = normalizeSurnameCase(textInputA.value);
      }, 0);
    });
  }

  global.initCompare = initCompare;
  global.CompareCore = { parseList };
})(window);
