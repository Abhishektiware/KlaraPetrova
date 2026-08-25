const Database = require("better-sqlite3");
const { PLANS } = require("./plans");

const db = new Database("klara.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    free_messages INTEGER DEFAULT 0,
    message_credits INTEGER DEFAULT 0,
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
  );`);

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

function activateUserPlan(userId, planId, paymentId) {
    const plan = PLANS[planId];
    if (!plan) {
        throw new Error(`Invalid planId: ${planId}`);
    }
    // Ensure payment not already used
    const existing = db.prepare(`SELECT * FROM payments WHERE payment_id = ?`).get(paymentId);
    if (existing && existing.status === 'paid' && existing.verified_at) {
        throw new Error(`Payment ${paymentId} already consumed`);
    }
    // Record payment verification
    db.prepare(`INSERT OR REPLACE INTO payments (payment_id, user_id, plan_id, amount, status, verified_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
        paymentId,
        userId,
        planId,
        plan.amount,
        'paid',
        Date.now()
    );
    // Atomic transaction to update user
    const txn = db.transaction(() => {
        if (plan.type === 'credits') {
            db.prepare(`UPDATE users SET plan = ?, message_credits = ?, payment_id = ? WHERE user_id = ?`).run(
                planId,
                plan.messages,
                paymentId,
                String(userId)
            );
        } else if (plan.type === 'time') {
            const expiresAt = Date.now() + plan.durationMs;
            db.prepare(`UPDATE users SET plan = ?, expires_at = ?, payment_id = ? WHERE user_id = ?`).run(
                planId,
                expiresAt,
                paymentId,
                String(userId)
            );
        }
    });
    txn();
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
    activateUserPlan,
    decrementCredits,
    hasActiveSubscription
};