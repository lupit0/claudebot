import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));

const execFileAsync = promisify(execFile);
const app = express();

const PORT = Number(process.env.PORT || 8794);
const BASE_PATH = (process.env.BASE_PATH || '/seneca-voice').replace(/\/$/, '');
const AUTH_TOKEN = process.env.SENECA_VOICE_TOKEN || '';
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';
const SESSION_PREFIX = process.env.SESSION_PREFIX || 'seneca-voice';
const AGENT_ID = process.env.OPENCLAW_AGENT_ID || 'main';

if (!AUTH_TOKEN && process.env.NODE_ENV !== 'test') {
  console.error('Missing SENECA_VOICE_TOKEN');
  process.exit(1);
}

app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '32kb' }));

function timingSafeEqualString(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function tokenFromReq(req) {
  const header = req.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  if (typeof req.query.token === 'string') return req.query.token;
  return '';
}

function requireAuth(req, res, next) {
  if (process.env.NODE_ENV === 'test') return next();
  const token = tokenFromReq(req);
  if (!timingSafeEqualString(token, AUTH_TOKEN)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function stableSessionId(token) {
  const digest = crypto.createHash('sha256').update(token || 'dev').digest('hex').slice(0, 24);
  return `${SESSION_PREFIX}-${digest}`;
}

function cleanAssistantText(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw.reply === 'string') return raw.reply.trim();
  if (typeof raw.text === 'string') return raw.text.trim();
  if (typeof raw.output === 'string') return raw.output.trim();
  if (raw.message && typeof raw.message.content === 'string') return raw.message.content.trim();
  if (Array.isArray(raw.result?.payloads)) {
    const text = raw.result.payloads.map(p => p?.text).filter(Boolean).join('\n').trim();
    if (text) return text;
  }
  if (Array.isArray(raw.payloads)) {
    const text = raw.payloads.map(p => p?.text).filter(Boolean).join('\n').trim();
    if (text) return text;
  }
  if (Array.isArray(raw.messages)) {
    const last = [...raw.messages].reverse().find(m => m?.role === 'assistant');
    if (typeof last?.content === 'string') return last.content.trim();
  }
  return JSON.stringify(raw).slice(0, 4000);
}

function extractOpenClawText(output) {
  const trimmed = String(output || '').trim();
  if (!trimmed) return '';
  try { return cleanAssistantText(JSON.parse(trimmed)); } catch {}
  const visible = trimmed.match(/"finalAssistantVisibleText"\s*:\s*("(?:\\.|[^"\\])*")/);
  if (visible) {
    try { return JSON.parse(visible[1]).trim(); } catch {}
  }
  const payloadText = trimmed.match(/"payloads"\s*:\s*\[[\s\S]*?"text"\s*:\s*("(?:\\.|[^"\\])*")/);
  if (payloadText) {
    try { return JSON.parse(payloadText[1]).trim(); } catch {}
  }
  return trimmed.length > 4000 ? trimmed.slice(0, 4000) : trimmed;
}

async function askOpenClaw({ message, token }) {
  const sessionId = stableSessionId(token);
  const prompt = [
    'You are Seneca speaking in a private browser voice conversation with Juan.',
    'Reply naturally and briefly unless Juan asks for detail.',
    'Do not mention Telegram, this web app, or implementation details unless asked.',
    '',
    `Juan says: ${message}`
  ].join('\n');
  let stdout = '';
  let stderr = '';
  try {
    const result = await execFileAsync(OPENCLAW_BIN, [
      'agent',
      '--agent', AGENT_ID,
      '--session-id', sessionId,
      '--thinking', 'off',
      '--timeout', '120',
      '--json',
      '--message', prompt
    ], {
      timeout: 130_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, OPENCLAW_VOICE_WEB: '1' }
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    // `openclaw agent` can return a non-zero exit after falling back from a
    // gateway auth failure even when stderr contains a valid embedded result.
    stdout = error.stdout || '';
    stderr = error.stderr || error.message || '';
    if (!stdout.trim() && !stderr.trim()) throw new Error('OpenClaw failed before producing a reply');
  }
  const text = extractOpenClawText(stdout || stderr);
  if (!text) throw new Error('OpenClaw returned no assistant text');
  return { text, sessionId };
}

app.get(`${BASE_PATH}/health`, (req, res) => {
  res.json({ ok: true, app: 'seneca-voice', basePath: BASE_PATH });
});

app.post(`${BASE_PATH}/api/chat`, requireAuth, async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'message required' });
  if (message.length > 4000) return res.status(413).json({ error: 'message too long' });
  try {
    const answer = await askOpenClaw({ message, token: tokenFromReq(req) });
    res.json({ ok: true, reply: answer.text, sessionId: answer.sessionId });
  } catch (error) {
    console.error('chat failed:', error.message);
    res.status(502).json({ error: 'agent_failed', detail: error.message });
  }
});

app.use(BASE_PATH, express.static(join(__dirname, 'public'), {
  extensions: ['html'],
  index: 'index.html',
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  }
}));

app.get('/', (req, res) => res.redirect(`${BASE_PATH}/`));

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`seneca-voice listening on http://127.0.0.1:${PORT}${BASE_PATH}`);
  });
  server.on('error', (error) => {
    console.error('server failed', error);
    process.exitCode = 1;
  });
  // Some OpenClaw/systemd execution paths can otherwise see the ESM module finish
  // before a JS-side reference is retained. Keep a harmless timer as a watchdog.
  setInterval(() => {}, 2 ** 30);
}

export { app, cleanAssistantText, extractOpenClawText, stableSessionId };
