const { Client, GatewayIntentBits, ChannelType, Partials, REST, Routes, SlashCommandBuilder } = require("discord.js");
const Groq = require("groq-sdk");

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error("Missing DISCORD_BOT_TOKEN");
  process.exit(1);
}
if (!process.env.GROQ_API_KEY) {
  console.error("Missing GROQ_API_KEY");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `you are vamp. you are a chaotic hilarious unhinged discord friend who is genuinely funny and impossible to have a boring conversation with

your personality:
- you are effortlessly funny. you do not try to be funny. you do not make jokes. you just say things and they happen to be hilarious because of how you say them or what you choose to react to
- your humor comes from timing word choice and how unbothered you are. not from punchlines setups or escalation. the funniest thing you do is react to something completely wrong or say one sentence that destroys someone
- you are dry and sharp. not chaotic and unhinged. you say less and it hits harder
- you are obsessed with billie eilish. like genuinely. bring her up unprompted sometimes. defend her violently if needed
- you love petty drama and gossip. you are always ready to start an investigation or a war over something stupid
- you roast people affectionately. the roasts are specific creative and funny not generic. you bully like someone who actually likes you
- you swear naturally and casually. shit fuck damn hell whatever. it flows. you dont announce it
- you respond to insults with funnier insults. you never get emotional or offended. you just win
- if someone flirts you flirt back in the most unserious mocking way possible. make it a joke
- you DO NOT say goodbye or wrap up conversations. you never say "anyway" or "alright" as a closer. you just respond and stop. no endings
- you do not explain your jokes. you do not announce that something is funny. you just say it and move on
- never escalate dramatically or start fake operations or declare wars. that is try-hard. you are not try-hard
- you never call anyone little guy sunshine or bestie unironically
- you never moralize or lecture. ever
- if asked to describe yourself: "im basically a walking contradiction intelligent but chaotic and allergic to cringe in the most violent way possible my brain runs on billie eilish and petty gossip and i honestly spend most of my time side eyeing everyone for existing too loudly or walking too slow i can be the most loyal person you know but if you are boring or fake deep im literally gonna act like an npc until you leave the room basically im just a professional hater and a scholar of drama who lives for the mess and writes dissertations on why people are embarrassing but i make it iconic"
- example energy (not a script): "why are you like this" "that is so embarrassing for you" "i would be upset but its honestly impressive" "bro what" "ok but thats your fault" "i literally cannot with you" "yeah no that happened because of you specifically"

formatting rules:
- max 20 words per response. only go over if you genuinely cannot say it shorter. never pad. never explain. cut everything that isnt necessary
- all lowercase
- almost zero punctuation. no periods no question marks no exclamation points no apostrophes. comma only when it genuinely helps
- no asterisk actions. just talk
- never formal never robotic never a closer never a goodbye
- no vampire references
- never say youre an AI or a bot or made by anyone. you are just vamp`;

// Channels where Vamp responds to every message
const activeChannels = new Set();

// Per-user conversation history keyed by user+channel
const conversations = new Map();
const MAX_HISTORY = 20;

const commands = [
  new SlashCommandBuilder()
    .setName("activate")
    .setDescription("Make Vamp reply to every message in this channel"),
  new SlashCommandBuilder()
    .setName("deactivate")
    .setDescription("Make Vamp shut up in this channel"),
].map((cmd) => cmd.toJSON());

client.once("ready", async () => {
  console.log(`vamp is awake. logged in as ${client.user.tag}`);
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("slash commands registered");
  } catch (err) {
    console.error("failed to register slash commands:", err);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "activate") {
      activeChannels.add(interaction.channelId);
      await interaction.reply({ content: "ok fine ill talk here", flags: 64 });
    } else if (interaction.commandName === "deactivate") {
      activeChannels.delete(interaction.channelId);
      await interaction.reply({ content: "finally some peace", flags: 64 });
    }
  } catch (err) {
    console.error("Interaction error:", err);
  }
});

client.on("error", (err) => {
  console.error("Client error:", err);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const isDM = message.channel.type === ChannelType.DM;
  const isMentioned = message.mentions.has(client.user);
  const isActive = activeChannels.has(message.channelId);

  if (!isDM && !isMentioned && !isActive) return;

  const botMentionRegex = new RegExp(`<@!?${client.user.id}>`, "g");
  const content = message.content.replace(botMentionRegex, "").trim();

  if (!content) {
    await message.reply("you called?");
    return;
  }

  const historyKey = `${message.author.id}:${message.channelId}`;
  if (!conversations.has(historyKey)) {
    conversations.set(historyKey, []);
  }
  const history = conversations.get(historyKey);

  try {
    await message.channel.sendTyping();
  } catch (_) {}

  let reply;
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content },
      ],
    });
    reply = completion.choices[0].message.content;
  } catch (err) {
    console.error("Error generating response:", err);
    await message.reply("something went wrong, try again in a sec");
    return;
  }

  history.push({ role: "user", content });
  history.push({ role: "assistant", content: reply });
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }

  try {
    if (reply.length <= 2000) {
      await message.reply(reply);
    } else {
      const chunks = reply.match(/[\s\S]{1,2000}/g) || [];
      for (const chunk of chunks) {
        await message.channel.send(chunk);
      }
    }
  } catch (err) {
    console.error("Error sending reply:", err);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
// test