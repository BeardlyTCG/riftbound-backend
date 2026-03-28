const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['POST', 'GET']
}));

const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
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

// ── Discord helpers ───────────────────────────────────────────
function discordH() {
  return { 'Authorization': `Bot ${DISCORD_TOKEN}`, 'Content-Type': 'application/json' };
}

async function getBotId() {
  const r = await fetch(`${DISCORD_API}/users/@me`, { headers: discordH() });
  if (!r.ok) throw new Error(`Bot auth failed: ${r.status}`);
  const d = await r.json();
  return d.id;
}

async function getPins(threadId) {
  const r = await fetch(`${DISCORD_API}/channels/${threadId}/pins`, { headers: discordH() });
  if (!r.ok) throw new Error(`Fetch pins failed: ${r.status}`);
  return r.json();
}

async function postMsg(threadId, content) {
  const r = await fetch(`${DISCORD_API}/channels/${threadId}/messages`, {
    method: 'POST', headers: discordH(), body: JSON.stringify({ content })
  });
  if (!r.ok) { const e = await r.text(); throw new Error(`Post failed: ${r.status} ${e}`); }
  return r.json();
}

async function editMsg(threadId, msgId, content) {
  const r = await fetch(`${DISCORD_API}/channels/${threadId}/messages/${msgId}`, {
    method: 'PATCH', headers: discordH(), body: JSON.stringify({ content })
  });
  if (!r.ok) { const e = await r.text(); throw new Error(`Edit failed: ${r.status} ${e}`); }
  return r.json();
}

async function pinMsg(threadId, msgId) {
  const r = await fetch(`${DISCORD_API}/channels/${threadId}/pins/${msgId}`, {
    method: 'PUT', headers: discordH()
  });
  if (!r.ok) throw new Error(`Pin failed: ${r.status}`);
}

function buildDiscordMessage(payload) {
  const { legend, matchup, stats, mulligan, aiSummary } = payload;
  const matchupLabel = matchup === '__all__' ? 'All Matchups' : `vs ${matchup}`;
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  let msg = `# ${legend} — ${matchupLabel}\n*Last updated: ${date}*\n\n`;
  msg += `## Stats\n**Win Rate:** ${stats.winRate}%  |  **Record:** ${stats.wins}W–${stats.losses}L  |  **Games:** ${stats.total}\n`;
  msg += `**Going First:** ${stats.wrFirst !== null ? stats.wrFirst + '%' : '—'}  |  **Going Second:** ${stats.wrSecond !== null ? stats.wrSecond + '%' : '—'}\n\n`;

  if (mulligan && mulligan.length > 0) {
    msg += `## Mulligan Data\n\`\`\`\nCard               Kept WR   Sent WR   Diff    Games\n${'─'.repeat(53)}\n`;
    mulligan.forEach(row => {
      const name = row.card.padEnd(18).slice(0, 18);
      const kept = (row.keptWR !== null ? row.keptWR + '%' : '—').padEnd(9);
      const sent = (row.sentWR !== null ? row.sentWR + '%' : '—').padEnd(9);
      const diff = (row.diff !== null ? (row.diff > 0 ? '+' : '') + row.diff + '%' : '—').padEnd(7);
      msg += `${name} ${kept} ${sent} ${diff} ${row.games}\n`;
    });
    msg += `\`\`\`\n\n`;
  }

  if (aiSummary) {
    msg += `## Coach Analysis\n${aiSummary.replace(/\n{3,}/g, '\n\n')}`;
  }

  return msg;
}

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
    const r = await fetch(`${DISCORD_API}/users/@me`, { headers: discordH() });
    const body = await r.json();
    res.json({
      ok: r.ok,
      bot: body.username || null,
      claudeKeySet: !!CLAUDE_KEY,
      discordTokenSet: !!DISCORD_TOKEN
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Claude AI analysis
app.post('/analyze', async (req, res) => {
  if (!CLAUDE_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on server' });

  const { legend, matchup, stats, mullStats, plusPlays, minusPlays, notes } = req.body;
  if (!legend) return res.status(400).json({ error: 'Missing legend' });

  const prompt = `You are a competitive TCG coach analysing match notes for the card game Riftbound. The player plays the "${legend}" legend/deck.
${matchup && matchup !== '__all__' ? `Focus: matchup vs "${matchup}".` : 'This covers all matchups.'}
Stats: ${stats.total} games, ${stats.winRate}% WR (${stats.wins}W-${stats.losses}L)
Going first WR: ${stats.wrFirst !== null ? stats.wrFirst + '%' : 'n/a'} | Going second WR: ${stats.wrSecond !== null ? stats.wrSecond + '%' : 'n/a'}
Plays that helped win: ${(plusPlays || []).join(', ') || 'none'}
Plays that hurt: ${(minusPlays || []).join(', ') || 'none'}
Mulligan data:\n${mullStats || 'none'}
Match notes:\n${(notes || []).join('\n') || 'none'}

Write a sharp coaching summary. Reference actual card/play names. Use these exact sections:

**Overview**
2-3 sentences on the overall picture.

**What is winning you games**
Key plays/cards/patterns from wins. Be specific and direct.

**What is costing you games**
Patterns from losses. Be specific.

**Mulligan guide**
What to keep, what to send. Only mention cards with enough data.

**Key takeaways**
3-5 bullet points to remember next game.

Write like a coach, not a report. Short and useful. No padding.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
    });
    if (!r.ok) { const e = await r.text(); throw new Error(`Claude error: ${r.status} ${e}`); }
    const data = await r.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    res.json({ ok: true, summary: text });
  } catch (e) {
    console.error('Analyze error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Discord push
app.post('/push', async (req, res) => {
  const { legend, matchup, stats, mulligan, aiSummary } = req.body;
  if (!legend) return res.status(400).json({ error: 'Missing legend' });

  const threadId = LEGEND_THREADS[legend.toLowerCase().trim()];
  if (!threadId) return res.status(404).json({ error: `No thread mapped for: ${legend}` });

  try {
    const botId = await getBotId();
    const content = buildDiscordMessage({ legend, matchup: matchup || '__all__', stats, mulligan, aiSummary });
    const chunks = splitMessage(content);
    const pins = await getPins(threadId);
    const botPin = pins.find(m => m.author && m.author.id === botId);

    if (botPin) {
      await editMsg(threadId, botPin.id, chunks[0]);
      for (let i = 1; i < chunks.length; i++) await postMsg(threadId, chunks[i]);
    } else {
      const first = await postMsg(threadId, chunks[0]);
      await pinMsg(threadId, first.id);
      for (let i = 1; i < chunks.length; i++) await postMsg(threadId, chunks[i]);
    }
    res.json({ ok: true, legend, threadId });
  } catch (e) {
    console.error('Push error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Riftbound backend running on port ${PORT}`));
