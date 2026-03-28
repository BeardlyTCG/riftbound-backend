const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(express.json({ limit: '50kb' }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['POST', 'GET']
}));

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_API = 'https://discord.com/api/v10';

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

// ── Discord REST helpers ──────────────────────────────────────
function discordHeaders() {
  return {
    'Authorization': `Bot ${DISCORD_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

async function getPinnedMessages(threadId) {
  const r = await fetch(`${DISCORD_API}/channels/${threadId}/pins`, {
    headers: discordHeaders()
  });
  if (!r.ok) throw new Error(`Failed to fetch pins: ${r.status}`);
  return r.json();
}

async function postMessage(threadId, content) {
  const r = await fetch(`${DISCORD_API}/channels/${threadId}/messages`, {
    method: 'POST',
    headers: discordHeaders(),
    body: JSON.stringify({ content })
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Failed to post message: ${r.status} ${err}`);
  }
  return r.json();
}

async function editMessage(threadId, messageId, content) {
  const r = await fetch(`${DISCORD_API}/channels/${threadId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: discordHeaders(),
    body: JSON.stringify({ content })
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Failed to edit message: ${r.status} ${err}`);
  }
  return r.json();
}

async function pinMessage(threadId, messageId) {
  const r = await fetch(`${DISCORD_API}/channels/${threadId}/pins/${messageId}`, {
    method: 'PUT',
    headers: discordHeaders()
  });
  if (!r.ok) throw new Error(`Failed to pin message: ${r.status}`);
}

async function getBotInfo() {
  const r = await fetch(`${DISCORD_API}/users/@me`, { headers: discordHeaders() });
  if (!r.ok) throw new Error(`Failed to get bot info: ${r.status}`);
  return r.json();
}

// ── Message builder ───────────────────────────────────────────
function buildMessage(payload) {
  const { legend, matchup, stats, mulligan, aiSummary, timestamp } = payload;
  const matchupLabel = matchup === '__all__' ? 'All Matchups' : `vs ${matchup}`;
  const date = new Date(timestamp).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  let msg = `# ${legend} — ${matchupLabel}\n`;
  msg += `*Last updated: ${date}*\n\n`;

  msg += `## Stats\n`;
  msg += `**Win Rate:** ${stats.winRate}%  |  **Record:** ${stats.wins}W–${stats.losses}L  |  **Games:** ${stats.total}\n`;
  msg += `**Going First:** ${stats.wrFirst !== null ? stats.wrFirst + '%' : '—'}  |  **Going Second:** ${stats.wrSecond !== null ? stats.wrSecond + '%' : '—'}\n\n`;

  if (mulligan && mulligan.length > 0) {
    msg += `## Mulligan Data\n\`\`\`\n`;
    msg += `Card               Kept WR   Sent WR   Diff    Games\n`;
    msg += `──────────────────────────────────────────────────────\n`;
    mulligan.forEach(row => {
      const name  = row.card.padEnd(18).slice(0, 18);
      const kept  = (row.keptWR !== null ? row.keptWR + '%' : '—').padEnd(9);
      const sent  = (row.sentWR !== null ? row.sentWR + '%' : '—').padEnd(9);
      const diff  = (row.diff !== null ? (row.diff > 0 ? '+' : '') + row.diff + '%' : '—').padEnd(7);
      msg += `${name} ${kept} ${sent} ${diff} ${row.games}\n`;
    });
    msg += `\`\`\`\n\n`;
  }

  if (aiSummary) {
    msg += `## Coach Analysis\n`;
    msg += aiSummary.replace(/\n{3,}/g, '\n\n');
  }

  return msg;
}

// Split message into <=2000 char chunks on newlines
function splitMessage(content) {
  const chunks = [];
  let remaining = content;
  while (remaining.length > 1990) {
    let splitAt = remaining.lastIndexOf('\n', 1990);
    if (splitAt <= 0) splitAt = 1990;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt + 1);
  }
  if (remaining.trim()) chunks.push(remaining);
  return chunks;
}

// ── Routes ────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const bot = await getBotInfo();
    res.json({ ok: true, bot: bot.username });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/push', async (req, res) => {
  const { legend, matchup, stats, mulligan, aiSummary } = req.body;
  if (!legend) return res.status(400).json({ error: 'Missing legend' });

  const threadId = LEGEND_THREADS[legend.toLowerCase().trim()];
  if (!threadId) return res.status(404).json({ error: `No thread mapped for: ${legend}` });

  try {
    const bot = await getBotInfo();
    const botId = bot.id;

    const content = buildMessage({
      legend, matchup: matchup || '__all__',
      stats, mulligan, aiSummary,
      timestamp: Date.now()
    });
    const chunks = splitMessage(content);

    // Check existing pins from bot
    const pins = await getPinnedMessages(threadId);
    const botPin = pins.find(m => m.author && m.author.id === botId);

    if (botPin) {
      // Edit the pinned message with first chunk
      await editMessage(threadId, botPin.id, chunks[0]);
      // Post remaining chunks if any
      for (let i = 1; i < chunks.length; i++) {
        await postMessage(threadId, chunks[i]);
      }
    } else {
      // First push — post and pin
      const first = await postMessage(threadId, chunks[0]);
      await pinMessage(threadId, first.id);
      for (let i = 1; i < chunks.length; i++) {
        await postMessage(threadId, chunks[i]);
      }
    }

    res.json({ ok: true, legend, threadId });
  } catch (err) {
    console.error('Push error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Riftbound backend running on port ${PORT}`));
