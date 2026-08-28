const Database = require("better-sqlite3");

const db = new Database("klara.db");

// Existing tables creation
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    free_messages INTEGER DEFAULT 0,
    plan TEXT DEFAULT 'trial',
    expires_at INTEGER DEFAULT 0,
    payment_id TEXT DEFAULT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    payment_id TEXT PRIMARY KEY,
    user_id TEXT,
    plan_id TEXT,
    amount INTEGER,
    status TEXT,
    verified_at INTEGER
  );
`);

// Safe migrations to add stats & credits columns to existing users table
const columnsToMigrate = [
  { name: 'message_credits', type: 'INTEGER DEFAULT 0' },
  { name: 'message_count', type: 'INTEGER DEFAULT 0' },
  { name: 'image_count', type: 'INTEGER DEFAULT 0' },
  { name: 'last_paid_image_at', type: 'INTEGER DEFAULT 0' }
];

for (const col of columnsToMigrate) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type};`);
  } catch (err) {
    // Ignore error if column already exists
  }
}

// Create paid_images and library tables
db.exec(`
  CREATE TABLE IF NOT EXISTS paid_images (
    paid_image_id TEXT PRIMARY KEY,
    user_id TEXT,
    image_id TEXT,
    telegram_message_id TEXT,
    price_stars INTEGER,
    status TEXT,
    sent_at INTEGER,
    purchased_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS paid_images_library (
    image_id TEXT PRIMARY KEY,
    category TEXT DEFAULT 'casual',
    usage_count INTEGER DEFAULT 0
  );
`);


function getUser(userId) {
    let user = db.prepare(
        "SELECT * FROM users WHERE user_id = ?"
    ).get(String(userId));

    if (!user) {
        db.prepare(`
      INSERT INTO users (user_id, free_messages, plan, expires_at)
      VALUES (?, 0, 'trial', 0)
    `).run(String(userId));

        user = db.prepare(
            "SELECT * FROM users WHERE user_id = ?"
        ).get(String(userId));
    }

    return user;
}

function incrementMessages(userId) {
    db.prepare(`
    UPDATE users
    SET free_messages = free_messages + 1
    WHERE user_id = ?
  `).run(String(userId));
}

function incrementUserMessageCount(userId) {
    db.prepare(`UPDATE users SET message_count = COALESCE(message_count, 0) + 1 WHERE user_id = ?`).run(String(userId));
}

function incrementUserImageCount(userId) {
    db.prepare(`UPDATE users SET image_count = COALESCE(image_count, 0) + 1 WHERE user_id = ?`).run(String(userId));
}

function updateLastPaidImageAt(userId, timestamp) {
    db.prepare(`UPDATE users SET last_paid_image_at = ? WHERE user_id = ?`).run(timestamp, String(userId));
}

function getUserStats(userId) {
    const stats = db.prepare(`SELECT message_count, image_count, last_paid_image_at FROM users WHERE user_id = ?`).get(String(userId));
    if (!stats) {
        return { message_count: 0, image_count: 0, last_paid_image_at: 0 };
    }
    return stats;
}

function recordPaidImageSent(paidImageId, userId, imageId, telegramMessageId, priceStars) {
    db.prepare(`
        INSERT INTO paid_images (paid_image_id, user_id, image_id, telegram_message_id, price_stars, status, sent_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(paidImageId, String(userId), imageId, String(telegramMessageId), priceStars, Date.now());
}

function markPaidImagePurchased(paidImageId, purchasedAt) {
    db.prepare(`
        UPDATE paid_images
        SET status = 'purchased', purchased_at = ?
        WHERE paid_image_id = ?
    `).run(purchasedAt, paidImageId);
}

function getUserPaidImages(userId) {
    return db.prepare(`SELECT image_id FROM paid_images WHERE user_id = ? AND status = 'purchased'`).all(String(userId)).map(r => r.image_id);
}

function getPaidImageLibrary() {
    return db.prepare(`SELECT * FROM paid_images_library`).all();
}

function addPaidImageToLibrary(imageId, category) {
    db.prepare(`
        INSERT OR IGNORE INTO paid_images_library (image_id, category, usage_count)
        VALUES (?, ?, 0)
    `).run(imageId, category);
}

function incrementPaidImageUsage(imageId) {
    db.prepare(`
        UPDATE paid_images_library
        SET usage_count = usage_count + 1
        WHERE image_id = ?
    `).run(imageId);
}

function hasActiveSubscription(userId) {
    const user = getUser(userId);
    return (
        user.plan !== "trial" &&
        user.expires_at > Date.now()
    );
}

function decrementCredits(userId) {
    db.prepare(`UPDATE users SET message_credits = message_credits - 1 WHERE user_id = ? AND message_credits > 0`).run(String(userId));
}

module.exports = {
    getUser,
    incrementMessages,
    decrementCredits,
    hasActiveSubscription,
    incrementUserMessageCount,
    incrementUserImageCount,
    updateLastPaidImageAt,
    getUserStats,
    recordPaidImageSent,
    markPaidImagePurchased,
    getUserPaidImages,
    getPaidImageLibrary,
    addPaidImageToLibrary,
    incrementPaidImageUsage,
    db
};