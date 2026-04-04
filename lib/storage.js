//indexedDB wrapper
const DB_NAME = "WebCemeteryDB";
const DB_VERSION = 1;

class CemeteryStorage {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains("tombstones")) {
                    const tombstoneStore = db.createObject("tombstone", { keyPath: "id" });
                    tombstoneStore.createIndex("killedAt", "killedAt", { unique: false });
                    tombstoneStore.createIndex("domain", "domain", { unique: false });
                    tombstoneStore.createIndex("killMethod", "killMethod", { unique: false });
                }

                if (!db.objectStoreNames.contains("settings")) {
                    db.createObject("settings", { keyPath: "key" });
                }

                if (!db.objectStoreNames.contains("stats")) {
                    const statsStore = db.createObject("stats", { keyPath: "date" });
                    statsStore.createIndex("date", "date", { unique: true });
                }
            };
        });
    }

    async addTombstone(tombstone) {
        if (!this.db) {
            throw new Error("Database not initialized");
        }

        return new Promise((resolve, reject) => {
            try {
                if (!tombstone.id) {
                    tombstone.id = this.generateUUID();
                }

                if (!tombstone.url) {
                    reject(new Error("Tombstone must have URL"));
                    return;
                }

                const tx = this.db.transaction(["tombstones", "stats"], "readwrite");
                const tombstoneStore = tx.objectStore("tombstones");
                const statsStore = tx.objectStore("stats");

                const addRequest = tombstoneStore.add(tombstone);

                addRequest.onerror = (event) => {
                    console.error("Error adding tombstone:", addRequest.error);
                    reject(addRequest.error);
                };

                const date = this.getDateString(tombstone.killedAt || Date.now());
                const getStatsRequest = statsStore.get(date);

                getStatsRequest.onsuccess = () => {
                    const existing = getStatsRequest.result;
                    const count = existing ? existing.count + 1 : 1;

                    const statsReq = statsStore.put({ date, count });
                    statsReq.onerror = (event) => {
                        console.error("Error updating stats:", statsReq.error);
                    };
                };

                getStatsRequest.onerror = (event) => {
                    console.error("error getting stats:", getStatsRequest.error);
                };

                tx.oncomplete = () => resolve(tombstone.id);
                tx.onerror = (event) => {
                    console.error("Transaction error:", tx.error);
                    reject(tx.error);
                };
            } catch (error) {
                console.error("Error in addTombstone:", error);
                reject(error);
            }
        });
    }

    async getAllTombstones() {
        if (!this.db) {
            console.error("Database not initialized");
            return [];
        }

        try {
            const tx = this.db.transaction("tombstones", "readonly");
            const store = tx.objectStore("tombstones");
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => {
                    console.error("Error getting tombstones: ", request.error);
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error("Transaction error in getAllTombstones: ", error);
            return [];
        }
    }

    async getTombstones(options = {}) {
        const { limit, offset = 0, sortBy = "killedAt", sortOrder = "desc" } = options;
        let tombstones = await this.getAllTombstones();

        tombstones.sort((a, b) => {
            const aVal = a[sortBy];
            const bVal = b[sortBy];
            return sortOrder === "desc" ? bVal - aVal : aVal - bVal;
        });

        if (limit) {
            tombstones = tombstones.slice(offset, offset + limit);
        }

        return tombstones;
    }

    async getTombstone(id) {
        const tx = this.db.transaction("tombstones", "readonly");
        const store = tx.objectStore("tombstones");
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteTombstone(id) {
        const tx = this.db.transaction("tombstones", "readwrite");
        const store = tx.objectStore("tombstones");
        return new Promise((resolve, reject) => {
            const request = sort.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async deleteOldTombstones(beforeDate) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("tombstones", "readwrite");
            const store = tx.objectStore("tombstones");
            const index = store.index("killedAt");

            // fast query
            const range = IDBKeyRange.upperBound(beforeDate, true);
            const request = index.openCursor(range);

            let deleted = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    deleted++;
                    cursor.delete();
                    cursor.continue();
                }
            };

            request.onerror = () => reject(request.error);
            tx.oncomplete = () => resolve(deleted);
            tx.onerror = () => reject(tx.error);
        });
    }

    async searchTombstones(query) {
        const tombstones = await this.getAllTombstones();
        const lowerQuery = query.toLowerCase();

        return tombstones.filter(
            (t) =>
                t.title?.toLowerCase().includes(lowerQuery) ||
                t.url?.toLowerCase().includes(lowerQuery) ||
                t.domain?.toLowerCase().includes(lowerQuery) ||
                t.epitaph?.toLowerCase().includes(lowerQuery),
        );
    }

    async getTombstoneByDomain(domain) {
        const tx = this.db.transaction("tombstones", "readonly");
        const store = tx.objectStore("tombstones");
        const index = store.index("domain");

        return new Promise((resolve, reject) => {
            const request = index.getAll(domain);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getSetting(key) {
        const tx = this.db.transaction("settings", "readonly");
        const store = tx.objectStore("settings");

        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result ? request.result.value : null);
            request.onerror = () => reject(request.error);
        });
    }

    async getSettings() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("settings", "readonly");
            const store = tx.objectStore("settings");
            const request = store.getAll();

            request.onsuccess = () => {
                try {
                    const settings = {};
                    request.result.forEach((item) => {
                        settings[item.key] = item.value;
                    });

                    resolve(this.mergeWithDefaultSettings(settings));
                } catch (error) {
                    reject(error);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    async saveSetting(key, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("settings", "readwrite");
            const store = tx.objectStore("settings");

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(new Error("Transaction aborted"));

            const request = store.put({ key, value });
            request.onerror = () => reject(request.error);
        });
    }

    getDefaultSettings() {
        return WC_SETTINGS.getDefaultSettings();
    }

    mergeWithDefaultSettings() {
        return WC_SETTINGS.mergeWithDefaultSettings(settings);
    }

    async incrementDailyStat(timestamp) {
        const date = this.getDateString(timestamp);
        const tx = this.db.transaction("stats", "readwrite");
        const store = tx.objectStore("stats");

        return new Promise((resolve, reject) => {
            const getRequest = store.get(date);

            getRequest.onsuccess = () => {
                const existing = getRequest.result;
                const count = existing ? existing.count + 1 : 1;

                const putRequest = store.put({ date, count });
                putRequest.onsuccess = () => resolve(count);
                putRequest.onerror = () => reject(putRequest.error);
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async getStats(startDate, endDate) {
        const tx = this.db.transaction("stats", "readonly");
        const store = tx.objectStore("stats");
        const index = store.index("date");

        const range = IDBKeyRange.bound(this.getDateString(startDate), this.getDateString(endDate));

        return new Promise((resolve, reject) => {
            const request = index.getAll(range);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllStats() {
        if (!this.db) {
            console.error("DB not initialized");
            return [];
        }

        const tx = this.db.transaction("stats", "readonly");
        const store = tx.objectStore("stats");

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async getTotalCount() {
        const tx = this.db.transaction("tombstones", "readonly");
        const store = tx.objectStore("tombstones");

        return new Promise((resolve, reject) => {
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // UUID generate
    generateUUID() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    getDateString(timestamp) {
        const date = new Date(timestamp);
        return date.toISOString().split("T")[0];
    }

    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (e) {
            return url;
        }
    }
}

const storage = new CemeteryStorage();
