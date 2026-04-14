const browserAPI = typeof chrome !== "undefined" ? chrome : browser;
let killRequestInFlight = false;

document.addEventListener("DOMContentLoaded", async () => {
    await loadStats();
    await loadTheme();
    setupEventListeners();
});

async function loadTheme() {
    try {
        const response = await sendMessage({ action: "getSettings" });
        if (!response?.success) return;

        const theme = response.settings?.theme;

        const colors = theme?.colors;
        if (colors) {
            const root = document.documentElement;
            if (colors.accent) root.style.setProperty("--accent", colors.accent);
            if (colors.highlight) root.style.setProperty("--highlight", colors.highlight);
            if (colors.glow) root.style.setProperty("--glow", colors.glow);
        }
        document.body.classList.toggle("no-animations", theme?.animationsEnabled === false);
    } catch (error) {
        console.warn("Failed loading theme in popup:", error);
    }
}

async function loadStats() {
    try {
        document.body.classList.add("loading");

        const response = await sendMessage({ action: "getStats" });

        if (response.success) {
            const stats = response.stats;
            document.getElementById("stat-today").textContent = stats.today;
            document.getElementById("stat-week").textContent = stats.week;
            document.getElementById("stat-total").textContent = stats.total;
        } else {
            console.error("Failed to load stats:", response.error);
            document.getElementById("stat-today").textContent = "0";
            document.getElementById("stat-week").textContent = "0";
            document.getElementById("stat-total").textContent = "0";
        }
    } catch (error) {
        console.error("Error loading stats:", error);
        document.getElementById("stat-today").textContent = "0";
        document.getElementById("stat-week").textContent = "0";
        document.getElementById("stat-total").textContent = "0";
    } finally {
        document.body.classList.remove("loading");
    }
}

function setupEventListeners() {
    document.getElementById("kill-tab-btn").addEventListener("click", () => {
        const section = document.getElementById("last-words-section");
        section.removeAttribute("hidden");
        document.getElementById("kill-tab-btn").disabled = true;
        document.getElementById("last-words-input").focus();
    });

    document.getElementById("confirm-kill-btn").addEventListener("click", async () => {
        if (killRequestInFlight) return;

        const lastWords = document.getElementById("last-words-input").value.trim();
        const confirmBtn = document.getElementById("confirm-kill-btn");

        killRequestInFlight = true;
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Killing...";

        try {
            const response = await sendMessageWithRetry({
                action: "killCurrentTab",
                customEpitaph: lastWords || null,
            });

            if (response.success) {
                window.close();
            } else {
                console.error("Failed to kill tab:", response.error);
                showError("Failed to kill tab: " + response.error);
                resetKillUI();
            }
        } catch (error) {
            console.error("Error killing tab:", error);
            showError("Error: " + error.message);
            resetKillUI();
        } finally {
            killRequestInFlight = false;
        }
    });

    document.getElementById("cancel-kill-btn").addEventListener("click", resetKillUI);

    document.getElementById("last-words-input").addEventListener("input", () => {
        const len = document.getElementById("last-words-input").value.length;
        document.getElementById("last-words-counter").textContent = `${len} / 140`;
    });

    document.getElementById("view-cemetery-btn").addEventListener("click", () => {
        const url = browserAPI.runtime.getURL("dashboard/dashboard.html");
        browserAPI.tabs.create({ url: url });
        window.close();
    });

    document.getElementById("settings-link").addEventListener("click", (e) => {
        e.preventDefault();
        browserAPI.tabs.create({ url: browserAPI.runtime.getURL("options/options.html") });
        window.close();
    });
}

function resetKillUI() {
    const section = document.getElementById("last-words-section");
    section.setAttribute("hidden", "");
    document.getElementById("kill-tab-btn").disabled = false;
    document.getElementById("last-words-input").value = "";
    document.getElementById("last-words-counter").textContent = "0 / 140";
    const confirmBtn = document.getElementById("confirm-kill-btn");
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Confirm Kill";
}

function sendMessage(message) {
    return new Promise((resolve, reject) => {
        browserAPI.runtime.sendMessage(message, (response) => {
            if (browserAPI.runtime.lastError) {
                reject(new Error(browserAPI.runtime.lastError.message));
                return;
            }

            if (!response) {
                reject(new Error("no response from background script"));
                return;
            }

            resolve(response);
        });
    });
}

async function sendMessageWithRetry(message) {
    try {
        return await sendMessage(message);
    } catch (error) {
        const msg = error?.message || "";
        const retryable =
            msg.toLowerCase().includes("receiving end does not exist") ||
            msg.includes("Could not establish connection") ||
            msg.includes("The message port closed");

        if (!retryable) {
            throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
        return sendMessage(message);
    }
}

function showError(message) {
    const errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    errorDiv.textContent = message;
    errorDiv.setAttribute("role", "alert");

    document.body.appendChild(errorDiv);

    setTimeout(() => {
        errorDiv.remove();
    }, 3000);
}
