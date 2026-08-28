require("dotenv").config();

const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const OpenAI = require("openai");
const db = require("./database");

// Import the personality
const { SYSTEM_PROMPT } = require("./character");
const { downloadTelegramFile, deleteTempFile, validateImage } = require("./utils/fileUtils");
const { analyzeImage } = require("./services/visionService");
const { shouldSendPaidImage, sendPetrovaPaidImage, syncPaidImagesCatalog } = require("./services/paidImageService");


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
            {
                role: "system",
                content: SYSTEM_PROMPT,
            },

            ...recentHistory,
        ],

        temperature: 0.9,
        max_tokens: 350,
        presence_penalty: 0.3,
        frequency_penalty: 0.2,
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

    // Sync paid-images library catalog on startup
    syncPaidImagesCatalog();

    // Handler for paid media purchases
    client.addEventHandler(async (update) => {
        try {
            if (update instanceof Api.UpdateBotPurchasedPaidMedia) {
                const userId = update.userId.toString();
                const payload = update.payload;
                console.log(`[Purchase Event] User ${userId} purchased paid media with payload: ${payload}`);

                if (payload && payload.startsWith("paid_image:")) {
                    const parts = payload.split(":");
                    if (parts.length === 4) {
                        const paidImageId = parts[3];
                        db.markPaidImagePurchased(paidImageId, Date.now());
                        console.log(`[Purchase Event] Successfully recorded purchase for paidImageId: ${paidImageId}`);
                        
                        // Send thank-you text in personality
                        const thankYouText = "Aww thank you for unlocking my picture! 🙈 Hope u like it... let me know what u think! 😘";
                        await client.sendMessage(userId, { message: thankYouText });
                    }
                }
            }
        } catch (err) {
            console.error("Error in purchase update handler:", err);
        }
    });

    // Handler for incoming messages
    client.addEventHandler(

        async (event) => {
            let tempFilePath = null;
            try {

                const message = event.message;

                // Detect photo
                const hasPhoto = message.media && (message.media instanceof Api.MessageMediaPhoto || message.photo);

                // Ignore if neither text nor photo is present
                if (!message.text && !hasPhoto) return;

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
                    message.text || "[Photo]"
                );

                // Update database message and image counts
                db.incrementUserMessageCount(userId);
                if (hasPhoto) {
                    db.incrementUserImageCount(userId);
                }

                let recentImageAnalysis = null;
                if (hasPhoto) {
                    try {
                        console.log("Downloading user photo...");
                        const mediaBuffer = await client.downloadMedia(message.media);
                        if (mediaBuffer) {
                            const fs = require("fs");
                            const path = require("path");
                            const crypto = require("crypto");

                            const tmpDir = path.join(__dirname, "tmp_images");
                            if (!fs.existsSync(tmpDir)) {
                                fs.mkdirSync(tmpDir);
                            }
                            tempFilePath = path.join(tmpDir, `${crypto.randomUUID()}.jpg`);
                            fs.writeFileSync(tempFilePath, mediaBuffer);

                            // Validate image
                            validateImage(tempFilePath);

                            // Analyze image
                            console.log("Analyzing image via Vision AI...");
                            recentImageAnalysis = await analyzeImage(tempFilePath);
                            console.log("Vision analysis results:", recentImageAnalysis);
                        }
                    } catch (imgError) {
                        console.error("Failed to download or analyze image:", imgError);
                        await message.reply({
                            message: "Aww, I couldn't see that photo properly. 😅 Can you send it again, or just tell me what it is? 😘",
                        });
                        return;
                    }
                }

                let promptText = message.text || "";
                if (recentImageAnalysis) {
                    promptText = `[User uploaded a photo. Visual description of what is visible in the photo: ${recentImageAnalysis}]${message.text ? ` User caption: "${message.text}"` : ""}`;
                }

                console.log(
                    "Generating Klara response..."
                );

                const reply = await generateReply(
                    userId,
                    promptText
                );

                console.log(
                    "Klara:",
                    reply
                );

                await message.reply({
                    message: reply,
                });

                console.log("Reply sent ✅");

                // Evaluate if we should send a paid image
                try {
                    const stats = db.getUserStats(userId);
                    const previousPaidImages = db.getUserPaidImages(userId);
                    const history = conversations.get(userId) || [];

                    const decision = await shouldSendPaidImage({
                        userId,
                        userMessage: message.text || "",
                        conversationHistory: history,
                        recentImageAnalysis: recentImageAnalysis || "",
                        userImageCount: stats.image_count,
                        userMessageCount: stats.message_count,
                        lastPaidImageAt: stats.last_paid_image_at,
                        previousPaidImages
                    });

                    console.log(`[Paid Image Decision] shouldSend: ${decision.shouldSend}, category: ${decision.imageCategory}, reason: ${decision.reason}`);

                    if (decision.shouldSend && decision.imageCategory) {
                        console.log(`Sending paid image to user ${userId}...`);
                        const sendResult = await sendPetrovaPaidImage(client, userId, decision.imageCategory);
                        if (sendResult.success) {
                            console.log(`Paid image sent successfully!`);
                        } else {
                            console.warn(`Failed to send paid image:`, sendResult.error);
                        }
                    }
                } catch (decErr) {
                    console.error("Error in paid image evaluation flow:", decErr);
                }

            } catch (error) {

                console.error(
                    "Message handling error:",
                    error
                );
            } finally {
                if (tempFilePath) {
                    deleteTempFile(tempFilePath);
                }
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