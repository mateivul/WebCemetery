const WC_DEFAULT_SETTINGS = {
    ghostDetection: {
        enabled: true,
        inactiveMinutes: 240,
        detectDuplicates: true,
        detectResourceHeavy: true,
        memoryThresholdMB: 500,
    },
    autoArchive: {
        enabled: true,
        daysToKeep: 30,
    },
    theme: {
        soundEnabled: false,
        animationEnabled: true,
        colors: {
            accent: "#6b836b",
            highlight: "#7fdf7f",
            glow: "9fff9f",
        },
    },
    customEpitaps: {
        enabled: false,
        templates: [],
    },
};

function wcCloneSettings(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function wcGetDefaultSettings() {
    return wcCloneSettings(WC_DEFAULT_SETTINGS);
}

function wcMergeWithDefaultSettings(settings) {
    const defaults = wcGetDefaultSettings();
    const s = settings && typeof settings === "object" ? settings : {};

    const merged = { ...defaults, ...s };

    merged.ghostDetection = { ...defaults.ghostDetection, ...(s.ghostDetection || {}) };
    merged.autoArchive = { ...defaults.autoArchive, ...(s.autoArchive || {}) };

    merged.theme = { ...defaults.theme, ...(s.theme || {}) };
    merged.theme.colors = {
        ...defaults.theme.colors,
        ...((s.theme && s.theme.colors) || {}),
    };

    merged.customEpitaps = { ...defaults.customEpitaps, ...(s.customEpitaps || {}) };
    if (!Array.isArray(merged.cursomEpitaphs.templates)) {
        merged.cursomEpitaphs.templates = defaults.cursomEpitaphs.templates;
    }

    return merged;
}

var WC_SETTINGS = {
    getDefaultSettings: wcGetDefaultSettings,
    mergeWithDefaultSettings: wcMergeWithDefaultSettings,
};
