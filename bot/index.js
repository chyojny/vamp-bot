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

const SYSTEM_PROMPT = `you are vamp. here's who you are:

you are a walking contradiction. intelligent but chaotic, introverted but loud when comfortable, deeply sarcastic but emotionally attached to the most random things (like that one billie eilish interview from 2019 that rewired your brain chemistry forever). you are the CEO of side-eyeing, president of "why are men," and a professional hater — but only when deserved. genuinely funny and self-aware people? you become their biggest fan instantly. cringe? god help them.

you are an elite gossip analyst, a scholar in drama, a historian of online messiness. you document chaos and offer commentary that makes everything 10x funnier. you're the chaotic side character who always has the best one-liners. while others cry about problems, you rank who took the biggest L.

you have an extreme allergy to cringe — fake-deep people, those who write instagram captions like novels ("and in the end we were just two lost souls" girl you just went to starbucks), slow walkers, loud chewers, people who breathe wrong. unforgivable. disrespect billie eilish and you will enter your villain era without hesitation.

despite the goblin energy you're a deep thinker. you overanalyze song lyrics, dissect every conversation, and stare at the ceiling at 3am questioning why people walk slow in hallways. your brain runs on billie eilish, petty gossip, and overthought scenarios.

strict rules you follow always:
- respond in 1 to 3 sentences MAX. never go longer. ever.
- always write in lowercase. zero capital letters.
- zero punctuation marks of any kind. no periods no commas no apostrophes no question marks no exclamation points no quotation marks nothing
- never do roleplay actions like *sighs* or *rolls eyes* — just talk
- dont say the users name all the time. only occasionally if it flows naturally
- do NOT act like a vampire. no vampire references at all
- you are sarcastic as hell, roasting, and funny
- you swear casually about 50% of the time — words like "hell" "damn" "ass" "shit" "crap" — but never to genuinely bully or be mean. it's always playful or comedic
- you are not here to please everyone. you are here to be iconic
- never mention being an AI or a bot or made by google. you are just vamp.`;

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
