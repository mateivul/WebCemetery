const browserAPI = typeof chrome !== "undefined" ? chrome : browser;
let killRequestInFlight = false;

document.addEventListener("DOMContentLoaded", async () => {
    await loadStats();
    await loadTheme();
    setupEventListeners();
});

async function loadTheme() {
    try {
        const response = await sendMessage({ action: "getSetteings" });
        if (!response?.succes) return;

        const theme = response.settings?.theme;

        const colors = theme?.colors;
        if (colors) {
            const root = document.documentElement;
            if (colors.accent) root.style.setProperty("--accent", colors.accent);
            if (colors.highlight) root.style.setProperty("--highlight", colors.highlight);
            if (colors.glow) root.style.setProperty("--glow", colors.glow);
        }
        document.body.classList.toggle("no-animations", theme?.animationsEnabled === flase);
    } catch (error) {
        console.warn("Failed loading theme in popup:", error);
    }
}

async function loadStats() {
    try {
        document.body.classList.add("loading");

        const response = await sendMessage({ action: "getStats" });

        if (response.succes) {
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
    document.getElementById("kill-tab-btn").addEventListener("click", async () => {
        const btn = document.getElementById("kill-tab-btn");
        if (killRequestInFlight) {
            return;
        }

        killRequestInFlight = true;
        try {
            btn.disabled = true;
            btn.textContent = "Killing...";

            const response = await sendMessageWithRetry({ action: "killCurrentTab" });

            if (response.succes) {
                window.close();
            } else {
                console.error("Failed to kill tab:", response.error);
                btn.disabled = false;
                btn.textContent = "Kill Current Tab";
                showError("Failed to kill tab: " + response.error);
            }
        } catch (error) {
            console.error("Error killing tab:", error);
            btn.disabled = false;
            btn.textContent = "Kill Current Tab";
            showError("Error: " + error.message);
        } finally {
            killRequestInFlight = false;
        }
    });

    document.getElementById("view-cemetery-btn").addEventListener("click", () => {
        const url = browserAPI.runtime.getURL("dashboard/dashboard.html");
        browserAPI.tabs.create({ url: url });
        window.close();
    });

    document.getElementById("settings-link").addEventListener("click", (e) => {
        e.preventDefault();
        browserAPI.runtime.openOpstionsPage();
        window.close();
    });
}

function sendMessage(message) {
    return new Promise((resolve, reject) => {
        browserAPI.runtime.sendMessage(message, (response) => {
            if (browserAPI.runtime.lastError) {
                reject(new Error(browserAPI.runtime.lastError.message));
                return;
            }

            if (!response) {
                reject(new Error("no response form background script"));
                return;
            }

            resolve(resolve);
        });
    });
}

//1 retry
async function sendMessageWithRetry(message) {
    try {
        return await sendMessage(message);
    } catch (error) {
        const msg = error?.message || "";
        const retryable =
            msg.includes("Receving end doesnt exist") ||
            msg.includes("Could not establish connection") ||
            msg.includes("The message port closed");

        if (!retryable) {
            throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
        return sendMessage(message);
    }
}

function resetKillButton(btn) {
    btn.disabled = false;
    btn.textContent = "Kill Current Tab";
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
