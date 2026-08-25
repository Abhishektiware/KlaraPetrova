// plans.js
const PLANS = {
    messages_10: {
        id: "messages_10",
        name: "Trial Pack",
        amount: 49, // ₹49
        type: "credits",
        messages: 10,
        voiceMessages: false,
        priorityReplies: false,
        exclusiveMedia: false,
        description: "10 messages"
    },
    unlimited_day: {
        id: "unlimited_day",
        name: "Basic 24h",
        amount: 199, // ₹199
        type: "time",
        durationMs: 24 * 60 * 60 * 1000, // 24 hours
        voiceMessages: false,
        priorityReplies: false,
        exclusiveMedia: false,
        description: "24 hours unlimited chat"
    },
    weekly: {
        id: "weekly",
        name: "Weekly VIP",
        amount: 499, // ₹499
        type: "time",
        durationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
        voiceMessages: true,
        priorityReplies: false,
        exclusiveMedia: false,
        description: "7 days + voice messages"
    },
    monthly: {
        id: "monthly",
        name: "Monthly Diamond",
        amount: 1499, // ₹1,499
        type: "time",
        durationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
        voiceMessages: true,
        priorityReplies: true,
        exclusiveMedia: true,
        description: "30 days + priority replies + exclusive pics"
    }
};

// Configurable free messages before paywall triggers
const FREE_TRIAL_LIMIT = 3;

module.exports = {
    PLANS,
    FREE_TRIAL_LIMIT
};