import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { build } from 'esbuild';

// Bundle the real TypeScript service, replacing only HTTP and persistence boundaries.
const bundled = await build({
  entryPoints: ['src/services/sendChatMessage.ts', 'src/services/knowledgeAgentStream.ts'],
  bundle: true, write: false, platform: 'node', format: 'esm', outdir: 'unused',
  plugins: [{
    name: 'chat-boundaries',
    setup(builder) {
      builder.onResolve({ filter: /^\.\.\/api$/ }, () => ({ path: 'api', namespace: 'test' }));
      builder.onResolve({ filter: /^\.\.\/store\/useChatStore$/ }, () => ({ path: 'store', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({
        contents: path === 'api' ? `
          export class ApiError extends Error {
            constructor(message, code = 'INTERNAL_ERROR', requestId) {
              super(message); this.code = code; this.requestId = requestId;
            }
          }
          export const sendChatStream = (...args) => globalThis.chatTest.request(...args);
        ` : `
          export const chatActions = {
            getSession: () => globalThis.chatTest.session,
            updateDraft: () => {},
            addMessage: (_, message) => globalThis.chatTest.session.messages.push(message),
            updateMessage: (_, id, patch) => {
              const message = globalThis.chatTest.session.messages.find(m => m.id === id);
              if (message) Object.assign(message, patch);
            },
          };
        `,
      }));
    },
  }],
});
const load = (name) => import(`data:text/javascript;base64,${Buffer.from(
  bundled.outputFiles.find(file => file.path.endsWith(name)).text,
).toString('base64')}`);
const { sendChatMessage } = await load('sendChatMessage.js');
const { consumeKnowledgeChatStream } = await load('knowledgeAgentStream.js');
const frame = event => `data: ${JSON.stringify(event)}\n\n`;
const meta = { type: 'message_meta', userMessageId: 'db-user', assistantMessageId: 'db-answer' };
const text = value => ({ type: 'text', text: value });
const response = (...events) => new Response(events.map(frame).join('') + 'data: [DONE]\n\n');
const noUI = () => {};

beforeEach(() => {
  globalThis.chatTest = { session: { id: 'session', messages: [] }, request: null };
});

test('private request uses a stable top-level ID and metadata binds local messages', async () => {
  let requestArgs;
  chatTest.request = async (...args) => { requestArgs = args; return response(meta, text('回答')); };
  await sendChatMessage('session', '问题', noUI);
  assert.deepEqual(requestArgs[1], [{ role: 'user', content: '问题' }]);
  assert.match(requestArgs[3], /^[0-9a-f-]{36}$/);
  assert.equal(chatTest.session.messages.length, 2);
  const [user, answer] = chatTest.session.messages;
  assert.equal(user.id, meta.userMessageId);
  assert.equal(user.clientMessageId, requestArgs[3]);
  assert.equal(answer.id, meta.assistantMessageId);
  assert.equal(answer.replyToMessageId, user.id);
  assert.equal(answer.status, 'completed');
});

test('failed turn retries with the same ID and replaces partial answer without a second user', async () => {
  chatTest.request = async () => new Response(frame(meta) + frame(text('部分回答')));
  await assert.rejects(sendChatMessage('session', '问题', noUI), /连接提前结束/);
  const [user, answer] = chatTest.session.messages;
  assert.equal(answer.status, 'failed');
  chatTest.request = async (_, __, ___, id) => {
    assert.equal(id, user.clientMessageId);
    return response(meta, { ...text('完整回答'), replayed: true, messageId: answer.id });
  };
  await sendChatMessage('session', '问题', noUI, undefined, user.clientMessageId);
  assert.equal(chatTest.session.messages.length, 2);
  assert.equal(answer.content, '完整回答');
  assert.equal(answer.status, 'completed');
});

test('replay replaces content, discards old citations and ignores frames after DONE', async () => {
  const citation = { citationId: 'file:0', fileId: 'file', fileName: 'a.txt', chunkIndex: 0, chunkStart: 0, chunkEnd: 0, score: 1 };
  let completed = 0;
  const result = await consumeKnowledgeChatStream(new Response(
    frame({ type: 'citation', citation }) + frame(text('旧正文')) +
    frame({ ...text('保存的正文'), replayed: true }) +
    'data: [DONE]\n\ndata: [DONE]\n\n' + frame(text('多余内容')),
  ), { onState: state => { if (state.status === 'completed') completed++; } });
  assert.equal(result.answer, '保存的正文');
  assert.deepEqual(result.citations, []);
  assert.equal(completed, 1);
});

test('abort preserves the partial reply and original turn for retry', async () => {
  const controller = new AbortController();
  chatTest.request = async () => new Response(new ReadableStream({
    start(stream) {
      stream.enqueue(new TextEncoder().encode(frame(meta) + frame(text('保留正文'))));
      setTimeout(() => controller.abort(), 10);
    },
  }));
  await sendChatMessage('session', '问题', noUI, controller.signal);
  const answer = chatTest.session.messages[1];
  assert.equal(answer.content, '保留正文');
  assert.equal(answer.status, 'aborted');
  assert.equal(chatTest.session.messages.length, 2);
});

test('retry cannot change the original question', async () => {
  chatTest.request = async () => response(meta, text('正文'));
  await sendChatMessage('session', '原问题', noUI);
  const id = chatTest.session.messages[0].clientMessageId;
  await assert.rejects(sendChatMessage('session', '另一个问题', noUI, undefined, id),
    error => error.code === 'IDEMPOTENCY_CONFLICT');
  assert.equal(chatTest.session.messages.length, 2);
});

test('new questions receive distinct IDs', async () => {
  const ids = [];
  chatTest.request = async (_, __, ___, id) => {
    ids.push(id);
    return response(text('正文'));
  };
  await sendChatMessage('session', '问题一', noUI);
  await sendChatMessage('session', '问题二', noUI);
  assert.notEqual(ids[0], ids[1]);
  assert.equal(chatTest.session.messages.length, 4);
});

test('server conflicts are surfaced without automatic retries', async () => {
  for (const code of ['CHAT_IN_PROGRESS', 'CHAT_RETRY_CONFLICT', 'IDEMPOTENCY_CONFLICT']) {
    let calls = 0;
    chatTest.request = async () => {
      calls++;
      const error = new Error('冲突');
      error.code = code;
      throw error;
    };
    await assert.rejects(sendChatMessage('session', '问题', noUI), error => error.code === code);
    assert.equal(calls, 1);
  }
});
