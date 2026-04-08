importScripts(
    "../lib/settings.js",
    "../lib/achievements.js",
    "../lib/epitaph-generator.js",
    "../lib/stats-calculator.js",
);

const browserAPI = typeof chrome !== "undefined" ? chrome : browserAPI;

let storage;
let achievementManager;
let isInitialized = false;
let initializationPromise = null;

let settingsCache = null;
let settingsCacheTime = 0;
const SETTINGS_CACHE_DURATION = 5 * 60 * 1000;

const initializationState = {
    storage: false,
    achievements: false,
    contextMenu: false,
    alarms: false,
};

async function performInitialization() {
    console.log("WebCemetery: Starting initialization...");

    try {
        await initStorage();
        initializationState.storage = true;
        await loadExistingTabs();

        achievementManager = new AchievementManager({
            getAllStats: () => getAllStatsFromDB(),
            getAllTombstones: () => getAllTombstonesFromDB(),
            getSetting: (key) => getSettingFromDB(key),
            saveSetting: (key, value) => saveSettingToDB(key, value),
        });

        await achievementManager.loadAchievements();
        initializationState.achievements = true;

        try {
            await browserAPI.contextMenu.removeAll();
            browserAPI.contextMenu.create({
                id: "kill-tab",
                title: "Kill Tab and Send to Cemetery",
                contexts: ["page"],
            });
            initializationState.contextMenu = true;
        } catch (error) {
            console.warn("Failed to creade context menu:", error);
        }

        try {
            await browserAPI.alarms.clearAll();
            browserAPI.alarms.create("ghost-detection", { periodInMinutes: 5 });
            browserAPI.alarms.create("auto-archive", { periodInMinutes: 1440 });
            initializationState.alarms = true;
        } catch (error) {
            console.warn("Failed to create alarms:", error);
        }

        const settings = await getSettings();
        console.log("WebCemetery: loaded settings:", settings);

        isInitialized = true;
        console.log("WebCemetery: Initialization complete");
        return true;
    } catch (error) {
        console.error("WebCemetery: Initialization failed:", error);
        isInitialized = false;
        initializationPromise = null;
        throw error;
    }
}

browserAPI.runtime.onInstalled.addListener(async (details) => {
    console.log("WebCemetery installed:", details.reason);

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await safeInitialize();
            break;
        } catch (error) {
            console.error(`WebCemetery: Initialization atempt ${attempt} failed:`, error);
            if (attempt === 3) {
                console.error("WebCemetery: All initialization attempts failed");
            } else {
                await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
            }
        }
    }
});

async function loadExistingTabs() {
    try {
        const existingTabs = await browserAPI.tabs.query({});
        const currentTime = Date.now();

        console.log(`WebCemetery: Loading ${existingTabs.length} existing tabs into tracking`);

        for (const tab of existingTabs) {
            const estimatedCreationTime = currentTime - 30 * 1000;

            tabCreationTimes.set(tab.id, estimatedCreationTime);
            tabInfo.set(tab.id, {
                url: tab.url || "about:blank",
                title: tab.title || "Loading...",
                favIconUrl: tab.favIconUrl || "",
            });
        }

        console.log("WebCemetery: Existing tabs loaded successfully");
    } catch (error) {
        console.warn("WebCemetery: Failed to load existing tabs:", error);
    }
}

browserAPI.runtime.onStartup.addListener(async () => {
    console.log("WebCemetery: Service worker starting up");
    await safeInitialize();
});

browserAPI.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "kill-tab") await killTab(tab, "manual");
});

browserAPI.commands.onCommand.addListener(async (command) => {
    console.log("WebCemetery: Command received:", command);

    try {
        await safeInitialize();

        if (command === "kill-current-tab") {
            const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.id) {
                if (tab.url?.startsWith("chrome-extension://") || tab.url?.startsWith("chrome://")) {
                    console.log("WebCemetery: cannot kill extension/browser pages");
                    return;
                }
                await killTab(tab, "keyboard-shortcut");
            }
        } else if (command === "open-cemetery") {
            const url = browserAPI.runtime.getURL("dashboard/dashboard.html");
            await browserAPI.tabs.create({ url });
        }
    } catch (error) {
        console.error("WebCemetery: error handling command:", error);
    }
});

browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        try {
            await safeInitialize();
            switch (request.action) {
                case "killTab":
                    try {
                        if (!request.tab) throw new Error("No tab specified for killing");
                        await killTab(request.tab, "manual", request.customEpitaph);
                        sendResponse({ success: true });
                    } catch (error) {
                        console.error("Failed to kill tab: ", error);
                        sendResponse({ success: false, error: error.message });
                    }
                    break;
                case "killCurrentTab":
                    try {
                        const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
                        if (tabs[0]) {
                            await killTab(tabs[0], "manual", request.customEpitaph);
                            sendResponse({ success: true });
                        } else {
                            sendResponse({ success: false, error: "No active tab found" });
                        }
                    } catch (error) {
                        console.error("Failed to kill current tab:", error);
                        sendResponse({ success: false, error: error.message });
                    }
                    break;

                case "resurrectTab":
                    try {
                        if (!request.url) throw new Error("No URL specified for resurrection");

                        try {
                            new URL(request.url);
                        } catch (urlError) {
                            throw new Error(`Invalid URL: ${request.url}`);
                        }
                        const newTab = await browserAPI.tabs.create({ url: request.url });
                        sendResponse({ success: true, tab: newTab });
                    } catch (error) {
                        console.error("Failed to resurrect tab:", error);
                        sendResponse({ success: false, error: error.message });
                    }
                    break;

                case "getStats":
                    try {
                        const stats = await calculateStats();
                        sendResponse({ success: true, stats });
                    } catch (error) {
                        console.error("Failed to get stats:", error);
                        sendResponse({ success: false, error: error.message });
                    }
                    break;

                case "getSettings":
                    try {
                        const settings = await getCachedSettings();
                        sendResponse({ success: true, settings });
                    } catch (error) {
                        console.error("Failed to get settings:", error);
                        sendResponse({ success: false, error: error.message });
                    }
                    break;

                case "getInitializationStatus":
                    sendResponse({
                        success: true,
                        initialized: isInitialized,
                        status: initializationState,
                    });
                    break;
                case "invalidateSettingsCache":
                    invalidateSettingsCache();
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ success: false, error: `Unknown action: ${request.action}` });
            }
        } catch (error) {
            console.error("Error handling message:", error);
            sendResponse({ success: false, error: error.message, details: error.stack });
        }
    })();

    return true;
});

browserAPI.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "ghost-detection") await detectAndKillGhostTabs();
    else if (alarm.name === "auto-archive") await autoArchiveOldTombstones();
});

const tabCreationTimes = new Map();
const tabInfo = new Map();
const manuallyKilledTabs = Map();
const inFlightKillTabs = Map();
const recentlyKilledTabs = Map();

const CONSTANTS = {
    SETTINGS_CACHE_DURATION: 5 * 60 * 1000,
    MANUAL_KILL_CLEANUP_TIMEOUT: 10000,
    GHOST_DETECTION_INTERVAL: 15,
    AUTO_ARCHIVE_INTERVAL: 1400,
    STORAGE_INIT_TIMEOUT: 10000,
};

function isUnsafeUrl(url) {
    if (!url) return true;

    const unsafeProtocols = ["javascript:", "data:", "vbscript:", "file:"];

    const lowerUrl = url.toLowerCase().trim();
    return unsafeProtocols.some((protocol) => lowerUrl.startsWith(protocol));
}

browserAPI.tabs.onCreated.addListener((tab) => {
    tabCreationTimes.set(tab.id, Date.now());
    tabInfo.set(tab.id, {
        url: tab.url || "about:blank",
        title: tab.title || "New Tab",
        favIconUrl: tab.favIconUrl || "",
    });
});

browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.title || changeInfo.favIconUrl) {
        const existing = tabInfo.get(tabId) || {};
        tabInfo.set(tabId, {
            url: changeInfo.url || tab.url || existing.url || "about:blank",
            title: changeInfo.title || tab.title || existing.title || "Loading...",
            favIconUrl: changeInfo.favIconUrl || tab.favIconUrl || existing.favIconUrl || "",
        });
    }
});

browserAPI.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    const createdAt = tabCreationTimes.get(tabId) || Date.now();
    const storedTabInfo = tabInfo.get(tabId);

    tabCreationTimes.delete(tabId);
    tabInfo.delete(tabId);

    if (!manuallyKilledTabs.has(tabId) && storedTabInfo) {
        try {
            const killedAt = Date.now();
            const timeAlive = Math.floor((killedAt - createdAt) / 1000);

            if (
                storedTabInfo.url.startsWith("chrome://") ||
                storedTabInfo.url.startsWith("chrome-extension://") ||
                storedTabInfo.url === "about:blank"
            )
                return;

            const domain = extractDomain(storedTabInfo.url);

            const tombstone = {
                if: generateUUID(),
                url: storedTabInfo.url,
                title: storedTabInfo.title || "Untitled Tab",
                favicon: storedTabInfo.favIconUrl,
                killedAt: killedAt,
                createdAt: createdAt,
                timeAlive: timeAlive,
                epitaph: await generateManualCloseEpitaph(storedTabInfo.title || "Unknown tab", timeAlive, domain),
                domain: domain,
                killMethod: "manual-close",
                customEpitaph: false,
            };

            await saveTombstone(tombstone);
            console.log("Manually cloed tab tracked:", tombstone);
        } catch (error) {
            console.error("Error tracking manually closed tab:", error);
        }
    } else {
        manuallyKilledTabs.delete(tabId);
    }
});
