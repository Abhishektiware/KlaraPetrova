const Database = require("better-sqlite3");

const db = new Database("klara.db");

db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    free_messages INTEGER DEFAULT 0,
    plan TEXT DEFAULT 'trial',
    expires_at INTEGER DEFAULT 0,
    payment_id TEXT DEFAULT NULL
  )
`).run();

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

function activatePlan(userId, plan, expiresAt, paymentId) {
    db.prepare(`
    UPDATE users
    SET plan = ?,
        expires_at = ?,
        payment_id = ?
    WHERE user_id = ?
  `).run(
        plan,
        expiresAt,
        paymentId,
        String(userId)
    );
}

function hasActiveSubscription(userId) {
    const user = getUser(userId);

    return (
        user.plan !== "trial" &&
        user.expires_at > Date.now()
    );
}

module.exports = {
    getUser,
    incrementMessages,
    activatePlan,
    hasActiveSubscription
};