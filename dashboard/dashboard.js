const browserAPI = typeof chrome !== "undefined" ? chrome : browser;

let allTombstones = [];
let filtered = [];
let displayed = [];
let statsCalc;
let isLoading = false;
let loadingTimeout = null;
let currentPage = 1;
let hasMoreItems = false;

let selected = new Set();
let isSelectionMode = false;

let lastTab = null;
let undoTimeout = null;

const cleanups = new Map();

document.addEventListener("DOMContentLoaded", async () => {
    try {
        showLoading("Initializing WebCemetery...");

        if (typeof storage === "undefined") throw new Error("Storage not loaded");

        const initPromise = storage.init();
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Storage init timeout")), 10000),
        );

        await Promise.race([initPromise, timeoutPromise]);
        statsCalc = new StatsCalculator(storage);

        try {
            await loadStats();
        } catch (error) {
            console.error("Failed to load stats:", error);
        }

        try {
            await loadTombstones();
        } catch (error) {
            console.error("Failed to load tombstones:", error);
        }

        try {
            await loadAchievements();
        } catch (error) {
            console.error("Failed to load achievements:", error);
        }

        try {
            await loadLeaderboards();
        } catch (error) {
            console.error("Failed to load leaderboards:", error);
        }

        setupEventListeners();
        setupModalListeners();

        await loadThemeSettings();

        initMobileEnhancements();

        hideLoading();
    } catch (error) {
        console.error("Error initializing dashboard:", error);
        showErrorState("Failed to initialize WebCemetery. Please refresh the page.");
    }
});

async function loadStats() {
    try {
        showSectionLoading("statistics");
        const stats = await statsCalc.getKillCounts();

        document.getElementById("stat-today").textContent = stats.today || "0";
        document.getElementById("stat-week").textContent = stats.week || "0";
        document.getElementById("stat-total").textContent = stats.total || "0";

        hideSectionLoading("statistics");
    } catch (error) {
        console.error("Error loading stats:", error);
        hideSectionLoading("statistics");
        showSectionError("statistics", "Failed to load statistics");
        throw error;
    }
}

async function loadTombstones() {
    try {
        showSectionLoading("tombstones");
        allTombstones = await storage.getAllTombstones();
        filtered = [...allTombstones];

        currentPage = 1;
        applySorting();
        renderTombstones();
        updateResultsCount();

        hideSectionLoading("tombstones");
    } catch (error) {
        console.error("Error loading tombstones:", error);
        hideSectionLoading("tombstones");
        showSectionError("tombstones", "Failed to load cemetery");
        throw error;
    }
}

function renderTombstones(append = false) {
    const grid = document.getElementById("cemetery-grid");
    const emptyState = document.getElementById("empty-state");

    if (!append) cleanupTombstoneEventListeners();

    if (!append) {
        const existingTombstones = grid.querySelectorAll(".tombstone");
        existingTombstones.forEach((t) => t.remove());

        const existingLoadMore = grid.parentElement.querySelector(".load-more-container");
        if (existingLoadMore) existingLoadMore.remove();
    }

    if (filtered.length === 0) {
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";

    const startIndex = append ? (currentPage - 1) * 50 : 0;
    const endIndex = currentPage * 50;
    const tombstonesToRender = filtered.slice(startIndex, endIndex);
    hasMoreItems = endIndex < filtered.length;

    displayed = filtered.slice(0, endIndex);
    const fragment = document.createDocumentFragment();

    tombstonesToRender.forEach((tombstone, index) => {
        const element = createTombstoneElement(tombstone);
        element.style.animationDelay = `${(append ? 0 : index) * 0.03}s`;
        fragment.appendChild(element);
    });

    grid.appendChild(fragment);
    renderLoadMoreButton(grid.parentElement);
    updateResultsCount();
}

function renderLoadMoreButton(container) {
    const existing = container.querySelector(".load-more-container");
    if (existing) existing.remove();
    if (!hasMoreItems) return;

    const loadMoreContainer = document.createElement("div");
    loadMoreContainer.className = "load-more-container";
    loadMoreContainer.innerHTML = `<button class="btn btn-secondary load-more-btn" aria-label="Load more tombstones">Load More (${filtered.length - currentPage * 50} remaining)</button>`;

    const loadMoreBtn = loadMoreContainer.querySelector(".load-more-btn");
    loadMoreBtn.addEventListener("click", loadMoreTombstones);
    container.appendChild(loadMoreContainer);
}

function loadMoreTombstones() {
    currentPage++;
    renderTombstones(true);
}

function cleanupTombstoneEventListeners() {
    cleanups.forEach((cleanup, element) => {
        if (typeof cleanup === "function") cleanup();
    });
    cleanups.clear();
}

function renderTombstonesInChunks(tombstones, container) {
    const CHUNK_SIZE = 20;
    let currentIndex = 0;

    function renderChunk() {
        const fragment = document.createDocumentFragment();
        const endIndex = Math.min(currentIndex + CHUNK_SIZE, tombstones.length);

        for (let i = currentIndex; i < endIndex; i++) {
            const element = createTombstoneElement(tombstones[i]);
            element.style.animationDelay = `${i * 0.05}s`;
            fragment.appendChild(element);
        }

        container.appendChild(fragment);
        currentIndex = endIndex;

        if (currentIndex < tombstones.length) {
            if ("requestIdleCallback" in window) {
                requestIdleCallback(renderChunk, { timeout: 50 });
            } else setTimeout(renderChunk, 0);
        }
    }

    renderChunk();
}

function createTombstoneElement(tombstone) {
    const div = document.createElement("article");
    div.className = "tombstone";
    div.dataset.id = tombstone.id;
    div.setAttribute("role", "article");
    div.setAttribute("aria-label", `Tombstone for ${tombstone.title || "Unknown page"}`);

    if (selected.has(tombstone.id)) div.classList.add("selected");

    const timeAlive = formatTime(tombstone.timeAlive);
    const killMethod = formatKillMethod(tombstone.killMethod);
    const killedDate = new Date(tombstone.killedAt).toLocaleDateString();
    const selectionCheckbox = `<label class="tombstone-select" aria-label="Select this tombstone for bulk actions">
        <input type="checkbox" class="select-checkbox" ${selected.has(tombstone.id) ? "checked" : ""}>
        <span class="checkmark"></span>
    </label>`;

    const tabGroupBadge = tombstone.tabGroup
        ? `<span class="tab-group-badge" style="--group-color: ${getTabGroupColor(tombstone.tabGroup.color)}" title="Tab Group: ${escapeHtml(tombstone.tabGroup.title)}">${escapeHtml(tombstone.tabGroup.title)}</span>`
        : "";

    div.innerHTML = `
        ${selectionCheckbox}
        <div class="tombstone-header">
            <div class="tombstone-favicon" aria-hidden="true">
            ${tombstone.favicon ? `<img src="${escapeHtml(tombstone.favicon)}" alt="" class="favicon-img">` : ""}
            </div>
            <h3 class="tombstone-title" title="${escapeHtml(tombstone.title || "Untitled")}">
                ${escapeHtml(tombstone.title || "Untitled")}
            </h3>
            <div class="tombstone-domain" title="${escapeHtml(tombstone.domain || "Unknown")}">
                ${escapeHtml(tombstone.domain || "Unknown")}
            </div>
            ${tabGroupBadge}
        </div>

        <div class="tombstone-body">
            <backquote class="tombstone-epitaph">
            "${escapeHtml(tombstone.epitaph || "Rest in peace")}"
            </blockquote>
        </div>

        <div class="tombstone-footer">
            <div class="tombstone-time" aria-label="Time alive: ${timeAlive}">
                <span aria-hidden="true">⏱️</span> Lived ${timeAlive}
            </div>
            <div class="tombstone-method">
                ${killMethod}
            </div>
        </div>

        <div class="tombstone-actions">
            <button class="resurrect-btn" data-url="Resurrect ${escapeHtml(tombstone.title || "this tab")}">
                <span aria-hidden="true">🔁</span> Resurrect
            </button>
        </div>
    `;

    const checkbox = div.querySelector(".select-checkbox");
    const checkboxHandler = (e) => {
        e.stopPropagation();
        toggleTombstoneSelection(tombstone.id, div);
    };
    checkbox.addEventListener("change", checkboxHandler);

    const resurrectBtn = div.querySelector(".resurrect-btn");
    const clickHandler = () => resurrectTab(tombstone);
    resurrectBtn.addEventListener("click", clickHandler);

    cleanups.set(div, () => {
        resurrectBtn.removeEventListener("click", clickHandler);
        checkbox.removeEventListener("change", checkboxHandler);
    });

    if (tombstone.favicon) {
        const faviconImg = div.querySelector(".favicon-img");
        if (faviconImg) {
            faviconImg.addEventListener("error", function () {
                this.style.display = "none";
            });
        }
    }

    return div;
}

function isUnsafeUrl(url) {
    if (!url) return true;

    const unsafeProtocols = ["javascript:", "data:", "vbscript:", "file:"];

    const lowerUrl = url.toLowerCase().trim();
    return unsafeProtocols.some((protocol) => lowerUrl.startsWith(protocol));
}

async function incrementResurrectionCount(delta = 1) {
    try {
        const existing = await storage.getSetting("resurrections");
        const current = existing && typeof existing.count === "number" ? existing.count : 0;
        await storage.saveSettings("resurrections", { count: Math.max(0, current + delta) });
    } catch (e) {
        console.warn("Failed to update resurrection count:", e);
    }
}

async function resurrectTab(tombstone, skipUndo = false) {
    const resurrectBtn = document.querySelector(`[data-url="${escapeHtml(tombstone.url)}"]`);

    try {
        if (resurrectBtn) {
            resurrectBtn.disabled = true;
            resurrectBtn.textContent = "Resurrecting...";
        }

        if (!tombstone.url || tombstone.url === "Unknown URL" || tombstone.url === "about:blank") {
            throw new Error(`Cannot resurrect "${tombstone.title}" - URL not availabe`);
        }

        if (isUnsafeUrl(tombstone.url)) throw new Error("Cannot resurrect - URL uses an unsafe protocol");

        try {
            new URL(tombstone.url);
        } catch (urlError) {
            throw new Error(`Invalid URL: ${tombstone.url}`);
        }

        const tabPromise = browserAPI.tabs.create({ url: tombstone.url });
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Tab creation timeout")), 5000),
        );

        const createdTab = await Promise.race([tabPromise, timeoutPromise]);

        await incrementResurrectionCount(1);

        try {
            const achievementManager = new AchievementManager(window.cemeteryStorage);
            const stats = await statsCalc.getKillCounts();
            const newAchievements = await achievementManager.checkAchievements(stats);
            if (newAchievements.length > 0) {
                newAchievements.forEach((achievement) => {
                    showNotification(`Achievement Unlocked: ${achievement.name}`, "success");
                });
                const achievementModal = document.getElementById("achievements-modal");
                if (achievementModal.style.display === "flex") {
                    await loadAchievements();
                }
            }
        } catch (error) {
            console.error("Error checking achievements after resurrection:", error);
        }

        if (!skipUndo) {
            setUndoState(tombstone, createdTab && typeof createdTab.id === "number" ? createdTab.id : null);
        }

        showNotification(`Successfully resurrected: ${tombstone.title}`, "success", !skipUndo);
    } catch (error) {
        console.error("Error resurrecting tab:", error);
        showNotification(`Failed to resurrect tab: ${error.message}`, "error");
    } finally {
        if (resurrectBtn) {
            resurrectBtn.disabled = false;
            resurrectBtn.textContent = "Resurrect";
        }
    }
}

function setUndoState(tombstone, resurrectedTabId = null) {
    if (undoTimeout) clearTimeout(undoTimeout);

    lastTab = { ...tombstone, resurrectedTabId };
    undoTimeout = setTimeout(() => {
        lastTab = null;
        hideUndoNotification();
    }, 30000);
}

async function undoResurrection() {
    if (!lastTab) {
        showNotification("Nothing to undo", "warning");
        return;
    }

    try {
        let closed = false;

        if (typeof lastTab.resurrectedTabId === "number") {
            try {
                await browserAPI.tabs.remove(lastTab.resurrectedTabId);
                closed = true;
            } catch (e) {}
        }

        if (!closed) {
            const tabs = await browserAPI.tabs.query({ url: lastTab.url });
            if (tabs.length > 0) {
                const tabToClose = tabs[tabs.length - 1];
                await browserAPI.tabs.remove(tabToClose.id);
            }
        }

        showNotification(`Undo successful - ${lastTab.title} sent back to the cemetery`, "success", false);

        lastTab = null;
        if (undoTimeout) {
            clearTimeout(undoTimeout);
            undoTimeout = null;
        }
        hideUndoNotification();
    } catch (error) {
        console.error("Error undoing resurrection:", error);
        showNotification(`Failed to undo: ${error.message}`, error);
    }
}

function hideUndoNotification() {
    const undoNotification = document.querySelector(".undo-notification");
    if (undoNotification) {
        undoNotification.remove();
    }
}

function toggleTombstoneSelection(tombstoneId, element) {
    if (selected.has(tombstoneId)) {
        selected.delete(tombstoneId);
        element.classList.remove("selected");
    } else {
        selected.add(tombstoneId);
        element.classList.add("selected");
    }
    updateBulkActionsUI();
}

function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    document.body.classList.toggle("selection-mode", isSelectionMode);

    const toggleBtn = document.getElementById("toggle-selection");
    if (toggleBtn) {
        toggleBtn.textContent = isSelectionMode ? "Cancel Selection" : "Select";
        toggleBtn.classList.toggle("active", isSelectionMode);
    }

    if (!isSelectionMode) {
        clearSelection();
    }
    updateBulkActionsUI();
}

function clearSelection() {
    selected.clear();
    document.querySelectorAll(".tombstone.selected").forEach((el) => {
        el.classList.remove("selected");
        const checkbox = el.querySelector(".select-checkbox");
        if (checkbox) checkbox.checked = false;
    });
    updateBulkActionsUI();
}

function selectAll() {
    displayed.forEach((tombstone) => {
        selected.add(tombstone.id);
        const element = document.querySelector(`[data-id="${tombstone.id}]`);
        if (element) {
            element.classList.add("selected");
            const checkbox = element.querySelector(".select-checkbox");
            if (checkbox) checkbox.checked = true;
        }
    });
    updateBulkActionsUI();
}

function updateBulkActionsUI() {
    const selectionCount = document.getElementById("selection-count");
    const bulkActionsRight = document.querySelector(".bulk-actions-right");

    if (selectionCount) selectionCount.textContent = `${selected.size} selected`;

    if (bulkActionsRight) bulkActionsRight.style.display = selected.size > 0 || isSelectionMode ? "flex" : "none";
}

async function bulkResurrect() {
    if (selected.size === 0) {
        showNotification("No tombstones selected", "warning");
        return;
    }

    const count = selected.size;
    let successCount = 0;
    let failCount = 0;

    for (const tombstoneId of selected) {
        const tombstone = allTombstones.find((t) => t.id === tombstoneId);
        if (tombstone && tombstone.url && !isUnsafeUrl(tombstone.url)) {
            try {
                await browserAPI.tabs.create({ url: tombstone.url });
                successCount++;
                await new Promise((resolve) => setTimeout(resolve, 100));
            } catch (e) {
                failCount++;
            }
        } else {
            failCount++;
        }
    }
    if (successCount > 0) {
        await incrementResurrectionCount(successCount);

        try {
            const achievementManager = new AchievementManager(window.cemeteryStorage);
            const stats = await statsCalc.getKillCounts();
            const newAchievements = await achievementManager.checkAchievements(stats);
            if (newAchievements.length > 0) {
                newAchievements.forEach((achievement) => {
                    showNotification(`Achievement Unlocked: ${achievement.name}`, "success");
                });
                const achievementModal = document.getElementById("achievements-modal");
                if (achievementModal.style.display === "flex") {
                    await loadAchievements();
                }
            }
        } catch (error) {
            console.error("Error checking achievements after bulk resurrection:", error);
        }
    }

    clearSelection();
    showNotification(
        `Resurrected ${successCount} tabs${failCount > 0 ? `, ${failCount} failed` : ""}`,
        successCount > 0 ? "success" : "error",
    );
}

function showConfirmDialog(message, options = {}) {
    return new Promise((resolve) => {
        const { title = "Confirm Action", confirmText = "Confirm", cancelText = "Cancel", danger = false } = options;

        const dialogHTML = `
            <div class="modal-overlay" id="confirm-dialog">
                <div class="modal-content" style="max-width: 400px;">
                    <div calss="modal-header">
                        <h3>${escapeHtml(title)}</h3>
                    </div>
                    <div class="modal-body">
                        <p style="margin: 0; line-height: 1.6;">${escapeHtml(message)}</p>
                    </div>
                    <div class="modal-footer" style="display: flex; gap: var(--space-3); justify-content: flex-end; margin-top: var(--space-6);">
                        <button class="btn btn-secondary" id="dialog-cancel">${escapeHtml(cancelText)}</button>
                        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="dialog-confirm">${escapeHtml(confirmText)}</button>
                    </div>
                </div>
            </div>
        `;

        const existing = document.getElementById("confirm-dialog");
        if (existing) existing.remove();

        document.body.insertAdjacentHTML("beforeend", dialogHTML);
        document.body.style.overflow = "hidden";

        const dialog = document.getElementById("confirm-dialog");
        const confirmBtn = document.getElementById("dialog-confirm");
        const cancelBtn = document.getElementById("dialog-cancel");

        const cleanup = () => {
            dialog.remove();
            document.body.style.overflow = "";
        };

        confirmBtn.addEventListener("click", () => {
            cleanup();
            resolve(true);
        });

        cancelBtn.addEventListener("click", () => {
            cleanup();
            resolve(false);
        });

        const escHandler = (e) => {
            if (e.key === "Escape") {
                cleanup();
                document.removeEventListener("keydown", escHandler);
                resolve(false);
            }
        };
        document.addEventListener("keydown", escHandler);

        dialog.addEventListener("click", (e) => {
            if (e.target === dialog) {
                cleanup();
                resolve(false);
            }
        });

        setTimeout(() => confirmBtn.focus(), 100);
    });
}

let undoBuffer = [];
const MAX_UNDO_ITEMS = 10;

function addToUndoBuffer(type, data) {
    undoBuffer.unshift({ type, data, timestamp: Date.now() });
    if (undoBuffer.length > MAX_UNDO_ITEMS) undoBuffer.pop();
}

async function undoLastAction() {
    if (undoBuffer.length === 0) {
        showNotification("Nothing to undo", "info");
        return;
    }

    const action = undoBuffer.shift();

    try {
        if (action.type === "bulk-delete" || action.type === "delete") {
            const tombstones = Array.isArray(action.data) ? action.data : [action.data];
            for (const tombstone of tombstones) await storage.saveTombstone(tombstone);

            await loadTombstones();
            await loadStats();
            showNotification(`Restored ${tombstones.length} tombstone${tombstones.length > 1 ? "s" : ""}`, "success");
        }
    } catch (error) {
        console.error("Error undoing action:", error);
        showNotification("Failed to undo action", "error");
    }
}

async function bulkDelete() {
    if (selected.size === 0) {
        showNotification("No tombstones selected", "warning");
        return;
    }

    const count = selected.size;

    const confirmed = await showConfirmDialog(
        `Are you sure you want to permanently delete ${count} tombstone${count > 1 ? "s" : ""}`,
        {
            title: "Delete Tombstones",
            confirmText: "Delete",
            cancelText: "Cancel",
            danger: true,
        },
    );

    if (!confirmed) return;

    try {
        const deleteTombstones = allTombstones.filter((t) => selected.has(t.id));
        addToUndoBuffer("bulk-delete", deletedTombstones);

        for (const tombstoneId of selected) {
            await storage.deleteTombstone(tombstoneId);
        }

        allTombstones = allTombstones.filter((t) => !selected.has(t.id));
        filtered = filtered.filter((t) => !selected.has(t.id));

        clearSelection();
        renderTombstones(filtered, true);
        updateStats();
        showNotification(`Deleted ${count} tombstone${count > 1 ? "s" : ""}`, "success");
    } catch (error) {
        console.error("Error bulk deleting", error);
        showNotification(`Failed to delete tombstones: ${error.message}`, "error");
    }
}

async function loadAchievements() {
    try {
        const defaultsManager = new AchievementManager(storage);
        const defaultAchievements = defaultsManager.defineAchievements();

        const achievementsData = await storage.getSetting("achievements");
        const savedAchievements = achievementsData || {};

        const mergedAchievements = {};
        for (const [id, defaultAchievement] of Object.entries(defaultAchievements)) {
            mergedAchievements[id] = savedAchievements[id]
                ? { ...defaultAchievement, ...savedAchievements[id] }
                : defaultAchievement;
        }
        renderAchievements(mergedAchievements);
    } catch (error) {
        console.error("Error loading achievements".error);
    }
}

function renderAchievements(achievements) {
    const container = document.getElementById("achievements-grid");
    const totalScoreEl = document.getElementById("total-score");
    const unlockedCountEl = document.getElementById("unlocked-count");

    if (!container) {
        console.warn("achievements-grid container not fownd");
        return;
    }

    container.innerHTML = "";
    if (!achievements || Object.keys(achievements).length === 0) return;

    let unlockedCount = 0;
    let totalScore = 0;
    const rarityScores = { common: 10, uncommon: 25, rare: 50, legendary: 100 };
    for (const [id, achievement] of Object.entries(achievements)) {
        const card = document.createElement("div");
        card.className = `achievement-card ${achievement.unlocked ? "unlocked" : "locked"}`;
        if (achievement.unlocked) {
            unlockedCount++;
            totalScore += rarityScores[achievement.rarity] || 10;
        }

        card.innerHTML = `
            <div class="achievement-icon">${achievement.icon}</div>
            <div class="achievement-name">${escapeHtml(achievement.name)}</div>
            <div class="achievement-description">${escapeHtml(achievement.description)}</div>
            <div class="achievement-rarity rarity-${achievement.rarity}">${achievement.rarity}</div>
            ${achievement.unlocked ? `<div class="achievement-unlocked-date">Unlocked ${achievement.unlockedAt ? new Date(achievement.unlockedAt).toLocaleDateString() : "recently"} </div>` : ""}
        `;

        container.appendChild(card);
    }

    try {
        if (totalScoreEl) totalScoreEl.textContent = totalScore;
        if (unlockedCountEl) unlockedCountEl.textContent = `${unlockedCount}/${Object.keys(achievements).length}`;
    } catch (error) {
        console.error("Error updating achievement stats:", error);
    }
}

async function loadLeaderboards() {
    try {
        const [domainLeaderboard, timeLeaderboard, dayLeaderboard] = await Promise.all([
            statsCalc.getDomainLeaderboard(10),
            statsCalc.getKillsByTimeOfDay(),
            statsCalc.getKillsByDayOfWeek(),
        ]);
        renderLeaderboard("leaderboard-domains", domainLeaderboard, (item) => item.domain);
        renderLeaderboard("leaderboard-time", timeLeaderboard.slice(0, 10), (item) => item.hour);
        renderLeaderboard("leaderboard-day", dayLeaderboard.slice(0, 7), (item) => item.day);
    } catch (error) {
        console.error("Error loading leaderboards:", error);
    }
}

function renderLeaderboard(elementId, items, nameGetter) {
    const container = document.getElementById(elementId);
    container.innerHTML = "";

    if (items.length === 0) {
        container.innerHTML = '<p style="text-align: center; opacity: 0.5;">No data yet</p>';
        return;
    }

    items.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "leaderboard-item";

        div.innerHTML = `
            <span class="leaderboard-rank">#${index + 1}</span>
            <span class="leaderboard-name">${escapeHtml(nameGetter(item))}</span>
            <span class="leaderboard-value">${item.count}</span>
        `;

        container.appendChild(div);
    });
}

function setupEventListeners() {
    const searchInput = document.getElementById("search-inout");
    searchInput.addEventListener("input", debounce(onSerach, 150));

    setupSeacrchClear(searchInput);

    const filterMethod = document.getElementById("filter-method");
    filterMethod.addEventListener("change", applyFilters);

    const sortSelect = document.getElementById("sort-select");
    sortSelect.addEventListener("change", applySorting);

    const settingsBtn = document.getElementById("settings-btn");
    settingsBtn.addEventListener("click", () => {
        browserAPI.runtime.openOptionsPage();
    });

    const exportBtn = document.getElementById("export-btn");
    if (exportBtn) exportBtn.addEventListener("click", exportCemetery);

    const importBtn = document.getElementById("inport-btn");
    if (importBtn) {
        importBtn.addEventListener("click", () => {
            document.getElementById("import-file").click();
        });
    }

    const importFile = document.getElementById("import-file");
    if (importFile) importFile.addEventListener("change", importCemetery);

    setupBulkActionsListeners();
}

function setupBulkActionsListeners() {
    const toggleSelectionBtn = document.getElementById("toggle-selection");
    if (toggleSelectionBtn) toggleSelectionBtn.addEventListener("click", toggleSelectionMode);

    const selectAllBtn = document.getElementById("select-all");
    if (selectAllBtn) selectAllBtn.addEventListener("click", selectAll);

    const clearSelectionBtn = document.getElementById("clear-selection");
    if (clearSelectionBtn) clearSelectionBtn.addEventListener("click", clearSelection);

    const bulkResurrectBtn = document.getElementById("bulk-resurrect");
    if (bulkResurrectBtn) bulkResurrectBtn.addEventListener("click", bulkResurrect);

    const bulkDeleteBtn = document.getElementById("bulk-delete");
    if (bulkDeleteBtn) bulkDeleteBtn.addEventListener("click", bulkDelete);

    updateBulkActionsVisibility();
}

function updateBulkActionsVisibility() {
    const bulkActions = document.getElementById("bulk-actions");
    if (bulkActions) {
        bulkActions.style.display = "flex";

        const bulkActionsRight = bulkActions.querySelector(".bulk-actions-right");
        if (bulkActionsRight) bulkActionsRight.style.display = selected.size > 0 || isSelectionMode ? "flex" : "none";
    }
}

function setupSeacrchClear(searchInput) {
    const wrapper = searchInput.parentElement;

    const clearBtn = document.createElement("button");
    clearBtn.className = "search-clear-btn";
    clearBtn.innerHTML = "x";
    clearBtn.setAttribute("aria-label", "Clear search");
    clearBtn.style.display = "none";

    clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        searchInput.dispatchEvent(new Event("input"));
        clearBtn.style.display = "none";
        searchInput.focus();
    });

    searchInput.addEventListener("input", () => {
        clearBtn.style.display = searchInput.value ? "block" : "none";
    });

    wrapper.style.position = "relative";
    wrapper.appendChild(clearBtn);
}

function onSerach(event) {
    const query = event.target.value.toLowerCase().trim();
    const searchInput = event.target;

    currentPage = 1;
    searchInput.classList.add("searching");

    if (query === "") {
        filtered = [...allTombstones];
        updateSearchResults(allTombstones.length, 0);
    } else {
        const searchTerms = query.split(" ").filter((term) => term.length > 0);

        filtered = allTombstones.filter((t) => {
            const searchText = [t.title || "", t.domain || "", t.epitaph || "", t.url || "", t.killMethod || ""]
                .join(" ")
                .toLowerCase();
            return searchTerms.evry((term) => searchText.includes(term));
        });

        updateSearchResults(filtered.length, allTombstones.length - filtered.length);
    }

    setTimeout(() => {
        searchInput.classList.remove("searching");
    }, 200);

    applyFilters();
}

function updateSearchResults(found, hidden) {
    const existingIndicator = document.querySelector(".search-results");
    if (existingIndicator) existingIndicator.remove();

    if (hidden > 0) {
        const indicator = document.createElement("div");
        indicator.className = "search-results";
        indicator.innerHTML = `
            <span class="results-found">${found} found</span>
            <span class="results-hidden">${hidden} hidden</span>
        `;

        document.querySelector(".controls").appendChild(indicator);
    }
}

function applyFilters() {
    const killMethodFilter = document.getElementById("filter-method").value;
    const sortSelect = document.getElementById("sort-select");

    currentPage = 1;
    document.body.classList.add("filtering");
    requestAnimationFrame(() => {
        let results = filtered;
        if (killMethodFilter) results = results.filter((t) => t.killMethod === killMethodFilter);

        filtered = results;
        applySorting();

        setTimeout(() => {
            document.body.classList.remove("filtering");
        }, 100);
    });
}

function applySorting() {
    const sortValue = document.getElementById("sort-select").value;
    const [sortBy, sortOrder] = sortValue.split("-");

    filtered.sort((a, b) => {
        let aVal = a[sortBy];
        let bVal = b[sortBy];

        if (typeof aVal === "string") {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();

            if (sortOrder === "arc") {
                return aVal.localeCompare(bVal);
            } else return bVal.localeCompare(aVal);
        }

        if (sortOrder === "asc") {
            return aVal - bVal;
        } else return bVal - aVal;
    });

    renderTombstones();
}

async function loadThemeSettings() {
    try {
        const settings = await storage.getSettings();

        if (settings.theme?.colors) {
            const root = document.documentElement;

            if (settings.theme.colors.accent) {
                root.style.setProperty("--wc-accent", settings.theme.colors.accent);
                root.style.setProperty("--wc-accent-light", adjustColor(settings.theme.colors.accent, 20));
                root.style.setProperty("--wc-accent-lighter", adjustColor(settings.theme.colors.accent, 40));
                root.style.setProperty("--wc-accent-dark", adjustColor(settings.theme.colors.accent, -40));
            }
            if (settings.theme.colors.highlight) {
                root.style.setProperty("--wc-glow", settings.theme.colors.highlight);
                root.style.setProperty("--wc-glow-dim", `${hexToRGBA(settings.theme.colors.highlight, 0.2)}`);
            }
            if (settings.theme.colors.glow) {
                root.style.setProperty("--wc-text", settings.theme.colors.glow);
            }
        }
        document.body.classList.toggle("no-animations", !settings.theme.animationsEnabled);
    } catch (error) {
        console.error("Error loading theme settings", error);
    }
}

function initMobileEnhancements() {
    if ("ontouchstart" in window) {
        document.body.classList.add("touch-device");

        const interactiveElemets = ".tombstone, .achievement-card, .stat-box, .btn, .resurrect-btn";
        let touchTimeout = null;

        const handleTouchStart = (e) => {
            const target = e.target.closest(interactiveElemets);
            if (target) target.classList.add("touching");
        };

        const handleTouchEnd = (e) => {
            const target = e.target.closest(interactiveElemets);
            if (target) {
                if (touchTimeout) clearTimeout(touchTimeout);

                touchTimeout = setTimeout(() => {
                    target.classList.remove("touching");
                    touchTimeout = null;
                }, 150);
            }
        };

        document.addEventListener("touchstart", handleTouchStart, { passive: true });
        document.addEventListener("touchend", handleTouchStart, { passive: true });

        window.webCemeteryCleanup = window.webCemeteryCleanup || [];
        window.webCemeteryCleanup.push(() => {
            document.removeEventListener("touchstart", handleTouchStart);
            document.removeEventListener("touchend", handleTouchEnd);
            if (touchTimeout) clearTimeout(touchTimeout);
        });
    }

    let orientationTimeout = null;
    const handleOrientationChange = () => {
        if (orientationTimeout) {
            clearTimeout(orientationTimeout);
        }

        orientationTimeout = setTimeout(() => {
            window.dispatchEvent(new Event("resize"));

            window.scrollTo(0, 0);
            orientationTimeout = null;
        }, 100);
    };

    window.addEventListener("orientationchange", handleOrientationChange);
    if (!window.webCemeteryCleanup) window.webCemeteryCleanup = [];
    window.webCemeteryCleanup.push(() => {
        window.removeEventListener("orientationchange", handleOrientationChange);
        if (orientationTimeout) clearTimeout(orientationTimeout);
    });

    let scrollTicking = false;
    function updateScrollElements() {
        scrollTicking = false;
    }
    const handleScroll = () => {
        if (!scrollTicking) {
            requestAnimationFrame(updateScrollElements);
            scrollTicking = true;
        }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    window.webCemeteryCleanup.push(() => {
        window.removeEventListener("scroll", handleScroll);
    });

    const inputs = document.querySelectorAll("input, select");
    inputs.forEach((input) => {
        if (parseFloat(getComputedStyle(input).fontSize) < 16) input.style.fontSize = "16px";
    });

    if (window.innerWidth <= 768) {
        let pullStartY = 0;
        let pullCurrentY = 0;
        let pullThreshold = 80;

        const handleTouchStartPull = (e) => {
            if (window.scrollY === 0) pullStartY = e.touches[0].clientY;
        };

        const handleTouchMovePull = (e) => {
            if (window.scrollY === 0 && pullStartY) {
                pullCurrentY = e.touches[0].clientY;
                const pullDistance = pullCurrentY - pullStartY;

                if (pullDistance > 0 && pullDistance < pullThreshold) {
                    document.body.style.transform = `translateY(${pullDistance * 0.3}px)`;
                }
            }
        };

        const handleTouchEndPull = () => {
            document.body.style.transform = "";
            pullStartY = 0;
            pullCurrentY = 0;
        };

        document.addEventListener("touchstart", handleTouchStartPull, { passive: true });
        document.addEventListener("touchmove", handleTouchMovePull, { passive: true });
        document.addEventListener("touchend", handleTouchEndPull, { passive: true });

        window.webCemeteryCleanup.push(() => {
            document.removeEventListener("touchstart", handleTouchStartPull);
            document.removeEventListener("touchmove", handleTouchMovePull);
            document.removeEventListener("touchend", handleTouchEndPull);
            document.body.style.transform = "";
        });
    }
}

function formatTime(seconds) {
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
}

function formatKillMethod(method) {
    const labels = {
        manual: "Manula",
        "manual-close": "Closed",
        "keyboard-shortcut": "Shortcut",
        "auto-ghost": "Ghost",
        "auto-duplicate": "Duplicate",
        "auto-resource": "Resource",
    };
    return labels[method] || method;
}

function getTabGroupColor(colorName) {
    const colorts = {
        grey: "#5f6368",
        blue: "#1a73e8",
        red: "#d93025",
        yellow: "#f9ab08",
        green: "#1e8e3e",
        pink: "#d01884",
        purple: "#9334e6",
        cyan: "#007b83",
        orange: "#e8710a",
    };
    return colors[colorName] || colors.grey;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showNotificationWithUndo(message, type = "success") {
    const notification = document.createElement("div");
    notification.className = "toast toast-" + type;
    notification.innerHTML = `
        <span>${escapeHtml(message)}</span>
        <button class="btn btn-sm btn-secondary" id="undo-btn" style="margin-left: var(--space-4);">Undo</button>
    `;

    document.body.appendChild(notification);
    const undoBtn = notification.querySelector("#undo-btn");
    let undoClicked = false;

    undoBtn.addEventListener("click", async () => {
        undoClicked = true;
        notification.remove();
        await undoLastAction();
    });

    setTimeout(() => {
        if (!undoClicked) notification.remove();
    }, 5000);
}

function showNotification(message, type = "info", showUndo = false) {
    console.log(`${type.toUpperCase()} Notification:`, message);

    const notification = document.createElement("div");
    notification.className = showUndo ? "notification undo-notification" : "notification";

    const colors = {
        success: { bg: "rgba(45,90,45,0.95)", border: "#6b8e6b", color: "#b0c4b0" },
        error: { bg: "rgba(120,45,45,0.95)", border: "#8e6b6b", color: "#c4b0b0" },
        warning: { bg: "rgba(120,90,45,0.95)", border: "#8e8b6b", color: "#c4c0b0" },
        info: { bg: "rgba(45,90,45,0.95)", border: "#6b8e6b", color: "#b0c4b0" },
    };

    const color = colors[type] || colors.info;

    notification.style.sccText = `
        potistion: fixed;
        top: 20px;
        right: 20px;
        background: ${color.bg};
        color: ${color.color};
        padding: 16px 24px;
        border-radius: 8px;
        border: 1px solid ${color.border};
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
        max-width: 350px;
        word-wrap: break-word;
        display: flex;
        align-items: center;
        gap: 12px;
    `;

    const messageSpan = document.createElement("span");
    messageSpan.textContent = message;
    notification.appendChild(messageSpan);

    if (showUndo && lastTab) {
        const undoBtn = document.createElement("button");
        undoBtn.textContent = "Undo";
        undoBtn.style.cssText = `
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color:inherit;
            padding: 4px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: background 0.2s;
        `;
        undoBtn.addEventListener("mouseenter", () => {
            undoBtn.style.background = "rgba(255,255,255,0.3)";
        });
        undoBtn.addEventListener("mouseleave", () => {
            undoBtn.style.background = "rgba(255,255,255,0.2)";
        });
        undoBtn.addEventListener("click", () => {
            notification.remove();
            undoResurrection();
        });
        notification.appendChild(undoBtn);
    }
    document.body.appendChild(notification);

    const duration = showUndo ? 10000 : type === "error" ? 5000 : 3000;

    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = "slideOut 0.3s ease-out";
            setTimeout(() => {
                if (notification.parentNode) notification.remove();
            }, 300);
        }
    }, duration);
}

function showLoading(message = "Loading...") {
    if (isLoading) return;
    isLoading = true;

    const overlay = document.createElement("div");
    overlay.id = "loading-overlay";
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        color: white;
        font-family: 'Creepster', cursive;
    `;

    overlay.innerHTML = `
        <div class='loading-spinner" style="
        width: 50px;
        height: 50px;
        border: 3px solid rgba(255,255,255,0.3);
        border-top: 3px solid #fff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 20px;"></div>
        <div style="font-size: 18px;">${message}</div>
    `;

    document.body.appendChild(overlay);

    loadingTimeout = setTimeout(() => {
        hideLoading();
        showNotification("Loading took too long. Pls refresh the page.", "warning");
    }, 30000);
}

function hideLoading() {
    isLoading = false;
    if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
    }

    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.remove();
}

function showSectionLoading(sectionName) {
    const section =
        document.querySelector(`[data-section="${sectionName}"]`) ||
        document.getElementById(sectionName) ||
        document.querySelector(`.${sectionName}-section`);

    if (section) {
        const loader = document.createElement("div");
        loader.className = "section-loader";
        loader.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            opacity: 0.7;
        `;
        loader.innerHTML = `
            <div style="
                width: 20px;
                height: 20px;
                border: 2px solid rgba(255,255,255,0.3);
                border-top: 2px solid #fff;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-right: 10px;"></div>
            Loading ${sectionName}...
        `;

        section.appendChild(loader);
    }
}

function hideSectionLoading(sectionName) {
    const section =
        document.querySelector(`[data-section="${sectionName}"]`) ||
        document.getElementById(sectionName) ||
        document.querySelector(`.${sectionName}-section`);

    if (section) {
        const loader = section.querySelector(".section-loader");
        if (loader) {
            loader.remove();
        }
    }
}

function showSectionError(sectionName, message) {
    const section =
        document.querySelector(`[data-section="${sectionName}"]`) ||
        document.getElementById(sectionName) ||
        document.querySelector(`.${sectionName}-section`);

    if (section) {
        const error = document.createElement("div");
        error.className = "error-state";
        error.innerHTML = `
                <div class="error-state-icon">⚠️</div>
                <div class="error-state-message">${message}<div>
                <button id="retry-btn" class="btn btn-sm btn-secondary mt-4">Retry</button>
            `;
        section.appendChild(error);

        error.querySelector("#retry-btn").addEventListener("click", () => {
            location.reload();
        });
    }
}

function showErrorState(message) {
    hideLoading();

    const errorContainer = document.createElement("div");
    errorContainer.id = "error-state";
    errorContainer.className = "modal-overlay";
    errorContainer.style.zIndex = "10000";

    const content = document.createElement("div");
    content.className = "error-state text-center";
    content.style.cssText = `
        background: rgba(120,45,45,0.95);
        padding: var(--space-10);
        border-radius: var(--radius-lg);
        border: 2px solid var(--wc-danger);
        max-width: 400px;
    `;

    content.innerHTML = `
        <div class="error-state-icon">💀</div>
        <div class="error-state-title">Un oh!</div>
        <div class="error-state-message">${message}</div>
        <button id="resurrect-btn" class="btn btn-primary mt-6">Resurrect Page</button>
    `;

    errorContainer.appendChild(content);
    document.body.appendChild(errorContainer);

    errorContainer.querySelector("#resurrect-btn").addEventListener("click", () => {
        location.reload();
    });
}

const style = document.createElement("style");
style.textContent = `
    @keyframes slideIn {
        from {transform: translateX(400px); opacity: 0;}
        to {transform: translateX(0); opacity: 1;}
    }

    @keyframes slideOut {
        from{transform: translateX(0); opacity:1;}
        to{transform: translateX(400px); opacity: 0;}
    }

    @keyframes spin {
        0% {transform: rotate(0deg);}
        100% {transform: rotate(360deg);}
    }

    @keyframes fadeUp {
        from {opacity: 0; transform: translateY(20px);}
        to {opacity: 1; transform: translateY(0);}
    }

    .section-loader, .section-error {
        animation: fateInUp 0.3s ease-out;    
    }

    .search-clear-btn {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: #6b8e6b;
        font-size: 20px;
        cursor: pointer;
        padding: 4px 8px;
        line-height: 1;
        border-radius: 4px;
        transition: all 0.2s ease;
    }

    .search-clear-btn:hover {
        color: #8ab88a;
        background: rgba(107,142,107,0.2)
    }

    .load-more-container {
        display: flex;
        justify-content: center;
        padding: 20px;
        margin-top: 20px;
    }
    
    .load-more-btn {
        min-width: 200px;
    }
    #results-count {
        color: #8ab88a;
        font-size: 14px;
        padding: 10px;
        text-align: center;
    }
`;
document.head.appendChild(style);

function showAchievements() {
    const modal = document.getElementById("achievements-modal");
    if (modal) {
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
    }
}

function showLeaderboards() {
    const modal = document.getElementById("leaderboards-modal");
    if (modal) {
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
    }
}

function setupModalListeners() {
    try {
        const showAchievementsBtn = document.getElementById("show-achievements");
        if (showAchievementsBtn) showAchievementsBtn.addEventListener("click", showAchievements);

        const showLeaderboardsBtn = document.getElementById("show-leaderboards");
        if (showLeaderboardsBtn) showLeaderboardsBtn.addEventListener("click", showLeaderboards);

        const closeAchievements = document.getElementById("close-achievements");
        if (closeAchievements) {
            closeAchievements.addEventListener("click", () => {
                const modal = document.getElementById("achievements-modal");
                if (modal) modal.style.display = "none";
            });
        }

        const closeLeaderboards = document.getElementById("close-leaderboards");
        if (closeLeaderboards) {
            closeLeaderboards.addEventListener("click", () => {
                const modal = document.getElementById("leaderboards-modal");
                if (modal) modal.style.display = "none";
            });
        }

        document.addEventListener("click", (e) => {
            if (e.target.classList.contains("modal")) e.target.style.display = "none";
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                const achievementModal = document.getElementById("achievements-modal");
                const leaderboardModal = document.getElementById("leaderboards-modal");

                if (achievementModal && achievementModal.style.display === "flex") {
                    achievementModal.style.display = "none";
                    document.body.style.overflow = "";
                    event.preventDefault();
                } else if (leaderboardModal && leaderboardModal.style.display === "flex") {
                    leaderboardModal.style.display = "none";
                    document.body.style.overflow = "";
                    event.preventDefault();
                } else if (isSelectionMode) {
                    toggleSelectionMode();
                    event.preventDefault();
                }
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA") return;

            const key = event.key.toLowerCase();
            const ctrl = event.ctrlKey || event.metaKey;

            if (ctrl && key === "f") {
                const searchInput = document.getElementById("search-input");

                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                    event.preventDefault();
                }
            }

            if (ctrl && key === "a" && isSelectionMode) {
                selectAll();
                event.preventDefault();
            }

            if (!ctrl && !event.shiftKey && key === "s") {
                toggleSelectionMode();
                event.preventDefault();
            }

            if (key === "delete" && selected.size > 0) {
                bulkResurrect();
                event.preventDefault();
            }

            if (!ctrl && !event.shiftKey && key === "a" && !isSelectionMode) {
                showAchievements();
                event.preventDefault();
            }

            if (!ctrl && !event.shiftKey && key === "l") {
                showLeaderboards();
                event.preventDefault();
            }

            if (key === "?" || (event.shiftKey && key === "/")) {
                showKeyboardShortcutsHelp();
                event.preventDefault();
            }
        });
    } catch (error) {
        console.error("Error setting up modal listeners:", error);
    }
}

function showKeyboardShortcutsHelp() {
    const helpHTML = `
        <div class="modal-overlay" id="shortcuts-modal">
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>Keyboard Shortcuts</h2>
                    <button class="modal-close" id="shortcuts-close-btn" aria-label="Close shortcuts">x</button>
                </div>
                <div class="modal-body">
                    <div style="display: grid; grid-template-columns: auto 1fr; gap: var(--space-2) var(--space-4); align-items:center;">
                        <kbd>${navigation.platform.includes("Mac") ? "Cmd" : "Ctrl"}+F</kbd><span>Focus search</span>
                        <kbd>S</kbd><span>Toggle selection mode</span>
                        <kbd>${navigation.platform.includes("Mac") ? "Cmd" : "Ctrl"}+A</kbd><span>Select all (in selection mode)</span>
                        <kbd>Delete</kbd><span>Resurrect selected tabs</span>
                        <kbd>A</kbd><span>View Achievements</span>
                        <kbd>L</kbd><span>View Leaderboards</span>
                        <kbd>Esc</kbd><span>Close modals / Exit selection mode</span>
                        <kbd>?</kbd><span>Show this help</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    const existing = document.getElementById("shortcuts-modal");
    if (existing) existing.remove();

    document.body.insertAdjacentHTML("beforeend", helpHTML);
    document.body.style.overflow = "hidden";

    const modal = document.getElementById("shortcuts-modal");
    const closeBtn = document.getElementById("shortcuts-close-btn");

    const cleanup = () => {
        modal.remove();
        document.body.style.overflow = "";
    };

    closeBtn.addEventListener("click", cleanup);

    const escHandler = (e) => {
        if (e.key === "Escape") {
            cleanup();
            document.removeEventListener("keydown", escHandler);
        }
    };
    document.addEventListener("keydown", escHandler);

    modal.addEventListener("click", (e) => {
        if (e.target.id === "shortcuts-modal") cleanup();
    });
}

async function exportCemetery() {
    try {
        showLoading("Preparing export...");

        const tombstones = await storage.getAllTombstones();
        const settings = await storage.getSettings();
        const achievements = await storage.getSetting("achievements");

        const exportData = {
            version: "1.0.0",
            exportDate: new Date().toISOString(),
            tombstones: tombstones,
            settings: settings,
            achievements: achievements || {},
            metadata: {
                totalTombstones: tombstones.length,
                exportedBy: "WebCemetery",
            },
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `webcemetery-backup-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        hideLoading();
        showNotification(`Successfully exported ${tombstones.length} tombstones`, "success");
    } catch (error) {
        hideLoading();
        console.error("Error exporting cemetery:", error);
        showNotification("Failed to export cemetery: " + error.message, "error");
    }
}

async function importCemetery(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        showLoading("Import cemetery data...");

        const text = await file.text();
        const importData = JSON.parse(text);

        if (!importData.tombstones || !Array.isArray(importData.tombstones))
            throw new Error("Invalid import file: missing tombstones array");

        if (importData.version && importData.version !== "1.0.0")
            console.warn("Import file version mismatch, attempting import anyway");

        const existingCount = allTombstones.length;
        const importCount = importData.tombstones.length;

        let importMode = "merge";
        if (existingCount > 0) {
            const confirmed = await showConfirmDialog(
                `You have ${existingCount} existing tombstones. Import file contains ${importCount} tombstones. \n\nDo you wnat to MERGE (add new) or REPLACE (delete existing)?`,
                {
                    title: "Inport Mode",
                    confirmText: "Merge",
                    cancelText: "Replace",
                },
            );
            importMode = confirmed ? "merge" : "replace";
        }

        if (importMode === "replace") {
            for (const tombstone of allTombstones) {
                await storage.deleteTombstone(tombstone.id);
            }
        }

        let importedCount = 0;
        let skippedCount = 0;
        const existingIds = new Set(allTombstones.map((t) => t.id));

        for (const tombstone of importData.tombstones) {
            if (importMode === "merge" && existingIds.has(tombstone.id)) {
                skippedCount++;
                continue;
            }
            if (!tombstone.id || !tombstone.url) {
                skippedCount++;
                continue;
            }
            if (isUnsafeUrl(tombstone.url)) {
                skippedCount++;
                continue;
            }
            await storage.addTombstone(tombstone);
            importedCount++;
        }

        if (importData.settings) {
            for (const [key, value] of Object.entries(importData.settings)) await storage.saveSettings(key, value);
        }

        await loadTombstones();
        await loadStats();

        hideLoading();
        showNotification(
            `Imported ${importCount} tombstones` + (skippedCount > 0 ? ` (${skippedCount} skipped)` : ""),
            "success",
        );
        event.target.value = "";
    } catch (error) {
        hideLoading();
        console.error("Error importing cemetery:", error);
        showNotification("Failed to import: " + error.message, "error");
        event.target.value = "";
    }
}

// finally end, now cleanup ...
window.addEventListener("beforeunload", () => {
    if (window.webCemeteryCleanup) {
        window.webCemeteryCleanup.forEach((cleanup) => {
            try {
                cleanup();
            } catch (error) {
                console.error("Error during cleanup:", error);
            }
        });
    }
});
