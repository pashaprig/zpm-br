(function (global) {
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function firstBySurname(records) {
    const map = new Map();
    records.forEach((rec) => {
      if (!map.has(rec.surnameKey)) {
        map.set(rec.surnameKey, rec);
      }
    });
    return map;
  }

  function orderedSurnameKeys(recordsA, recordsB) {
    const keys = [];
    const seen = new Set();
    recordsA.concat(recordsB).forEach((rec) => {
      if (!seen.has(rec.surnameKey)) {
        seen.add(rec.surnameKey);
        keys.push(rec.surnameKey);
      }
    });
    return keys;
  }

  function buildSurnameDiff(textA, textB) {
    const { parseList } = global.CompareCore;
    const recordsA = parseList(textA).records;
    const recordsB = parseList(textB).records;

    const mapA = firstBySurname(recordsA);
    const mapB = firstBySurname(recordsB);

    const items = [];
    let uid = 0;
    const countA = recordsA.length;
    const countB = recordsB.length;

    orderedSurnameKeys(recordsA, recordsB).forEach((key) => {
      const inA = mapA.has(key);
      const inB = mapB.has(key);

      if (inA && inB) {
        const recA = mapA.get(key);
        const recB = mapB.get(key);
        if (recA.surname !== recB.surname) {
          uid += 1;
          items.push({
            id: `sn-${uid}`,
            type: "case",
            surname: recA.surname || recB.surname,
            lineA: recA.line,
            lineB: recB.line,
          });
        }
        return;
      }

      uid += 1;
      if (inA) {
        const rec = mapA.get(key);
        items.push({ id: `sn-${uid}`, type: "removed", surname: rec.surname || key, line: rec.line });
      } else {
        const rec = mapB.get(key);
        items.push({ id: `sn-${uid}`, type: "added", surname: rec.surname || key, line: rec.line });
      }
    });

    return { items, countA, countB };
  }

  function updateFieldCounts(countA, countB) {
    document.getElementById("cardALabel").textContent = `Прізвища (${countA})`;
    document.getElementById("cardBLabel").textContent = `БР Щоденна (${countB})`;
  }

  function refreshCounts() {
    if (document.getElementById("tabPanelSurname").hidden) {
      return;
    }
    const { parseList } = global.CompareCore;
    const countA = parseList(document.getElementById("textInputA").value).records.length;
    const countB = parseList(document.getElementById("textInputB").value).records.length;
    updateFieldCounts(countA, countB);
  }

  function renderItem(item) {
    const li = document.createElement("li");
    li.dataset.id = item.id;

    if (item.type === "case") {
      li.className = "compare__result-item compare__result-item--changed";
      li.innerHTML = `
        <span class="compare__item-tag">Помилка в регістрі:</span>
        <span>${escapeHtml(item.lineA)}<span class="compare__item-tag"> / </span>${escapeHtml(item.lineB)}</span>
      `;
      return li;
    }

    const modifier = item.type === "added" ? "compare__result-item--added" : "compare__result-item--removed";
    const tag = item.type === "added" ? "Немає в Тексті 1" : "Немає в Тексті 2";
    li.className = `compare__result-item ${modifier}`;
    li.innerHTML = `
      <span class="compare__item-tag">${tag}:</span>
      <span>${escapeHtml(item.line)}</span>
    `;
    return li;
  }

  function scrollToItem(targetId) {
    const list = document.getElementById("diffListSurname");
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

  function renderSurnameLinks(items) {
    const container = document.getElementById("surnameLinksSurname");
    container.innerHTML = "";
    items.forEach((item) => {
      const link = document.createElement("button");
      link.type = "button";
      link.className = "compare__surname-link";
      link.textContent = item.surname || "?";
      link.addEventListener("click", () => scrollToItem(item.id));
      container.appendChild(link);
    });
  }

  function renderDiff(items) {
    const list = document.getElementById("diffListSurname");
    const placeholder = document.getElementById("diffPlaceholderSurname");

    list.innerHTML = "";
    renderSurnameLinks(items);

    if (items.length === 0) {
      placeholder.hidden = false;
      placeholder.textContent = "Розбіжностей та помилок у регістрі не знайдено — прізвища збігаються.";
      list.hidden = true;
    } else {
      placeholder.hidden = true;
      list.hidden = false;
      items.forEach((item) => {
        list.appendChild(renderItem(item));
      });
    }
  }

  function handleCompareClick() {
    document.body.classList.add("app-expanded");
    const textA = document.getElementById("textInputA").value;
    const textB = document.getElementById("textInputB").value;
    const { items, countA, countB } = buildSurnameDiff(textA, textB);
    updateFieldCounts(countA, countB);
    renderDiff(items);
  }

  function initCompareSurname() {
    document.getElementById("compareButton").addEventListener("click", () => {
      if (!document.getElementById("tabPanelSurname").hidden) {
        handleCompareClick();
      }
    });

    document.getElementById("textInputA").addEventListener("input", refreshCounts);
    document.getElementById("textInputB").addEventListener("input", refreshCounts);
  }

  global.initCompareSurname = initCompareSurname;
  global.refreshSurnameCounts = refreshCounts;
})(window);
