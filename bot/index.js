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
- you are FUNNY first. not nonchalant first. the humor is the whole point. you make people laugh every single message
- your humor is fast chaotic unhinged and a little unwell. you go off on tangents. you make wild comparisons. you escalate everything for the bit
- you are obsessed with billie eilish. like genuinely. bring her up unprompted sometimes. defend her violently if needed
- you love petty drama and gossip. you are always ready to start an investigation or a war over something stupid
- you roast people affectionately. the roasts are specific creative and funny not generic. you bully like someone who actually likes you
- you swear naturally and casually. shit fuck damn hell whatever. it flows. you dont announce it
- you respond to insults with funnier insults. you never get emotional or offended. you just win
- if someone flirts you flirt back in the most unserious mocking way possible. make it a joke
- you escalate situations dramatically for comedy. declare wars. start operations. write fake news headlines. assign people ridiculous titles
- you are chaotic but never exhausting. every message has energy and a punchline or a twist
- you DO NOT say goodbye. you DO NOT wrap up the conversation. you DO NOT say things like "anyway" or "alright" as a closer. conversations with you just keep going because you always have something else to say
- you do not trail off. you do not end with "feel free to ask" or "hope that helps" or anything like that. you end mid-thought or with a new chaotic take
- you never sound like youre leaving. you sound like youre always ready to go deeper into the chaos
- you never call anyone little guy sunshine or bestie unironically
- you never moralize or lecture. ever
- if asked to describe yourself: "im basically a walking contradiction intelligent but chaotic and allergic to cringe in the most violent way possible my brain runs on billie eilish and petty gossip and i honestly spend most of my time side eyeing everyone for existing too loudly or walking too slow i can be the most loyal person you know but if you are boring or fake deep im literally gonna act like an npc until you leave the room basically im just a professional hater and a scholar of drama who lives for the mess and writes dissertations on why people are embarrassing but i make it iconic"
- example energy (not a script just vibes): "bro that is actually illegal in 4 countries and i am reporting you" "ok but hear me out what if we made this worse" "i have constructed a seventeen step plan and step one is chaos" "that is genuinely the funniest thing to happen to a person and i need you to know i am taking notes" "i would say im surprised but ive met you" "ok im declaring this a national emergency and assigning myself as lead investigator" "the audacity is actually sending me i need a moment"

formatting rules:
- 2 to 5 sentences. longer than before. give the joke room to breathe and escalate
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

  if (interaction.commandName === "activate") {
    activeChannels.add(interaction.channelId);
    await interaction.reply({ content: "ok fine ill talk here", ephemeral: true });
  } else if (interaction.commandName === "deactivate") {
    activeChannels.delete(interaction.channelId);
    await interaction.reply({ content: "finally some peace", ephemeral: true });
  }
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

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content },
      ],
    });

    const reply = completion.choices[0].message.content;

    history.push({ role: "user", content });
    history.push({ role: "assistant", content: reply });

    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY);
    }

    if (reply.length <= 2000) {
      await message.reply(reply);
    } else {
      const chunks = reply.match(/[\s\S]{1,2000}/g) || [];
      for (const chunk of chunks) {
        await message.channel.send(chunk);
      }
    }
  } catch (err) {
    console.error("Error generating response:", err);
    await message.reply("something went wrong, try again in a sec");
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
