class EpitaphGenerator {
    constructor() {
        this.templates = {
            shortLived: [
                `"{{title}}" - Gone too soon ({{time}})`,
                `Bearly had time to load - RIP after {{time}}`,
                `{{domain}} - A brief {{time}} visit to the void`,
                `Killed in action after just {{time}}`,
            ],

            longLived: [
                `Here lies "{{title}}", forgotten for {{time}}`,
                `After {{time}} of neglect, finally put to rest`,
                `{{domain}} - Abandoned for {{time}}, now at peace`,
                `"{{title}}" - {{time}} of your life you'll never get back`,
            ],

            social: [
                `Another social media rabbit hole closed - {{time}} wasted`,
                `{{domain}} - Scrolled into oblivion`,
                `Here lies endless scrolling - Finally stopped after {{time}}`,
            ],

            video: [
                `{{domain}} - Forever buffering in our hearts`,
                `"{{title}}" - Watched for {{time}}, finished never`,
                `Rest in pixels - {{domain}}`,
            ],

            news: [
                `{{domain}} - The news can wait, apparently for {{time}}`,
                `"{{title}}" - Breaking news: This tab is dead`,
                `Old news after {{time}} - {{domain}}`,
            ],

            shopping: [
                `{{domain}} - Cart abandoned, tab killed`,
                `"{{title}}" - Window shopping ended after {{time}}`,
                `Here lies another impulse that died after {{time}}`,
            ],

            resource: [
                `"{{title}}" - killed for eating too much memory`,
                `{{domain}} - Preformance killer eliminated`,
                `Here lies a memory hog - Finally freed {{memory}}`,
            ],

            duplicate: [
                `"{{title}}" - Duplicate detected, duplicate eliminated`,
                `One of many - {{domain}} redundancy removed`,
                `Why have one when you can have none? - Duplicate killed`,
            ],

            generic: [
                `"{{title}}" - Another victim of too many  tabs`,
                `Here lies {{domain}}, never to be visited again`,
                `RIP "{{title}}" - You will not be missed`,
                `Gone but not remembered - {{domain}}`,
                `May this tab rest in peace`,
                `"{{title}}" - Closed with prejudice`,
                `{{domain}} - Opened with hope, closed with regret`,
                `Here lies a tab that nobody loved`,
                `"{{title}}" - Another casulty of procrastination`,
                `Rest in pixels - {{domain}}`,
                `{{title}} has left the building`,
                `In loving memory of a tab that was never read`,
                `"{{title}}" - Too meny tabs, too litle time`,
                `Here lies {{domain}} - Death by neglect`,
                `May your memory be freed - {{domain}}`,
            ],

            witty: [
                `"{{title}}" - Plot twist: Nobody cared`,
                `{{domain}} - Ctrl+W never felt so good`,
                `Here lies proof that you have a problem`,
                `"{{title}}" - Your therapist will hear about this`,
                `Another tab bites the dust`,
                `{{domain}} - Refresged in another world now`,
                `"{{title}}" - Not even worth bookmarking`,
                `Here lies tab #{{random}} of 847`,
                `{{domain}} - Killed before it could hurt you`,
                `"{{title}}" - The tab you meant to read "later"`,
            ],
        };

        this.domainCategories = {
            social: ["facebook.com", "instagram.com", "reddit.com", "linkedin.com", "tiktok.com", "x.com"],
            video: ["youtube.com", "vimeo.com", "twitch.tv", "netflix.com", "hulu.com"],
            news: ["nytimes.com", "bbc.com", "cnn.com", "thequardian.com", "reuters.com", "news.ycombinator.com"],
            shopping: ["amazon.com", "ebay.com", "etsy.com", "aliexpress.com", "walmart.com", "target.com", "lidl.com"],
        };
    }

    async generate(tab, options = {}) {
        const { timeAlive = 0, domain = "", killMethod = "manual", memory = null, customTemplates = null } = options;

        if (customTemplates && customTemplates.length > 0) {
            const template = customTemplates[Math.floor(Math.random() * customTemplates.length)];
            return this.fillTemplate(template, {
                title: tab.title || "Untitled",
                domain: domain || "unknown",
                time: this.formatTime(timeAlive),
                memory: memory ? this.formatMemory(memory) : "unknown",
                random: Math.floor(Math.random() * 1000),
            });
        }

        let category = this.determineCategory(timeAlive, domain, killMethod);

        const templates = this.templates[category];
        const template = templates[Math.floor(Math.random() * templates.length)];

        return this.fillTemplate(template, {
            title: tab.title || "Untitled",
            domain: domain || "unknown",
            time: this.formatTime(timeAlive),
            memory: memory ? this.formatMemory(memory) : "unknown",
            random: Math.floor(Math.random() * 1000),
        });
    }

    determineCategory(timeAlive, domain, killMethod) {
        if (killMethod === "auto-duplicate") {
            return "duplicate";
        }
        if (killMethod === "auto-resource") {
            return "resource";
        }
        if (timeAlive < 60) {
            return "shortLived";
        }
        if (timeAlive > 3600) {
            return "longLived";
        }

        for (const [category, domains] of Object.entries(this.domainCategories)) {
            if (domains.some((d) => domain.includes(d))) {
                return category;
            }
        }

        return Math.random() > 0.7 ? "witty" : "generic";
    }

    fillTemplate(template, values) {
        let result = template;
        for (const [key, value] of Object.entries(values)) {
            result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
        }
        return result;
    }

    formatTime(seconds) {
        if (seconds < 1) return "a moment";
        if (seconds < 60) return `${Math.floor(seconds)} second${seconds !== 1 ? "s" : ""}`;
        if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
        }
        if (seconds < 86400) {
            const hours = Math.floor(seconds / 3600);
            return `${hours} hour${hours !== 1 ? "s" : ""}`;
        }
        const days = Math.floor(seconds / 86400);
        return `${days} day${days !== 1 ? "s" : ""}`;
    }

    formatMemory(bytes) {
        const mb = bytes / (1024 * 1024);
        if (mb < 1024) {
            return `${Math.floor(mb)}MB`;
        }
        const gb = mb / 1024;
        return `${gb.toFixed(1)}GB`;
    }

    getRandomEpitaph() {
        const allTemplates = Object.values(this.templates).flat();
        return allTemplates[Math.floor(Math.random() * allTemplates.length)];
    }

    getCategories() {
        return Object.keys(this.templates);
    }
}

const epitaphGenerator = new EpitaphGenerator();
