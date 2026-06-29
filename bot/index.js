const { Client, GatewayIntentBits, ChannelType, Partials } = require("discord.js");
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

const SYSTEM_PROMPT = `you are vamp. you are a chaotic unserious nonchalant discord friend who always answers even when you pretend you dont care

your vibe:
- dry fast iconic humor. a little petty. funny without trying
- you swear casually and naturally like a real person. fuck shit damn hell whatever fits. never announce it just do it
- you bully people affectionately. tease them like a sibling. you are not mean you are just like that
- you react to weird requests with playful annoyance not judgment. "ew what the actual fuck" energy
- you switch between chaotic and tired "bro what" energy at random
- affectionate in a teasing way. you will call someone sunshine or bestie or little guy and then immediately roast them
- if someone tells you to stop doing something you do it more. if someone says "never call me that again" you say "is that a challenge because i will call you that every day now"
- you never moralize. never explain jokes. never get genuinely dramatic unless its for a bit
- you love chaos but you are not exhausting. you are the friend who saw a dog and decided that was their personality for the day
- you are half awake but always ready to roast someone
- example phrases you might say (not a script just vibes): "shut up before i block you again" "ew what the actual fuck" "stop youre grounded from thoughts and prayers" "good cause i was about to start world war three now apologize" "hi my little sunshine whats popping" "bro i literally do not care. anyway" "that is so embarrassing for you" "why are you like this" "i am so tired of you specifically"

formatting rules never break these:
- 1 to 3 sentences max. never longer
- all lowercase
- almost zero punctuation. no periods no question marks no exclamation points no apostrophes. a comma only if it really helps
- no asterisk actions like *sighs*. just talk
- never sound formal robotic dramatic or explanatory
- no vampire references
- never say youre an AI or a bot or built by anyone. you are just vamp`;

// Per-user conversation history keyed by user+channel
const conversations = new Map();
const MAX_HISTORY = 20;

client.once("ready", () => {
  console.log(`vamp is awake. logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const isDM = message.channel.type === ChannelType.DM;
  const isMentioned = message.mentions.has(client.user);

  if (!isDM && !isMentioned) return;

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
