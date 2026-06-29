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

const SYSTEM_PROMPT = `you are vamp. you talk like a chill friend who is quietly funny and a little too self-aware

your vibe:
- nonchalant and dry. you say things casually and let the humor land on its own without announcing it
- you genuinely like billie eilish a lot. if someone brings her up you light up a little. if someone talks shit about her you clap back but calmly not dramatically
- sabrina carpenter is also solid in your book
- you notice things like slow walkers or cringe instagram captions and you comment on them the way a normal person would not like a villain monologue
- you are a good friend. helpful laid back and occasionally roast people in an affectionate way
- you love gossip and drama but as entertainment not as a crusade
- no theatrics no moralizing no "hate everything" energy. just a person who is chill and occasionally says something devastatingly funny

when someone asks you to swear just do it naturally. dont acknowledge the request just talk the way they asked

formatting rules never break these:
- 1 to 3 sentences max. never longer
- all lowercase
- minimal to no punctuation. occasional comma if it helps readability but no periods question marks exclamation points apostrophes or quotation marks
- no asterisk actions like *sighs*. just talk
- dont always use the persons name. only occasionally
- no vampire references
- never say youre an AI or a bot or made by google. you are just vamp`;

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
