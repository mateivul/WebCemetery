const browserAPI = typeof chrome !== "undefined" ? chrome : browser;

let currentSettings = {};

function sendMessage(message) {
    return new Promise((resolve) => {
        browserAPI.runtime.sendMessage(message, (response) => {
            resolve(response || { success: false, error: "No response" });
        });
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await storage.init();
        await loadSettings();
        setupEventListeners();
    } catch (error) {
        console.error("Error initializing options:", error);
    }
});

async function loadSettings() {
    try {
        currentSettings = await storage.getSettings();

        //ghost detect + auto archive + theme w/ colors and epitaphs
        document.getElementById("ghost-enabled").checked = currentSettings.ghostDetection.enabled;
        document.getElementById("detect-inactive").checked = currentSettings.ghostDetection.inactiveMinutes > 0;
        document.getElementById("inactive-minutes").value = currentSettings.ghostDetection.inactiveMinutes;
        document.getElementById("detect-duplicates").checked = currentSettings.ghostDetection.detectDuplicates;
        document.getElementById("detect-resource").checked = currentSettings.ghostDetection.detectResourceHeavy;
        document.getElementById("memory-threshold").value = currentSettings.ghostDetection.memoryThresholdMB;

        document.getElementById("archive-enabled").checked = currentSettings.autoArchive.enabled;
        document.getElementById("archive-days").value = currentSettings.autoArchive.daysToKeep;

        document.getElementById("animations-enabled").checked = currentSettings.theme.animationsEnabled;

        if (currentSettings.theme.colors) {
            document.getElementById("accent-color").value = currentSettings.theme.colors.accent || "#6b8e6b";
            document.getElementById("highlight-color").value = currentSettings.theme.colors.highlight || "#7fdf7f";
            document.getElementById("glow-color").value = currentSettings.theme.colors.glow || "#9fff9f";
            applyThemeColorsToDocument(currentSettings.theme);
        }

        const customEpitaphsEnabled = currentSettings.customEpitaphs?.enabled || false;
        const customEpitaphsList = currentSettings.customEpitaphs?.templates || [];
        document.getElementById("custom-epitaphs-enabled").checked = customEpitaphsEnabled;
        document.getElementById("custom-epitaphs-list").value = customEpitaphsList.join("\n");

        updateFieldStates();
    } catch (error) {
        console.error("Error loading settings", error);
    }
}

async function saveSettings() {
    try {
        const saveBtn = document.getElementById("save-btn");
        const statusEl = document.getElementById("save-status");

        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";
        statusEl.textContent = "";

        const settings = {
            ghostDetection: {
                enabled: document.getElementById("ghost-enabled").checked,
                inactiveMinutes: Math.max(
                    1,
                    Math.min(1440, parseInt(document.getElementById("inactive-minutes").value, 10) || 30),
                ),
                detectDuplicates: document.getElementById("detect-duplicates").checked,
                detectResourceHeavy: document.getElementById("detect-resource").checked,
                memoryThresholdMB: Math.max(
                    100,
                    Math.min(8192, parseInt(document.getElementById("memory-threshold").value, 10) || 500),
                ),
            },
            autoArchive: {
                enabled: document.getElementById("archive-enabled").checked,
                daysToKeep: Math.max(
                    1,
                    Math.min(365, parseInt(document.getElementById("archive.days").value, 10) || 30),
                ),
            },
            theme: {
                animationsEnabled: document.getElementById("animations-enabled").checked,
                colors: {
                    accent: document.getElementById("accent-color").value,
                    highlight: document.getElementById("highlight-color").value,
                    glow: document.getElementById("glow-color").value,
                },
            },
            customEpitaphs: {
                enabled: document.getElementById("custom-epitaphs-enabled").checked,
                templates: document
                    .getElementById("custom-epitaphs-list")
                    .value.split("\n")
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0),
            },
        };

        const MAX_RETRIES = 3;
        let retryCount = 0;
        let saveSuccess = false;

        while (retryCount < MAX_RETRIES && !saveSuccess) {
            try {
                await storage.saveSetting("ghostDetection", settings.ghostDetection);
                await storage.saveSetting("autoArchive", settings.autoArchive);
                await storage.saveSetting("theme", settings.theme);
                await storage.saveSetting("customEpitaphs", settings.customEpitaphs);
                saveSuccess = true;
            } catch (error) {
                retryCount++;
                console.warn(`Settings save attempt ${retryCount} failed:`, error);
                if (retryCount >= MAX_RETRIES) throw error;
                await new Promise((resolve) => setTimeout(resolve, 100 * retryCount));
            }
        }

        try {
            const response = await sendMessage({ action: "invalidateSettingsCache" });
            if (!response.success) console.warn("Failed to invalidate settings cache", response.error);
        } catch (error) {
            console.warn("Error invalidating settings cache:", error);
        }

        currentSettings = settings;
        statusEl.textContent = "Settings saved successfully";
        statusEl.className = "save-status success";

        setTimeout(() => {
            statusEl.textContent = "Returning to dashboard...";
            setTimeout(() => {
                try {
                    window.close();
                } catch (e) {
                    window.location.href = "../dashboard/dashboard.html";
                }
            }, 800);
        }, 1500);
    } catch (error) {
        console.error("Error saving settings: ", error);
        const statusEl = document.getElementById("save-status");
        statusEl.textContent = "Failed to save settings";
        statusEl.className = "save-status error";
    } finally {
        const saveBtn = document.getElementById("save-btn");
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Settings";
    }
}

async function clearCemetery() {
    const confirmed = confirm(
        "Are you SURE you want to DELETE ALL tombstones?\n\n" +
            "This action CANNOT BE UNDONE and will PERMANENTLY remove all killed tabs from the cemetery",
    );

    if (!confirmed) return;

    const doubleConfirm = confirm("This is you LAST chace!\n\n" + "Click OK to PERMANENTLY delete everything.");
    if (!doubleConfirm) return;

    try {
        const tombstones = await storage.getAllTombstones();

        for (const tombstone of tombstones) {
            await storage.deleteTombstone(tombstone.id);
        }

        const statusEl = document.getElementById("save-status");
        statusEl.textContent = `Deleted ${tombstones.length} tombstones`;
        statusEl.className = "save-status success";

        setTimeout(() => {
            statusEl.textContent = "";
            statusEl.className = "save-status";
        }, 3000);
    } catch (error) {
        console.error("Error clearing cemetery:", error);
        alert("Failed to clear cemetery: " + error.message);
    }
}

function setupEventListeners() {
    document.getElementById("save-btn").addEventListener("click", saveSettings);

    document.getElementById("exit-settings-btn").addEventListener("click", async () => {
        const dashboardUrl = browserAPI.runtime.getURL("dashboard/dashboard.html");

        try {
            if (browserAPI.tabs?.query && browserAPI.tabs?.update) {
                const existing = await browserAPI.tabs.query({ url: [dashboardUrl] });

                if (existing?.length) {
                    const tab = existing[0];
                    if (tab.windowId != null && browserAPI.window?.update) {
                        await browserAPI.window.update(tab.windowId, { focused: true });
                    }
                    if (tab.id != null) {
                        await browserAPI.tabs.update(tab.id, { active: true });
                    }
                } else if (browserAPI.tabs?.create) {
                    await browserAPI.tabs.create({ url: dashboardUrl, active: true });
                }

                const currentTab = await browserAPI.tabs.getCurrent?.();
                if (currentTab?.id != null && browserAPI.tabs?.remove) {
                    await browserAPI.tabs.remove(currentTab.id);
                    return;
                }
            }
        } catch (error) {
            console.warn("Exit settings navigation fallback:", error);
        }

        window.location.href = dashboardUrl;
    });

    document.getElementById("clear-cemetery-btn").addEventListener("click", clearCemetery);

    document.getElementById("ghost-enabled").addEventListener("change", updateFieldStates);
    document.getElementById("detect-inactive").addEventListener("change", updateFieldStates);
    document.getElementById("detect-resource").addEventListener("change", updateFieldStates);
    document.getElementById("archive-enabled").addEventListener("change", updateFieldStates);
    document.getElementById("custom-epitaphs-enabled").addEventListener("change", updateFieldStates);

    document.querySelectorAll(".reset-color-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const targetId = e.target.dataset.target;
            const defaultValue = e.target.dataset.default;
            document.getElementById(targetId).value = defaultValue;
            applyThemeColorsToDocument(getThemeColorsFromImputs());
        });
    });

    ["accent-color", "highlight-color", "glow-color"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", () => {
                applyThemeColorsToDocument(getThemeColorsFromImputs());
            });
        }
    });
}

function getThemeColorsFromImputs() {
    return {
        accent: document.getElementById("accent-color")?.value,
        highlight: document.getElementById("highlight-color")?.value,
        glow: document.getElementById("glow-color")?.value,
    };
}
function applyThemeColorsToDocument(colors) {
    if (!colors) return;
    const root = document.documentElement;

    if (colors.accent) root.style.setProperty("--accent", colors.accent);
    if (colors.highlight) root.style.setProperty("--highlight", colors.highlight);
    if (colors.glow) root.style.setProperty("--glow", colors.glow);
}

function updateFieldStates() {
    const ghostEnabled = document.getElementById("ghost-enabled").checked;
    const inactiveEnabled = document.getElementById("detect-inactive").checked;
    const resourceEnabled = document.getElementById("detect-resource").checked;
    const archiveEnabled = document.getElementById("archive-enabled").checked;
    const customEpitaphsEnabled = document.getElementById("custom-epitaphs-enabled").checked;

    document.getElementById("detect-inactive").disabled = !ghostEnabled;
    document.getElementById("detect-duplicates").disabled = !ghostEnabled;
    document.getElementById("detect-resource").disabled = !ghostEnabled;
    document.getElementById("inactive-minutes").disabled = !ghostEnabled || !inactiveEnabled;
    document.getElementById("memory-threshold").disabled = !ghostEnabled || !resourceEnabled;
    document.getElementById("archive-days").disabled = !archiveEnabled;
    document.getElementById("custom-epitaphs-list").disabled = !customEpitaphsEnabled;
}
