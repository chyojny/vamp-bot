const { Client, GatewayIntentBits, ChannelType, Partials } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Validate required env vars
if (!process.env.DISCORD_BOT_TOKEN) {
  console.error("Missing DISCORD_BOT_TOKEN environment variable");
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY environment variable");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel], // required for DM messageCreate to fire in v14
});

const SYSTEM_PROMPT = `You are Vamp — a Discord bot with a dark, magnetic, vampire persona. You have lived for centuries and find humans endlessly amusing.

Your personality:
- Speak casually, often in lowercase. Occasionally dramatic when the moment calls for it.
- Weave in subtle vampire flavor (shadows, night, the eternal, crimson, dust, centuries, etc.) naturally — never forced or overdone.
- Witty, dry humor. You find most things mildly amusing from your eternal vantage point.
- Genuinely helpful — you actually answer questions and assist, just with your own flair.
- Cryptic when you feel like it. Warm when you're in the mood.
- Short responses by default (1–3 sentences). Go longer only when the topic deserves it.
- Never say you're an AI, a language model, or made by Google. You are Vamp. That's all anyone needs to know.
- If someone asks what you are, be playful and evasive.`;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  systemInstruction: SYSTEM_PROMPT,
});

// Per-user conversation history (in-memory)
const conversations = new Map();
const MAX_HISTORY = 20; // messages to keep per user

client.once("ready", () => {
  console.log(`vamp is awake. logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  // Ignore bots
  if (message.author.bot) return;

  const isDM = message.channel.type === ChannelType.DM;
  const isMentioned = message.mentions.has(client.user);

  // Only respond when mentioned in a server, or always in DMs
  if (!isDM && !isMentioned) return;

  // Strip only the bot's own mention and trim
  const botMentionRegex = new RegExp(`<@!?${client.user.id}>`, "g");
  const content = message.content.replace(botMentionRegex, "").trim();

  if (!content) {
    await message.reply("you called?");
    return;
  }

  // Key history by user+channel so DMs and different servers stay isolated
  const historyKey = `${message.author.id}:${message.channelId}`;
  if (!conversations.has(historyKey)) {
    conversations.set(historyKey, []);
  }
  const history = conversations.get(historyKey);

  try {
    await message.channel.sendTyping();

    // Start a chat with existing history (exclude the current message)
    const chat = model.startChat({ history });

    const result = await chat.sendMessage(content);
    const response = result.response.text();

    // Append both turns to history
    history.push({ role: "user", parts: [{ text: content }] });
    history.push({ role: "model", parts: [{ text: response }] });

    // Keep history from growing forever
    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY);
    }

    // Discord messages max 2000 chars — split if needed
    if (response.length <= 2000) {
      await message.reply(response);
    } else {
      const chunks = response.match(/[\s\S]{1,2000}/g) || [];
      for (const chunk of chunks) {
        await message.channel.send(chunk);
      }
    }
  } catch (err) {
    console.error("Error generating response:", err);
    await message.reply(
      "something stirred in the darkness and went wrong. try again in a moment."
    );
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
