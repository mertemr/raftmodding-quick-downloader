// ==UserScript==
// @name         RaftModding Quick Downloader
// @namespace    https://raftmodding.com/
// @version      1.1.0
// @description  Injects quick download buttons, compatibility/type filters, and bulk download on /mods. Debug mode added to limit API requests.
// @author       mertemr
// @match        https://www.raftmodding.com/mods*
// @grant        GM_xmlhttpRequest
// @connect      *
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/mertemr/raftmodding-quick-downloader/main/raftmodding-quick-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/mertemr/raftmodding-quick-downloader/main/raftmodding-quick-downloader.user.js
// @run-at       document-end
// ==/UserScript==

(() => {
  "use strict";

  if (!location.pathname.startsWith("/mods")) {
    return;
  }

  const BASE_URL = location.origin;
  const CARD_SELECTOR = ".card.mod-card";
  const metaCache = new Map();
  const CACHE_DURATION = 48 * 60 * 60 * 1000; // 48 hours in milliseconds
  const STORAGE_KEY_PREFIX = "rmd_cache_v5_";

  const DEBUG_MODE = false; // Set to true to enable debug mode
  const DEBUG_LIMIT = 5; // Number of mods to fetch in debug mode

  const state = {
    cards: [],
    compatibilityOptions: new Set(),
    selectedCompatibility: new Set(),
    typeOptions: new Set(),
    selectedTypes: new Set(),
    bulkRunning: false,
    bulkCancel: false,
    statusEl: null,
    compatContainer: null,
    typeContainer: null,
    loadedTypes: 0,
  };

  const NOW = Date.now();

  function getStorageKey(url) {
    const slug = url.replace(/\/$/, "").split("/").pop();
    return STORAGE_KEY_PREFIX + slug;
  }

  function getFromCache(url) {
    const key = getStorageKey(url);
    try {
      const cached = localStorage.getItem(key);

      if (!cached) {
        return null;
      }

      const data = JSON.parse(cached);
      if (data.timestamp && NOW - data.timestamp < CACHE_DURATION) {
        return data.value;
      } else {
        localStorage.removeItem(key);
      }
    } catch (err) {
      console.error("Cache read error:", err);
    }
    return null;
  }

  function setInCache(url, value) {
    const key = getStorageKey(url);
    try {
      localStorage.setItem(key, JSON.stringify({
        value: value,
        timestamp: NOW
      }));
    } catch (err) {
      console.error("Cache write error:", err);
    }
  }

  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function normalizeStatus(text) {
    return normalizeText(text).toLowerCase();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setStatus(message) {
    if (state.statusEl) {
      state.statusEl.textContent = message;
    }
  }

  function ensureAbsoluteUrl(url) {
    return new URL(url, BASE_URL).href;
  }

  function getCardInfo(card) {
    const viewButton = card.querySelector("a.btn.btn-primary.stretched-link");
    if (!viewButton) return null;

    const detailHref = viewButton.getAttribute("href");
    if (!detailHref || !detailHref.startsWith("/mods/")) return null;

    const statusBadge = card.querySelector(".card-footer .badge");
    const status = normalizeStatus(statusBadge ? statusBadge.textContent : "unknown");
    const title = normalizeText(card.querySelector(".card-title")?.childNodes[0]?.textContent || "Unknown mod");

    return {
      card,
      title,
      detailUrl: ensureAbsoluteUrl(detailHref),
      status,
      type: "unknown",
      version: "unknown",
      downloadUrl: null,
      quickButton: null,
      typeBadge: null,
    };
  }

  async function fetchModMeta(detailUrl) {
  
    if (metaCache.has(detailUrl)) {
      return metaCache.get(detailUrl);
    }

    const cachedData = getFromCache(detailUrl);
    if (cachedData) {
      metaCache.set(detailUrl, Promise.resolve(cachedData));
      return cachedData;
    }

    const promise = fetch(detailUrl, { credentials: "same-origin" })
      .then((resp) => {
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        return resp.text();
      })
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const downloadHref = doc.querySelector("#download-warning-download-button")?.getAttribute("href") || null;

        const typeLi = Array.from(doc.querySelectorAll("li.list-group-item")).find((li) =>
          normalizeText(li.textContent).toLowerCase().includes("this is a")
        );
        const modType = normalizeText(typeLi?.querySelector("b")?.textContent || "unknown").toLowerCase();

        // Version: <li><i class="fas fa-hashtag"></i> Version 1.11.0<br>...</li>
        const versionLi = Array.from(doc.querySelectorAll("li.list-group-item")).find((li) =>
          li.querySelector("i.fa-hashtag") !== null
        );
        const versionMatch = versionLi ? normalizeText(versionLi.textContent).match(/v?(\d+\.\d+(?:\.\d+)*)/i) : null;
        const modVersion = versionMatch ? versionMatch[1] : "unknown";

        const result = {
          downloadUrl: downloadHref ? ensureAbsoluteUrl(downloadHref) : null,
          modType,
          modVersion,
        };

        setInCache(detailUrl, result);
        return result;
      })
      .catch((err) => {
        console.error("Fetch error for", detailUrl, err);
        return {
          downloadUrl: null,
          modType: "unknown",
          modVersion: "unknown",
          error: String(err),
        };
      });

    metaCache.set(detailUrl, promise);
    return promise;
  }

  function downloadByUrl(url, filename) {
    const name = filename || url.split("/").pop().split("?")[0] || "mod";
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          responseType: "blob",
          onload: (resp) => {
            try {
              const blobUrl = URL.createObjectURL(resp.response);
              const a = document.createElement("a");
              a.href = blobUrl;
              a.download = name;
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          onerror: (err) => {
            console.error("GM_xmlhttpRequest error:", err, url);
            reject(new Error(`Download failed: ${JSON.stringify(err)}`));
          },
          ontimeout: () => reject(new Error("Download timed out")),
        });
      } else {
        // Fallback: direct anchor click
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        resolve();
      }
    });
  }

  async function quickDownload(cardInfo, silent = false) {
    if (!silent) {
      cardInfo.quickButton.textContent = "Preparing...";
      cardInfo.quickButton.disabled = true;
    }

    try {
      if (!cardInfo.downloadUrl) {
        const meta = await fetchModMeta(cardInfo.detailUrl);
        cardInfo.downloadUrl = meta.downloadUrl;
        cardInfo.type = meta.modType;
        cardInfo.version = meta.modVersion;
      }

      if (!cardInfo.downloadUrl) {
        throw new Error("Download link not found");
      }

      await downloadByUrl(cardInfo.downloadUrl);
      if (!silent) {
        cardInfo.quickButton.textContent = "Downloaded";
      }
    } catch (err) {
      if (!silent) {
        cardInfo.quickButton.textContent = "Failed";
      }
      const msg = `Error: ${cardInfo.title} — ${err.message}`;
      setStatus(msg);
      console.error("RaftModding quick download error", cardInfo.title, err);
    } finally {
      if (!silent) {
        setTimeout(() => {
          cardInfo.quickButton.textContent = "Quick Download";
          cardInfo.quickButton.disabled = false;
        }, 1000);
      }
    }
  }

  function isVisible(card) {
    return card.style.display !== "none";
  }

  function applyFilters() {
    for (const item of state.cards) {
      const compatOK = state.selectedCompatibility.has(item.status);
      const typeFilterOff = state.selectedTypes.size === 0;
      const typeOK = typeFilterOff || state.selectedTypes.has(item.type || "unknown");
      item.card.style.display = compatOK && typeOK ? "" : "none";
    }

    const visibleCount = state.cards.filter((x) => isVisible(x.card)).length;
    setStatus(`${visibleCount}/${state.cards.length} mods visible.`);
  }

  function injectQuickButton(item) {
    const footerActions = item.card.querySelector(".card-footer .mr-auto");
    if (!footerActions) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-outline-success btn-sm quick-download-btn stretched-link-exception";
    btn.textContent = "Quick Download";
    btn.style.marginRight = "8px";
    btn.addEventListener("click", () => quickDownload(item, false));

    const infoContainer = document.createElement("div");
    infoContainer.style.display = "flex";
    infoContainer.style.gap = "6px";
    infoContainer.style.flexWrap = "wrap";
    infoContainer.style.alignItems = "center";
    infoContainer.style.marginTop = "6px";

    const typeBadge = document.createElement("span");
    typeBadge.className = "badge badge-info";
    typeBadge.textContent = "Type: loading...";
    typeBadge.style.fontSize = "11px";
    typeBadge.style.padding = "4px 8px";
    typeBadge.style.display = "inline-block";

    const versionBadge = document.createElement("span");
    versionBadge.className = "badge badge-secondary";
    versionBadge.textContent = "Version: loading...";
    versionBadge.style.fontSize = "11px";
    versionBadge.style.padding = "4px 8px";
    versionBadge.style.display = "inline-block";

    infoContainer.appendChild(typeBadge);
    infoContainer.appendChild(versionBadge);

    footerActions.appendChild(btn);
    footerActions.appendChild(infoContainer);

    item.quickButton = btn;
    item.typeBadge = typeBadge;
    item.versionBadge = versionBadge;
  }

  async function enrichCard(item) {
    const meta = await fetchModMeta(item.detailUrl);
    item.type = meta.modType || "unknown";
    item.version = meta.modVersion || "unknown";
    item.downloadUrl = meta.downloadUrl;

    if (item.typeBadge) {
      item.typeBadge.textContent = `Type: ${item.type}`;
    }

    if (item.versionBadge) {
      item.versionBadge.textContent = `Version: ${item.version}`;
    }

    const hadType = state.typeOptions.has(item.type);
    state.typeOptions.add(item.type);

    if (!hadType) {
      state.selectedTypes.add(item.type);
      rebuildTypeFilters();
    }

    state.loadedTypes += 1;
    if (state.loadedTypes % 10 === 0 || state.loadedTypes === state.cards.length) {
      applyFilters();
    }
  }

  async function enrichAllCards(concurrency = 4) {
    let index = 0;

    async function worker() {
      while (index < state.cards.length) {
        if (DEBUG_MODE && index >= DEBUG_LIMIT) {
          setStatus(`Debug mode active. Processed first ${DEBUG_LIMIT} mods.`);
          return;
        }

        const current = state.cards[index++];
        await enrichCard(current);
        await sleep(100);
      }
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(worker());
    }

    await Promise.all(workers);
    setStatus(`Ready. ${state.cards.length} mods listed.`);
  }

  function rebuildCompatibilityFilters() {
    if (!state.compatContainer) return;
    state.compatContainer.innerHTML = "";

    const sorted = Array.from(state.compatibilityOptions).sort();
    for (const status of sorted) {
      const id = `rmd-compat-${status.replace(/[^a-z0-9]+/g, "-")}`;
      const wrapper = document.createElement("label");
      wrapper.className = "mr-3 mb-1";
      wrapper.style.cursor = "pointer";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = id;
      input.checked = state.selectedCompatibility.has(status);
      input.className = "mr-1";
      input.addEventListener("change", () => {
        if (input.checked) state.selectedCompatibility.add(status);
        else state.selectedCompatibility.delete(status);
        applyFilters();
      });

      wrapper.appendChild(input);
      wrapper.appendChild(document.createTextNode(status));
      state.compatContainer.appendChild(wrapper);
    }
  }

  function rebuildTypeFilters() {
    if (!state.typeContainer) return;
    state.typeContainer.innerHTML = "";

    const sorted = Array.from(state.typeOptions).sort();
    if (sorted.length === 0) {
      state.typeContainer.textContent = "Loading...";
      return;
    }

    for (const type of sorted) {
      const id = `rmd-type-${type.replace(/[^a-z0-9]+/g, "-")}`;
      const wrapper = document.createElement("label");
      wrapper.className = "mr-3 mb-1";
      wrapper.style.cursor = "pointer";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = id;
      input.checked = state.selectedTypes.has(type);
      input.className = "mr-1";
      input.addEventListener("change", () => {
        if (input.checked) state.selectedTypes.add(type);
        else state.selectedTypes.delete(type);
        applyFilters();
      });

      wrapper.appendChild(input);
      wrapper.appendChild(document.createTextNode(type));
      state.typeContainer.appendChild(wrapper);
    }
  }

  function createToolbar() {
    const host = document.createElement("section");
    host.className = "my-3";

    const card = document.createElement("div");
    card.className = "card card-body";

    const title = document.createElement("h5");
    title.textContent = "Quick Tools";

    const status = document.createElement("small");
    status.className = "text-muted d-block mb-2";
    status.textContent = `Preparing... (LocalStorage Cached data may be stale after ${Math.round(CACHE_DURATION / (60 * 60 * 1000))} hours)`;
    state.statusEl = status;

    const compatLabel = document.createElement("div");
    compatLabel.className = "font-weight-bold";
    compatLabel.textContent = "Compatibility";

    const compatContainer = document.createElement("div");
    compatContainer.className = "mb-2";
    state.compatContainer = compatContainer;

    const typeLabel = document.createElement("div");
    typeLabel.className = "font-weight-bold";
    typeLabel.textContent = "Type";

    const typeContainer = document.createElement("div");
    typeContainer.className = "mb-2";
    state.typeContainer = typeContainer;

    const actions = document.createElement("div");
    actions.className = "d-flex flex-wrap align-items-center";

    const dlVisibleBtn = document.createElement("button");
    dlVisibleBtn.className = "btn btn-success btn-sm mr-2 mb-1";
    dlVisibleBtn.textContent = "Download Filtered";
    dlVisibleBtn.addEventListener("click", async () => {
      if (state.bulkRunning) return;

      const targets = state.cards.filter((item) => isVisible(item.card));
      if (targets.length === 0) {
        setStatus("No visible mods to download.");
        return;
      }

      state.bulkRunning = true;
      state.bulkCancel = false;
      setStatus(`Bulk download started (${targets.length} mods).`);

      for (let i = 0; i < targets.length; i++) {
        if (state.bulkCancel) {
          setStatus("Bulk download stopped.");
          break;
        }

        const item = targets[i];
        setStatus(`Downloading (${i + 1}/${targets.length}): ${item.title}`);
        await quickDownload(item, true);
        await sleep(800);
      }

      if (!state.bulkCancel) {
        setStatus("Bulk download completed.");
      }
      state.bulkRunning = false;
      state.bulkCancel = false;
    });

    const stopBtn = document.createElement("button");
    stopBtn.className = "btn btn-outline-danger btn-sm mr-2 mb-1";
    stopBtn.textContent = "Stop";
    stopBtn.addEventListener("click", () => {
      state.bulkCancel = true;
    });

    const selectAllTypesBtn = document.createElement("button");
    selectAllTypesBtn.className = "btn btn-outline-secondary btn-sm mb-1";
    selectAllTypesBtn.textContent = "Select All Types";
    selectAllTypesBtn.addEventListener("click", () => {
      state.selectedTypes = new Set(state.typeOptions);
      rebuildTypeFilters();
      applyFilters();
    });

    const clearTypeFilterBtn = document.createElement("button");
    clearTypeFilterBtn.className = "btn btn-outline-secondary btn-sm ml-2 mb-1";
    clearTypeFilterBtn.textContent = "Clear Type Filter";
    clearTypeFilterBtn.addEventListener("click", () => {
      state.selectedTypes.clear();
      rebuildTypeFilters();
      applyFilters();
    });

    const clearCacheBtn = document.createElement("button");
    clearCacheBtn.className = "btn btn-outline-warning btn-sm ml-2 mb-1";
    clearCacheBtn.textContent = "Clear Cache";
    clearCacheBtn.addEventListener("click", () => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(STORAGE_KEY_PREFIX));
      keys.forEach((k) => localStorage.removeItem(k));
      metaCache.clear();
      setStatus(`Cache cleared (${keys.length} entries). Reload the page to re-fetch.`);
    });

    actions.appendChild(dlVisibleBtn);
    actions.appendChild(stopBtn);
    if (!DEBUG_MODE) {
      actions.appendChild(selectAllTypesBtn);
      actions.appendChild(clearTypeFilterBtn);
    }
    actions.appendChild(clearCacheBtn);

    card.appendChild(title);
    card.appendChild(status);
    card.appendChild(compatLabel);
    card.appendChild(compatContainer);
    if (!DEBUG_MODE) {
      card.appendChild(typeLabel);
      card.appendChild(typeContainer);
    }
    card.appendChild(actions);
    host.appendChild(card);

    const insertAfter = document.querySelector("div.container > section.my-3:nth-of-type(3)");
    if (insertAfter && insertAfter.parentElement) {
      insertAfter.insertAdjacentElement("afterend", host);
    } else {
      const mainContainer = document.querySelector("div.container");
      if (mainContainer) mainContainer.prepend(host);
    }
  }

  function init() {
    const cards = Array.from(document.querySelectorAll(CARD_SELECTOR));
    if (!cards.length) return;

    for (const card of cards) {
      const item = getCardInfo(card);
      if (!item) continue;

      state.cards.push(item);
      state.compatibilityOptions.add(item.status);
      state.selectedCompatibility.add(item.status);

      injectQuickButton(item);
    }

    state.typeOptions.add("unknown");
    state.selectedTypes.add("unknown");

    createToolbar();
    rebuildCompatibilityFilters();
    rebuildTypeFilters();
    applyFilters();

    enrichAllCards(4).catch((err) => {
      setStatus("Some mod details could not be fetched. Check the console.");
      console.error("RaftModding enrichAllCards error", err);
    });
  }

  init();
})();
