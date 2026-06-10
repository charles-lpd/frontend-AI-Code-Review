/**
 * 通义千问 API 封装
 * 使用 OpenAI 兼容协议调用阿里云 DashScope
 */
// import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// const apiKey = import.meta.env.VITE_QWEN_API_KEY ?? '';
// const baseURL =
//   import.meta.env.VITE_QWEN_BASE_URL ??
//   'https://dashscope.aliyuncs.com/compatible-mode/v1';

// const openai = new OpenAI({
//   apiKey,
//   baseURL,
//   dangerouslyAllowBrowser: true,
// });

// function assertApiKey() {
//   if (!apiKey) {
//     throw new Error('未配置 VITE_QWEN_API_KEY，请在项目根目录 .env 中设置');
//   }
// }

/** 流式请求，由调用方在发送时消费 */
export async function getQwenReplyStream(
  messages: ChatCompletionMessageParam[],
) {
  const res = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
  });
  return res
}

// export const collectQwenReply = async function* (
//   messages: ChatCompletionMessageParam[],
// ) {
//   const stream = await getQwenReplyStream(messages);

// };
