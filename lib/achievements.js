class AchievementManager {
    constructor(store) {
        this.storage = store;
        this.achievements = this.defineAchievements();

        this._tombstonesCache = null;
        this._tombstonesCachTime = 0;
        this._cacheValidtyMs = 30000;
    }

    async getCachedTombstones() {
        const now = Date.now();
        if (this._tombstonesCache && now - this._tombstonesCachTime < this._cacheValidtyMs)
            return this._tombstonesCache;

        try {
            this._tombstonesCache = await this.storage.getAllTombstones();
            this._tombstonesCachTime = now;
            return this._tombstonesCache;
        } catch (error) {
            console.error("Error fetching tombstones:", error);
            return this._tombstonesCache || [];
        }
    }

    invalidateCache() {
        this._tombstonesCache = null;
        this._tombstonesCachTime = 0;
    }

    defineAchievements() {
        return {
            // nr tabs kills
            firstKill: {
                id: "firstKill",
                name: "First Burial",
                description: "Kill your first tab",
                icon: "⚰️",
                rarity: "common",
                requirement: { type: "totalKills", value: 1 },
                unlocked: false,
            },

            serialKiller: {
                id: "serialKiller",
                name: "Serial Killer",
                description: "Kill 10 tabs",
                icon: "🔪",
                rarity: "common",
                requirement: { type: "totalKills", value: 10 },
                unlocked: false,
            },

            massDestroyer: {
                id: "massDestroyer",
                name: "Mass Destroyer",
                description: "Kill 50 tabs",
                icon: "💀",
                rarity: "uncommon",
                requirement: { type: "totalKills", value: 50 },
                unlocked: false,
            },

            genocidal: {
                id: "genocidal",
                name: "Genocidal Maniac",
                description: "Kill 100 tabs",
                icon: "☠️",
                rarity: "rare",
                requirement: { type: "totalKills", value: 100 },
                unlocked: false,
            },

            tabApocalypse: {
                id: "tabApocalypse",
                name: "Tab Apocalypse",
                description: "Kill 500 tabs",
                icon: "🌋",
                rarity: "legendary",
                requirement: { type: "totalKills", value: 500 },
                unlocked: false,
            },

            // streaks
            onFire: {
                id: "onFire",
                name: "On Fire",
                description: "Kill tabs for 3 consecutive days",
                icon: "🔥",
                rarity: "uncommon",
                requirement: { type: "streak", value: 3 },
                unlocked: false,
            },

            unstoppable: {
                id: "unstoppable",
                name: "Unstoppable",
                description: "Kill tabs for 7 consecutive days",
                icon: "🗲",
                rarity: "rare",
                requirement: { type: "streak", value: 7 },
                unlocked: false,
            },

            legendary: {
                id: "legendary",
                name: "Legendary Executioner",
                description: "Kill tabs for 30 consecutive days",
                icon: "👑",
                rarity: "legendary",
                requirement: { type: "streak", value: 30 },
                unlocked: false,
            },

            // daly + speed + domain
            productive: {
                id: "productive",
                name: "Productive Day",
                description: "Kill 20 tabs in one day",
                icon: "💼",
                rarity: "uncommon",
                requirement: { type: "dailyKills", value: 20 },
                unlocked: false,
            },

            massacre: {
                id: "massacre",
                name: "Tab Massacre",
                description: "Kill 50 tabs in one day",
                icon: "🗡️",
                rarity: "rare",
                requirement: { type: "dailyKills", value: 50 },
                unlocked: false,
            },

            quickDraw: {
                id: "quickDraw",
                name: "Quick Draw",
                description: "Kill a tab within 5 seconds of opening",
                icon: "🗲",
                rarity: "uncommon",
                requirement: { type: "quickKills", value: 5 },
                unlocked: false,
            },

            lightning: {
                id: "lightning",
                name: "Lightning Fast",
                description: "Kill a tab within 1 seconds of opening",
                icon: "🌩️",
                rarity: "rare",
                requirement: { type: "quickKills", value: 1 },
                unlocked: false,
            },

            youtubeCleaner: {
                id: "youtubeCleaner",
                name: "YouTube Cleaner",
                description: "Kill 25 Youtube tabs",
                icon: "📺",
                rarity: "uncommon",
                requirement: { type: "domainKills", domain: "youtube.com", value: 25 },
                unlocked: false,
            },

            socialMediaDetox: {
                id: "socialMediaDetox",
                name: "Social Media Detox",
                description: "Kill 50 social media tabs",
                icon: "🚫",
                rarity: "rare",
                requirement: { type: "socialMediaKills", value: 50 },
                unlocked: false,
            },

            //special
            nightOwl: {
                id: "nightOwl",
                name: "Night Owl",
                description: "Kill tabs between midnight and 6 AM",
                icon: "🦉",
                rarity: "uncommon",
                requirement: { type: "timeRange", start: 0, end: 6, count: 10 },
                unlocked: false,
            },

            ghostBuster: {
                id: "ghostBuster",
                name: "Ghost Buster",
                description: "Let auto-kill handle 25 ghost tabs",
                icon: "👻",
                rarity: "rare",
                requirement: { type: "autoKills", value: 25 },
                unlocked: false,
            },

            resurrector: {
                id: "resurrector",
                name: "The Resurrector",
                description: "Ressurect 10 dead tabs",
                icon: "🧟",
                rarity: "uncommon",
                requirement: { type: "resurrection", value: 10 },
                unlocked: false,
            },

            pacifist: {
                id: "pacifist",
                name: "Pacifist",
                description: "Go 7 days without killing any tabs",
                icon: "🕊️",
                rarity: "legendary",
                requirement: { type: "noKillStreak", value: 7 },
                unlocked: false,
                secret: true,
            },

            collector: {
                id: "collector",
                name: "Cemetery Collector",
                description: "Have 1000+ tombstones in cemetery",
                icon: "🏛️",
                rarity: "legendary",
                requirement: { type: "totalTombstones", value: 1000 },
                unlocked: false,
                secret: true,
            },
        };
    }

    async checkAchievements(stats, tombstoneData) {
        const newUnlocks = [];

        for (const [id, achievement] of Object.entries(this.achievements)) {
            if (achievement.unlocked) continue;

            if (await this.meetsRequirement(achievement.requirement, stats, tombstoneData)) {
                achievement.unlocked = true;
                achievement.unlockedAt = Date.now();
                newUnlocks.push(achievement);
            }
        }

        if (newUnlocks.length > 0) {
            await this.saveAchievements();
        }
        return newUnlocks;
    }

    async meetsRequirement(requirement, stats, tombstoneData) {
        switch (requirement.type) {
            case "totalKills":
                return stats.total >= requirement.value;

            case "dailyKills":
                return stats.today >= requirement.value;

            case "streak":
                return (await this.getCurrentStreak()) >= requirement.value;

            case "quickKills":
                return tombstoneData.timeAlive <= requirement.value;

            case "domainKills":
                return (await this.getDomainKillCount(requirement.domain)) >= requirement.value;

            case "autoKills":
                return (await this.getAutoKillCount()) >= requirement.value;

            case "resurrections":
                return (await this.getResurrectionCount()) >= requirement.value;

            case "timeRange": {
                const hour = new Date().getHours();
                const isInRange = hour >= requirement.start && hour < requirement.end;
                if (isInRange) {
                    return (await this.getTimeRangeKills(requirement.start, requirement.end)) >= requirement.count;
                }
                return false;
            }
            default:
                return false;
        }
    }

    async getCurrentStreak() {
        const statsData = await this.storage.getAllStats();
        if (!statsData.length) return 0;

        let streak = 0;
        const today = new Date().toISOString().split("T")[0];
        const sortedDates = statsData.sort((a, b) => a.date.localeCompare(b.date));

        for (const stat of sortedDates) {
            const daysDiff = this.daysDifference(stat.date, today);
            if (daysDiff === streak && stat.count > 0) {
                streak++;
            } else {
                break;
            }
        }

        return streak;
    }

    daysDifference(date1, date2) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
    }

    async getDomainKillCount(domain) {
        const tombstones = await this.getCachedTombstones();
        return tombstones.filter((t) => t.domain === domain).length;
    }

    async getAutoKillCount() {
        const tombstones = await this.getCachedTombstones();
        return tombstones.filter((t) => t.killMethod && t.killMethod.startsWith("auto-")).length;
    }

    async getResurrectionCount() {
        try {
            const data = await this.storage.getSetting("resurrections");
            return data ? data.count : 0;
        } catch (error) {
            console.error("Error getting resurrection count:", error);
            return 0;
        }
    }

    async getTimeRangeKills(startHour, endHour) {
        const tombstones = await this.getCachedTombstones();
        return tombstones.filter((t) => {
            const hour = new Date(t.killedAt).getHours();
            return hour >= startHour && hour < endHour;
        }).length;
    }

    async saveAchievements() {
        await this.storage.saveSetting("achievements", this.achievements);
    }

    async loadAchievements() {
        const saved = await this.storage.getSetting("achievements");
        if (saved) {
            for (const [id, achievement] of Object.entries(this.achievements)) {
                if (saved[id]) {
                    this.achievements[id] = { ...achievement, ...saved[id] };
                }
            }
        }
    }

    async getProgress(achievementId, stats, currentData) {
        const achievement = this.achievements[achievementId];
        if (!achievement) return 0;

        let current = 0;
        const requirement = achievement.requirement;

        switch (requirement.type) {
            case "totalKills":
                current = stats.total;
                break;
            case "dailyKills":
                current = stats.today;
                break;
            case "streak":
                current = await this.getCurrentStreak();
                break;
        }

        return Math.min(current / requirement.value, 1);
    }

    getUnlockedAchievements() {
        return Object.values(this.achievements).filter((a) => a.unlocked);
    }

    getAchievementsByRarity(rarity) {
        return Object.values(this.achievements).filter((a) => a.rarity === rarity);
    }

    getTotalScore() {
        const rarityScores = { common: 10, uncommon: 25, rare: 50, legendary: 100 };
        return this.getUnlockedAchievements().reduce(
            (total, achievement) => total + rarityScores[achievement.rarity],
            0,
        );
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = AchievementManager;
}
