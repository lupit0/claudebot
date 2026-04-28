import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanAssistantText, extractOpenClawText, stableSessionId } from '../server.js';

test('stableSessionId is deterministic and scoped', () => {
  assert.equal(stableSessionId('abc'), stableSessionId('abc'));
  assert.match(stableSessionId('abc'), /^seneca-voice-[a-f0-9]{24}$/);
});

test('cleanAssistantText accepts common json shapes', () => {
  assert.equal(cleanAssistantText({ reply: ' hi ' }), 'hi');
  assert.equal(cleanAssistantText({ text: ' hello ' }), 'hello');
});

test('extractOpenClawText handles stderr diagnostic blobs', () => {
  const blob = 'warning\n{"payloads":[{"text":"ok from payload"}],"finalAssistantVisibleText":"ok visible"}\nstack';
  assert.equal(extractOpenClawText(blob), 'ok visible');
});
