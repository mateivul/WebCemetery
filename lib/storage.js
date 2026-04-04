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

    // async getAllTombstones(){
    //     if()
    // }
}
