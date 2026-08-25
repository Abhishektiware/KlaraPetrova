require("dotenv").config();

const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const OpenAI = require("openai");

// Import the personality
const { SYSTEM_PROMPT } = require("./character");

// ===============================
// TELEGRAM
// ===============================

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionString = process.env.TELEGRAM_SESSION;

const client = new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    {
        connectionRetries: 5,
    }
);

// ===============================
// BLUESMINDS
// ===============================

const ai = new OpenAI({
    apiKey: process.env.BLUESMINDS_API_KEY,
    baseURL: "https://api.bluesminds.com/v1",
});

const MODEL = "openai/gpt-oss-20b";

// ===============================
// MEMORY
// ===============================

const conversations = new Map();

// ===============================
// AI FUNCTION
// ===============================

async function generateReply(userId, userMessage) {

    if (!conversations.has(userId)) {
        conversations.set(userId, []);
    }

    const history = conversations.get(userId);

    history.push({
        role: "user",
        content: userMessage,
    });

    // Keep latest 30 messages for better context memory
    const recentHistory = history.slice(-30);

    const response = await ai.chat.completions.create({
        model: MODEL,
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...recentHistory,
        ],
        temperature: 0.9,
        max_tokens: 120,        // REDUCED - forces short responses
        presence_penalty: 0.2,
        frequency_penalty: 0.1,
    });
    const reply =
        response.choices?.[0]?.message?.content?.trim();

    if (!reply) {
        return "Hmm... 😅";
    }

    history.push({
        role: "assistant",
        content: reply,
    });

    return reply;
}

// ===============================
// MAIN
// ===============================

async function main() {

    console.log("Connecting Klara...");

    await client.connect();

    if (!(await client.checkAuthorization())) {

        console.error(
            "Klara Telegram session is not authorized."
        );

        process.exit(1);
    }

    const me = await client.getMe();

    console.log("");
    console.log("================================");
    console.log("   KLARA AI IS ONLINE ✅");
    console.log("================================");

    console.log("Name:", me.firstName);
    console.log("Username:", me.username);

    console.log("--------------------------------");
    console.log("AI Model:", MODEL);
    console.log("--------------------------------");
    console.log("Waiting for messages...");
    console.log("--------------------------------");

    client.addEventHandler(

        async (event) => {

            try {

                const message = event.message;

                // Ignore empty messages
                if (!message.text) return;

                // Only private chats
                if (!event.isPrivate) return;

                // Don't respond to ourselves
                if (message.out) return;

                const sender = await message.getSender();

                const userId = sender.id.toString();

                console.log("");
                console.log("==============================");
                console.log("NEW MESSAGE");
                console.log("==============================");

                console.log(
                    "From:",
                    sender.username
                        ? `@${sender.username}`
                        : sender.firstName || userId
                );

                console.log(
                    "Message:",
                    message.text
                );

                console.log(
                    "Generating Klara response..."
                );

                const reply = await generateReply(
                    userId,
                    message.text
                );

                console.log(
                    "Klara:",
                    reply
                );

                await message.reply({
                    message: reply,
                });

                console.log("Reply sent ✅");

            } catch (error) {

                console.error(
                    "Message handling error:",
                    error
                );
            }
        },

        new NewMessage({})
    );

    console.log(
        "Klara is listening for messages..."
    );
}

main().catch((error) => {

    console.error(
        "Fatal error:",
        error
    );

});