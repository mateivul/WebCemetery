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
        await sotrag.saveSettings("resurrections", { count: Math.max(0, current + delta) });
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
