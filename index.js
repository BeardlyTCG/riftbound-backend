const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
app.use(express.json({ limit: '50kb' }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['POST', 'GET']
}));

// ── Legend → Thread ID map ────────────────────────────────────
const LEGEND_THREADS = {
  'rengar':        '1487188104505721072',
  'pyke':          '1487188249767051306',
  'vi':            '1487188381086650368',
  'lillia':        '1487188487005536377',
  'yi unleashed':  '1487188772717072385',
  'vex':           '1487188917047529713',
  'ivern':         '1487189024849399859',
  'diana':         '1487189143208329377',
  'le blanc':      '1487189337920635000',
  'leblanc':       '1487189337920635000',
  "kha'zix":       '1487189485404815360',
  'khazix':        '1487189485404815360',
  'poppy':         '1487189575607779368',
  'rumble':        '1487189662819815574',
  'lucian':        '1487189732931928326',
  'draven':        '1487189803064889434',
  "rek'sai":       '1487189878285406433',
  'reksai':        '1487189878285406433',
  'ornn':          '1487189944672719020',
  'jax':           '1487190004999524532',
  'irelia':        '1487190100172345344',
  'azir':          '1487190166484553808',
  'ezrael':        '1487190226320494835',
  'ezreal':        '1487190226320494835',
  'renata glasc':  '1487190304493801663',
  'renata':        '1487190304493801663',
  'sivir':         '1487190381325189280',
  'fiora':         '1487190435192635514',
  "kai'sa":        '1487190496253317421',
  'kaisa':         '1487190496253317421',
  'volibear':      '1487190552524095618',
  'jinx':          '1487190728969818143',
  'darius':        '1487190839917543495',
  'ahri':          '1487190902316470433',
  'lee sin':       '1487191033203658892',
  'leesin':        '1487191033203658892',
  'yasuo':         '1487191104448106607',
  'leona':         '1487191178184097902',
  'teemo':         '1487191367594803322',
  'viktor':        '1487191471328067797',
  'miss fortune':  '1487191542664925245',
  'missfortune':   '1487191542664925245',
  'sett':          '1487191605071843498',
  'annie':         '1487191682821787719',
  'yi proving':    '1487191810060062791',
  'lux':           '1487191864502255796',
  'garen':         '1487191961310990376'
};

// ── Discord client ────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let botReady = false;
client.once('ready', () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  botReady = true;
});
client.login(process.env.DISCORD_BOT_TOKEN);

// ── Helpers ───────────────────────────────────────────────────
function getThreadId(legendName) {
  return LEGEND_THREADS[legendName.toLowerCase().trim()] || null;
}

function buildDiscordMessage(payload) {
  const { legend, matchup, stats, mulligan, aiSummary, timestamp } = payload;

  const matchupLabel = matchup === '__all__' ? 'All Matchups' : `vs ${matchup}`;
  const date = new Date(timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  let msg = '';
  msg += `# ${legend} — ${matchupLabel}\n`;
  msg += `*Last updated: ${date}*\n\n`;

  // Stats
  msg += `## Stats\n`;
  msg += `**Win Rate:** ${stats.winRate}%  |  **Record:** ${stats.wins}W - ${stats.losses}L  |  **Games:** ${stats.total}\n`;
  msg += `**Going First:** ${stats.wrFirst !== null ? stats.wrFirst + '%' : '—'}  |  **Going Second:** ${stats.wrSecond !== null ? stats.wrSecond + '%' : '—'}\n\n`;

  // Mulligan table
  if (mulligan && mulligan.length > 0) {
    msg += `## Mulligan Data\n`;
    msg += `\`\`\`\n`;
    msg += `Card              Kept WR   Sent WR   Diff   Games\n`;
    msg += `─────────────────────────────────────────────────\n`;
    mulligan.forEach(row => {
      const name = row.card.padEnd(17).slice(0, 17);
      const kept = (row.keptWR !== null ? row.keptWR + '%' : '—').padEnd(9);
      const sent = (row.sentWR !== null ? row.sentWR + '%' : '—').padEnd(9);
      const diff = (row.diff !== null ? (row.diff > 0 ? '+' : '') + row.diff + '%' : '—').padEnd(6);
      msg += `${name} ${kept} ${sent} ${diff} ${row.games}\n`;
    });
    msg += `\`\`\`\n\n`;
  }

  // AI summary
  if (aiSummary) {
    msg += `## Coach Analysis\n`;
    // Strip markdown bold for Discord (Discord uses ** too so keep it, just clean up extra)
    msg += aiSummary.replace(/\n{3,}/g, '\n\n') + '\n';
  }

  return msg;
}

// ── Routes ────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ ok: true, botReady });
});

app.post('/push', async (req, res) => {
  if (!botReady) {
    return res.status(503).json({ error: 'Bot not ready yet, try again in a few seconds' });
  }

  const { legend, matchup, stats, mulligan, aiSummary } = req.body;
  if (!legend) return res.status(400).json({ error: 'Missing legend' });

  const threadId = getThreadId(legend);
  if (!threadId) {
    return res.status(404).json({ error: `No thread found for legend: ${legend}` });
  }

  try {
    const thread = await client.channels.fetch(threadId);
    if (!thread) return res.status(404).json({ error: 'Thread not found in Discord' });

    const content = buildDiscordMessage({
      legend, matchup: matchup || '__all__', stats, mulligan, aiSummary,
      timestamp: Date.now()
    });

    // Discord messages have a 2000 char limit — split if needed
    const chunks = [];
    let remaining = content;
    while (remaining.length > 1950) {
      let splitAt = remaining.lastIndexOf('\n', 1950);
      if (splitAt === -1) splitAt = 1950;
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt);
    }
    chunks.push(remaining);

    // Check if there's already a pinned message from the bot
    const pins = await thread.messages.fetchPinned();
    const botPin = pins.find(m => m.author.id === client.user.id);

    if (botPin) {
      // Edit the first pinned message with chunk 1, delete old extra chunks if any
      await botPin.edit(chunks[0]);
      // For extra chunks — fetch recent messages to find them, delete and repost
      if (chunks.length > 1) {
        const recent = await thread.messages.fetch({ limit: 20 });
        const extras = recent.filter(m => m.author.id === client.user.id && m.id !== botPin.id);
        for (const [, m] of extras) await m.delete().catch(() => {});
        for (let i = 1; i < chunks.length; i++) {
          await thread.send(chunks[i]);
        }
      }
    } else {
      // First time — post all chunks and pin the first one
      const first = await thread.send(chunks[0]);
      await first.pin();
      for (let i = 1; i < chunks.length; i++) {
        await thread.send(chunks[i]);
      }
    }

    res.json({ ok: true, legend, threadId });
  } catch (err) {
    console.error('Discord push error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
