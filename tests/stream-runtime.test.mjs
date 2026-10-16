import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundled = await build({
  entryPoints: ['src/services/streamTransport.ts', 'src/services/textStreamRuntime.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  outdir: 'unused',
});
const load = (name) => import(`data:text/javascript;base64,${Buffer.from(
  bundled.outputFiles.find(file => file.path.endsWith(name)).text,
).toString('base64')}`);
const { readStreamText, readSseFrames, readNdjsonLines } = await load('streamTransport.js');
const { createTextStreamRuntime, streamDraftStore } = await load('textStreamRuntime.js');

function responseFromBytes(bytes) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of bytes) controller.enqueue(chunk);
      controller.close();
    },
  }));
}

test('transport decodes UTF-8 split across chunks and flushes EOF', async () => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode('data: 中😀\n\ndata: 最后一条');
  const pieces = [bytes.slice(0, 8), bytes.slice(8, 10), bytes.slice(10)];
  const text = [];
  for await (const chunk of readStreamText(responseFromBytes(pieces))) text.push(chunk);
  assert.equal(text.join(''), 'data: 中😀\n\ndata: 最后一条');
});

test('SSE supports CRLF, multiline data, heartbeats, and trailing frames', async () => {
  let heartbeats = 0;
  const response = responseFromBytes([new TextEncoder().encode(': ping\r\ndata: {"a":\r\ndata:1}\r\n\r\ndata: last')]);
  const frames = [];
  for await (const frame of readSseFrames(response, undefined, () => heartbeats += 1)) frames.push(frame);
  assert.equal(heartbeats, 1);
  assert.deepEqual(frames.map(frame => frame.data), ['{"a":\n1}', 'last']);
});

test('NDJSON emits a final unterminated record', async () => {
  const lines = [];
  for await (const line of readNdjsonLines(responseFromBytes([new TextEncoder().encode('{"done":false}\n{"done":true}')])) ) lines.push(line);
  assert.deepEqual(lines, ['{"done":false}', '{"done":true}']);
});

test('text runtime advances by elapsed time, publishes once per frame, and finishes immediately', () => {
  let now = 0;
  const callbacks = new Map();
  let nextFrame = 0;
  const checkpoints = [];
  const fakeClock = {
    now: () => now,
    frame: callback => { const id = ++nextFrame; callbacks.set(id, callback); return id; },
    cancelFrame: id => callbacks.delete(id),
    delay: () => 999,
    cancelDelay: () => {},
  };
  const runtime = createTextStreamRuntime({
    identity: { scope: 'private-chat', conversationId: 'c', requestId: 'r' },
    key: 'test-runtime',
    onCheckpoint: (snapshot, terminal) => checkpoints.push({ snapshot, terminal }),
    clock: fakeClock,
    hidden: () => false,
    reducedMotion: () => false,
  });
  runtime.receive({ content: '中文😀abc' });
  assert.equal(streamDraftStore.getState()['test-runtime'].content, '');
  now = 1000;
  const id = [...callbacks.keys()][0];
  callbacks.get(id)(now);
  assert.equal(streamDraftStore.getState()['test-runtime'].content, '中文😀abc');
  runtime.finish();
  assert.equal(streamDraftStore.getState()['test-runtime'], undefined);
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0].snapshot.content, '中文😀abc');
  assert.equal(checkpoints[0].terminal, true);
});
