(() => {
  const ROLL_COUNT_KEY = "mana-roll-target-count";
  const EXCLUDED_KEY = "mana-roll-excluded-decks";
  const DEFAULT_ROLL_COUNT = 4;
  const MAX_ROLL_COUNT = 40;
  const COLORS = ["W", "U", "B", "R", "G", "C"];
  const COLOR_ORDER = { C: 0, W: 1, U: 2, B: 3, R: 4, G: 5 };
  let inMemoryRollCount = DEFAULT_ROLL_COUNT;
  let inMemoryExcluded = [];

  // Class strings copied from the app's own components so the injected UI
  // matches the design system in both themes.
  const GHOST_ICON_BUTTON_CLASS =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2 border border-transparent";
  const APP_INPUT_CLASS =
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

  const SVG_ATTRS =
    'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const ICON_MINUS = `<svg ${SVG_ATTRS} class="w-4 h-4"><path d="M5 12h14"/></svg>`;
  const ICON_PLUS = `<svg ${SVG_ATTRS} class="w-4 h-4"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`;
  const ICON_PENCIL = `<svg ${SVG_ATTRS} class="w-4 h-4"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>`;
  const ICON_BAN = `<svg ${SVG_ATTRS} class="w-4 h-4"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>`;

  function clampRollCount(value) {
    if (!Number.isFinite(value)) return DEFAULT_ROLL_COUNT;
    return Math.max(1, Math.min(MAX_ROLL_COUNT, Math.floor(value)));
  }

  function getExcludedIds() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(EXCLUDED_KEY) || "[]");
      if (Array.isArray(raw)) inMemoryExcluded = raw.filter(Number.isFinite);
    } catch (error) {
      // Ignore storage errors and keep in-memory value.
    }
    return inMemoryExcluded;
  }

  function setExcludedIds(ids) {
    inMemoryExcluded = [...new Set(ids)].filter(Number.isFinite);
    try {
      window.localStorage.setItem(EXCLUDED_KEY, JSON.stringify(inMemoryExcluded));
    } catch (error) {
      // Ignore storage errors and keep in-memory value.
    }
  }

  function isExcluded(deckId) {
    return getExcludedIds().includes(deckId);
  }

  function toggleExcluded(deckId) {
    const ids = getExcludedIds();
    setExcludedIds(ids.includes(deckId) ? ids.filter((id) => id !== deckId) : [...ids, deckId]);
  }

  // Counts decks eligible for rolling: prefers the rendered deck list (always
  // current), falls back to unlimited when the list isn't mounted yet.
  function getEligibleDeckCount() {
    const rows = document.querySelectorAll('[data-testid^="row-deck-"]');
    if (rows.length === 0) return null;
    let eligible = 0;
    rows.forEach((row) => {
      const deckId = Number((row.getAttribute("data-testid") || "").replace("row-deck-", ""));
      if (Number.isFinite(deckId) && !isExcluded(deckId)) eligible += 1;
    });
    return eligible;
  }

  function getMaxRollCount() {
    const eligible = getEligibleDeckCount();
    if (Number.isFinite(eligible) && eligible > 0) {
      return Math.min(MAX_ROLL_COUNT, eligible);
    }
    return MAX_ROLL_COUNT;
  }

  function getRollCount() {
    try {
      const stored = Number(window.localStorage.getItem(ROLL_COUNT_KEY));
      const value = clampRollCount(stored || DEFAULT_ROLL_COUNT);
      inMemoryRollCount = value;
      return value;
    } catch (error) {
      return clampRollCount(inMemoryRollCount);
    }
  }

  function setRollCount(value) {
    const next = clampRollCount(value);
    inMemoryRollCount = next;
    try {
      window.localStorage.setItem(ROLL_COUNT_KEY, String(next));
    } catch (error) {
      // Ignore storage errors and keep in-memory value.
    }
  }

  // Read by the patched app bundle at roll time so the app itself rolls the
  // configured number of decks (instead of a hardcoded 4).
  window.__mrCount = () => getRollCount();

  // Read by the patched app bundle when rolling: filters out excluded decks so
  // they can never be picked.
  window.__mrEligible = (decks) =>
    Array.isArray(decks) ? decks.filter((deck) => deck && !isExcluded(deck.id)) : decks;

  // Ask the app (react-query) to refetch and re-render from the server.
  // Falls back to a reload only if the patched bundle didn't expose the client.
  function refreshAppData() {
    const queryClient = window.__mrQueryClient;
    if (queryClient && typeof queryClient.invalidateQueries === "function") {
      queryClient.invalidateQueries();
      return;
    }
    window.location.reload();
  }

  function getTodayId() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function normalizeColors(colors) {
    if (!Array.isArray(colors)) return [];
    const unique = [...new Set(colors)];
    if (unique.includes("C")) return ["C"];
    return unique.sort((left, right) => (COLOR_ORDER[left] || 0) - (COLOR_ORDER[right] || 0));
  }

  function colorKey(colors) {
    return normalizeColors(colors).join(",");
  }

  function rollDice() {
    const dice = [];
    for (let index = 0; index < 5; index += 1) {
      dice.push(COLORS[Math.floor(Math.random() * COLORS.length)]);
    }
    return dice;
  }

  function diceToMatchedColors(dice) {
    if (dice.every((value) => value === "C")) return ["C"];
    const filtered = dice.filter((value) => value !== "C");
    return normalizeColors(filtered);
  }

  async function request(path, options) {
    // Local-only implementation: use localStorage for all app data. No network
    // requests are performed and no bundled JSON files are required.
    options = options || {};

    const DECKS_KEY = "mana-roll.decks";
    const ROLLS_KEY = "mana-roll.rolls";

    function loadDecksFromStorage() {
      try {
        const raw = window.localStorage.getItem(DECKS_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return [];
    }

    function saveDecksToStorage(decks) {
      try { window.localStorage.setItem(DECKS_KEY, JSON.stringify(decks)); } catch (e) {}
    }

    function loadRollsFromStorage() {
      try {
        const raw = window.localStorage.getItem(ROLLS_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return {};
    }

    function saveRollsToStorage(rolls) {
      try { window.localStorage.setItem(ROLLS_KEY, JSON.stringify(rolls)); } catch (e) {}
    }

    const method = (options && options.method) ? options.method.toUpperCase() : "GET";

    if (path === "/api/decks") {
      if (method === "GET") {
        return loadDecksFromStorage();
      }
      if (method === "POST") {
        const payload = options && options.body ? JSON.parse(options.body) : {};
        const decks = loadDecksFromStorage();
        const nextId = (decks.length ? Math.max(...decks.map((d) => Number(d.id) || 0)) : 0) + 1;
        if (!payload.id) payload.id = nextId;
        decks.push(payload);
        saveDecksToStorage(decks);
        return { success: true };
      }
    }

    if (path.startsWith("/api/decks/")) {
      const idStr = path.split("/").pop();
      if (method === "PUT") {
        const payload = options && options.body ? JSON.parse(options.body) : {};
        const decks = loadDecksFromStorage();
        const id = Number(idStr);
        let updated = false;
        for (let i = 0; i < decks.length; i += 1) {
          if (Number(decks[i].id) === id) {
            decks[i].name = payload.name;
            updated = true;
            break;
          }
        }
        saveDecksToStorage(decks);
        if (!updated) throw new Error("Deck not found");
        return { success: true };
      }
      if (method === "DELETE") {
        let decks = loadDecksFromStorage();
        if (idStr === "undefined" || idStr === "") {
          if (decks.length) decks.pop();
        } else {
          const id = Number(idStr);
          decks = decks.filter((d) => Number(d.id) !== id);
        }
        saveDecksToStorage(decks);
        return { success: true };
      }
    }

    if (path.startsWith("/api/roll-sessions/")) {
      const day = path.split("/").pop();
      if (method === "GET") {
        const rolls = loadRollsFromStorage();
        return rolls[day] || { results: [] };
      }
      if (method === "PUT") {
        const payload = options && options.body ? JSON.parse(options.body) : {};
        const rolls = loadRollsFromStorage();
        rolls[day] = payload;
        saveRollsToStorage(rolls);
        return { success: true };
      }
    }

    throw new Error(`${method} ${path} failed`);
  }

      if (method === "GET") {
        return await loadDecksFromStorage();
      }
      if (method === "POST") {
        const payload = options && options.body ? JSON.parse(options.body) : {};
        const decks = await loadDecksFromStorage();
        const nextId = (decks.length ? Math.max(...decks.map((d) => Number(d.id) || 0)) : 0) + 1;
        if (!payload.id) payload.id = nextId;
        decks.push(payload);
        await saveDecksToStorage(decks);
        return { success: true };
      }
    }

    if (path.startsWith("/api/decks/")) {
      const idStr = path.split("/").pop();
      if (method === "PUT") {
        const payload = options && options.body ? JSON.parse(options.body) : {};
        const decks = await loadDecksFromStorage();
        const id = Number(idStr);
        let updated = false;
        for (let i = 0; i < decks.length; i += 1) {
          if (Number(decks[i].id) === id) {
            decks[i].name = payload.name;
            updated = true;
            break;
          }
        }
        await saveDecksToStorage(decks);
        if (!updated) throw new Error("Deck not found");
        return { success: true };
      }
      if (method === "DELETE") {
        let decks = await loadDecksFromStorage();
        if (idStr === "undefined" || idStr === "") {
          if (decks.length) decks.pop();
        } else {
          const id = Number(idStr);
          decks = decks.filter((d) => Number(d.id) !== id);
        }
        await saveDecksToStorage(decks);
        return { success: true };
      }
    }

    if (path.startsWith("/api/roll-sessions/")) {
      const day = path.split("/").pop();
      if (method === "GET") {
        const rolls = await loadRollsFromStorage();
        return rolls[day] || { results: [] };
      }
      if (method === "PUT") {
        const payload = options && options.body ? JSON.parse(options.body) : {};
        const rolls = await loadRollsFromStorage();
        rolls[day] = payload;
        await saveRollsToStorage(rolls);
        return { success: true };
      }
    }

    throw new Error(`${method} ${path} failed`);
  }

  function buildResult(decks, usedDeckIds) {
    for (let attempt = 0; attempt < 20000; attempt += 1) {
      const dice = rollDice();
      const matchedColors = diceToMatchedColors(dice);
      const key = colorKey(matchedColors);
      const deck = decks.find(
        (candidate) => !usedDeckIds.has(candidate.id) && colorKey(candidate.colors) === key,
      );

      if (deck) {
        usedDeckIds.add(deck.id);
        return {
          attempts: [{ dice, matchedColors, valid: true, reason: "ok" }],
          deckId: deck.id,
          deckName: deck.name,
          colors: matchedColors,
        };
      }
    }

    const fallbackDice = rollDice();
    return {
      attempts: [
        { dice: fallbackDice, matchedColors: diceToMatchedColors(fallbackDice), valid: false, reason: "no-deck-match" },
      ],
      deckId: null,
      deckName: null,
      colors: null,
    };
  }

  async function applyDesiredRollCount() {
    const decks = (await request("/api/decks")) || [];
    const eligibleDecks = window.__mrEligible(decks);
    const today = getTodayId();
    const rollSession = (await request(`/api/roll-sessions/${today}`)) || { results: [] };
    const results = Array.isArray(rollSession.results) ? rollSession.results.slice() : [];

    if (results.length === 0) return false;

    const usedDeckIds = new Set(
      results
        .map((result) => result && result.deckId)
        .filter((deckId) => Number.isFinite(deckId)),
    );

    let desired = getRollCount();
    if (desired > results.length) {
      // Only add as many rolls as there are eligible decks left to pick from.
      const available = eligibleDecks.filter((deck) => !usedDeckIds.has(deck.id)).length;
      desired = Math.min(desired, results.length + available);
    }

    if (results.length === desired) return false;

    if (results.length > desired) {
      results.length = desired;
    } else {
      while (results.length < desired) {
        results.push(buildResult(eligibleDecks, usedDeckIds));
      }
    }

    await request(`/api/roll-sessions/${today}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results }),
    });
    return true;
  }

  async function waitForRollSessionChange(beforeSerialized) {
    const today = getTodayId();
    const deadline = Date.now() + 14000;

    while (Date.now() < deadline) {
      const current = (await request(`/api/roll-sessions/${today}`)) || { results: [] };
      const currentResults = Array.isArray(current.results) ? current.results : [];
      if (JSON.stringify(currentResults) !== beforeSerialized) return;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  function getEventElement(event) {
    const target = event.target;
    if (target instanceof Element) return target;
    if (target && target.parentElement) return target.parentElement;
    return null;
  }

  async function waitForRollAnimation() {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const button = document.querySelector('[data-testid="button-roll"]');
      if (!button) return;
      if (!button.disabled || !button.textContent.includes("Rolling")) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  function injectStyles() {
    if (document.getElementById("mana-roll-enhancements-style")) return;
    const style = document.createElement("style");
    style.id = "mana-roll-enhancements-style";
    style.textContent = `
      .mr-edit-pencil, .mr-exclude-btn { opacity: 0; transition: opacity 0.15s ease; color: hsl(var(--muted-foreground)); }
      li[data-testid^="row-deck-"]:hover .mr-edit-pencil,
      li[data-testid^="row-deck-"]:focus-within .mr-edit-pencil,
      li[data-testid^="row-deck-"]:hover .mr-exclude-btn,
      li[data-testid^="row-deck-"]:focus-within .mr-exclude-btn { opacity: 1; }
      @media (hover: none) { .mr-edit-pencil, .mr-exclude-btn { opacity: 0.65; } }
      .mr-exclude-btn.mr-active { opacity: 1; color: hsl(var(--destructive)); }
      li.mr-excluded > div:first-child > div { opacity: 0.45; }
      li.mr-excluded [data-testid^="text-deck-name-"] { text-decoration: line-through; }
      #roll-count-control .mr-step-btn { border-radius: 0; }
      #roll-count-control.mr-applying { opacity: 0.6; pointer-events: none; }
    `;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // Roll count stepper (lives inside the roll card, next to the roll button)
  // ---------------------------------------------------------------------------

  let applyTimer = null;
  let applying = false;

  function scheduleApply() {
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = setTimeout(runApply, 500);
  }

  async function runApply() {
    if (applying) return;
    applying = true;
    const control = document.getElementById("roll-count-control");
    if (control) control.classList.add("mr-applying");
    try {
      const changed = await applyDesiredRollCount();
      if (changed) refreshAppData();
    } catch (error) {
      console.error("Failed to apply roll count", error);
    } finally {
      applying = false;
      const active = document.getElementById("roll-count-control");
      if (active) active.classList.remove("mr-applying");
    }
  }

  function updateStepperState() {
    const control = document.getElementById("roll-count-control");
    if (!control) return;
    const count = getRollCount();
    const valueNode = control.querySelector(".mr-step-value");
    if (valueNode && valueNode.textContent !== String(count)) {
      valueNode.textContent = String(count);
    }
    const minus = control.querySelector(".mr-step-minus");
    const plus = control.querySelector(".mr-step-plus");
    if (minus) minus.disabled = count <= 1;
    if (plus) plus.disabled = count >= getMaxRollCount();
    updateFooterCount(count);
  }

  function updateFooterCount(count) {
    const paragraphs = document.querySelectorAll("p");
    for (const paragraph of paragraphs) {
      if (paragraph.children.length > 0) continue;
      const text = paragraph.textContent || "";
      if (!/Up to \d+ unique decks? (?:are|is) picked per day\./.test(text)) continue;
      const replacement = text.replace(
        /Up to \d+ unique decks? (?:are|is) picked per day\./,
        count === 1
          ? "Up to 1 unique deck is picked per day."
          : `Up to ${count} unique decks are picked per day.`,
      );
      if (replacement !== text) paragraph.textContent = replacement;
    }
  }

  function makeStepButton(iconMarkup, extraClass) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${GHOST_ICON_BUTTON_CLASS} mr-step-btn ${extraClass} h-8 w-8`;
    button.innerHTML = iconMarkup;
    return button;
  }

  function mountRollCountControl() {
    if (document.getElementById("roll-count-control")) {
      updateStepperState();
      return;
    }
    const rollButton = document.querySelector('[data-testid="button-roll"]');
    if (!rollButton || !rollButton.parentElement) return;

    const control = document.createElement("div");
    control.id = "roll-count-control";
    control.className = "flex items-center gap-2 ml-auto";
    control.setAttribute("data-enhancement", "roll-count-control");

    const label = document.createElement("span");
    label.className = "text-sm text-muted-foreground select-none";
    label.textContent = "Decks to roll for";

    const group = document.createElement("div");
    group.className = "inline-flex items-center rounded-md border border-input bg-background overflow-hidden";

    const minus = makeStepButton(ICON_MINUS, "mr-step-minus");
    const plus = makeStepButton(ICON_PLUS, "mr-step-plus");

    const value = document.createElement("span");
    value.className = "mr-step-value w-8 text-center text-sm font-medium tabular-nums select-none";
    value.textContent = String(getRollCount());

    minus.addEventListener("click", () => {
      setRollCount(getRollCount() - 1);
      updateStepperState();
      scheduleApply();
    });
    plus.addEventListener("click", () => {
      setRollCount(getRollCount() + 1);
      updateStepperState();
      scheduleApply();
    });

    group.appendChild(minus);
    group.appendChild(value);
    group.appendChild(plus);
    control.appendChild(label);
    control.appendChild(group);
    rollButton.parentElement.appendChild(control);

    updateStepperState();
  }

  // ---------------------------------------------------------------------------
  // Inline deck name editing (hover pencil, edit in place — no dialogs)
  // ---------------------------------------------------------------------------

  function startInlineEdit(deckNameNode) {
    const testId = deckNameNode.getAttribute("data-testid");
    if (!testId || !testId.startsWith("text-deck-name-")) return;
    const deckId = Number(testId.replace("text-deck-name-", ""));
    if (!Number.isFinite(deckId)) return;

    const container = deckNameNode.parentElement;
    if (!container) return;
    if (container.querySelector(".mr-name-input")) return;

    const currentName = deckNameNode.textContent ? deckNameNode.textContent.trim() : "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = `${APP_INPUT_CLASS} mr-name-input h-8 px-2 font-medium`;
    input.value = currentName;
    input.setAttribute("aria-label", "Deck name");
    input.setAttribute("data-enhancement", "deck-name-input");

    deckNameNode.style.display = "none";
    container.insertBefore(input, deckNameNode);
    input.focus();
    input.select();

    let finished = false;

    function cleanup() {
      finished = true;
      input.remove();
      deckNameNode.style.display = "";
    }

    async function commit() {
      if (finished) return;
      const nextName = input.value.trim();
      if (!nextName || nextName === currentName) {
        cleanup();
        return;
      }
      input.disabled = true;
      try {
        await request(`/api/decks/${deckId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nextName }),
        });
        deckNameNode.textContent = nextName;
        cleanup();
        refreshAppData();
      } catch (error) {
        console.error("Failed to update deck name", error);
        input.disabled = false;
        input.style.borderColor = "hsl(var(--destructive))";
        input.focus();
      }
    }

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cleanup();
      }
    });
    input.addEventListener("blur", () => {
      commit();
    });
  }

  function applyExclusionState(row, deckId, banButton) {
    const excluded = isExcluded(deckId);
    if (row.classList.contains("mr-excluded") !== excluded) {
      row.classList.toggle("mr-excluded", excluded);
    }
    if (banButton.classList.contains("mr-active") !== excluded) {
      banButton.classList.toggle("mr-active", excluded);
    }
    const title = excluded ? "Include in rolls again" : "Exclude from rolls";
    if (banButton.title !== title) {
      banButton.title = title;
      banButton.setAttribute("aria-label", title);
      banButton.setAttribute("aria-pressed", String(excluded));
    }
  }

  function mountDeckRowControls() {
    const deckNameNodes = document.querySelectorAll('[data-testid^="text-deck-name-"]');
    deckNameNodes.forEach((deckNameNode) => {
      const row = deckNameNode.closest("li");
      const leftGroup = deckNameNode.parentElement ? deckNameNode.parentElement.parentElement : null;
      if (!row || !leftGroup) return;

      const testId = deckNameNode.getAttribute("data-testid") || "";
      const deckId = Number(testId.replace("text-deck-name-", ""));
      if (!Number.isFinite(deckId)) return;

      const existingBan = row.querySelector('[data-enhancement="exclude-deck"]');
      if (existingBan) {
        applyExclusionState(row, deckId, existingBan);
        return;
      }

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = `${GHOST_ICON_BUTTON_CLASS} mr-edit-pencil h-8 w-8 shrink-0`;
      editButton.setAttribute("data-enhancement", "edit-deck-name");
      editButton.setAttribute("aria-label", "Edit deck name");
      editButton.title = "Edit deck name";
      editButton.innerHTML = ICON_PENCIL;
      editButton.addEventListener("click", () => startInlineEdit(deckNameNode));

      const banButton = document.createElement("button");
      banButton.type = "button";
      banButton.className = `${GHOST_ICON_BUTTON_CLASS} mr-exclude-btn h-8 w-8 shrink-0`;
      banButton.setAttribute("data-enhancement", "exclude-deck");
      banButton.innerHTML = ICON_BAN;
      banButton.addEventListener("click", () => {
        toggleExcluded(deckId);
        applyExclusionState(row, deckId, banButton);
        updateStepperState();
      });

      leftGroup.appendChild(editButton);
      leftGroup.appendChild(banButton);
      applyExclusionState(row, deckId, banButton);
    });
  }

  document.addEventListener("click", async (event) => {
    const targetElement = getEventElement(event);
    if (!targetElement) return;
    const rollButton = targetElement.closest('[data-testid="button-roll"]');
    if (!rollButton) return;
    try {
      const today = getTodayId();
      const beforeSession = (await request(`/api/roll-sessions/${today}`)) || { results: [] };
      const beforeResults = Array.isArray(beforeSession.results) ? beforeSession.results : [];
      const beforeSerialized = JSON.stringify(beforeResults);
      await waitForRollAnimation();
      await waitForRollSessionChange(beforeSerialized);
      const changed = await applyDesiredRollCount();
      if (changed) refreshAppData();
    } catch (error) {
      console.error("Failed to adjust roll results", error);
    }
  });

  document.addEventListener("dblclick", (event) => {
    const targetElement = getEventElement(event);
    if (!targetElement) return;
    const deckNameNode = targetElement.closest('[data-testid^="text-deck-name-"]');
    if (!deckNameNode) return;
    startInlineEdit(deckNameNode);
  });

  function mountAllEnhancements() {
    injectStyles();
    mountRollCountControl();
    mountDeckRowControls();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountAllEnhancements, { once: true });
  } else {
    mountAllEnhancements();
  }

  const observer = new MutationObserver(() => {
    mountAllEnhancements();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
