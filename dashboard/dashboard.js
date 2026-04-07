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
