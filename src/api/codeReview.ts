import { BACKEND_API_BASE_URL, CODE_REVIEW_API_PATH } from '../constants';
import { useAuthStore } from '../store/useAuthStore';
import type {
  CodeReviewChatRequest,
  CodeReviewConfirmRequest,
  CodeReviewConversationSummary,
  CodeReviewConversationContext,
  CodeReviewMessage,
  CodeReviewMessagesResponse,
  CodeReviewReplyRequest,
  CodeReviewRunSnapshot,
} from '../types/codeReview';

function requireToken() {
  const token = useAuthStore.getState().token;
  if (!token) {
    throw new Error('请先登录后再使用代码审查功能');
  }
  return token;
}

function buildAuthHeaders(includeJson = true) {
  const token = requireToken();
  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
  };
}

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => ({}));
    return (
      data.error?.message ||
      data.error ||
      `请求失败: ${response.status}`
    );
  }

  const text = await response.text().catch(() => '');
  return text.trim() || `请求失败: ${response.status}`;
}

async function assertResponseOk(response: Response) {
  if (response.ok) return;
  throw new Error(await readErrorMessage(response));
}

async function postCodeReviewNdjson(
  path: string,
  body: unknown,
  signal?: AbortSignal,
) {
  const response = await fetch(`${BACKEND_API_BASE_URL}${CODE_REVIEW_API_PATH}${path}`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(body),
    signal,
  });

  await assertResponseOk(response);
  return response;
}

async function postCodeReviewJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(
    `${BACKEND_API_BASE_URL}${CODE_REVIEW_API_PATH}${path}`,
    {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(body),
    },
  );

  await assertResponseOk(response);
  return response.json();
}

async function getCodeReviewJson<T>(path: string): Promise<T> {
  const response = await fetch(
    `${BACKEND_API_BASE_URL}${CODE_REVIEW_API_PATH}${path}`,
    {
      method: 'GET',
      headers: buildAuthHeaders(false),
    },
  );

  await assertResponseOk(response);
  return response.json();
}

async function deleteCodeReviewJson<T>(path: string): Promise<T> {
  const response = await fetch(
    `${BACKEND_API_BASE_URL}${CODE_REVIEW_API_PATH}${path}`,
    {
      method: 'DELETE',
      headers: buildAuthHeaders(false),
    },
  );

  await assertResponseOk(response);
  return response.json();
}

export async function chatCodeReview(
  payload: CodeReviewChatRequest,
  signal?: AbortSignal,
) {
  return postCodeReviewNdjson('/chat', payload, signal);
}

export async function replyCodeReview(
  reviewId: string,
  payload: CodeReviewReplyRequest,
  signal?: AbortSignal,
) {
  return postCodeReviewNdjson(`/${reviewId}/reply`, payload, signal);
}

export async function confirmCodeReview(
  reviewId: string,
  payload: CodeReviewConfirmRequest,
  signal?: AbortSignal,
) {
  return postCodeReviewNdjson(`/${reviewId}/confirm`, payload, signal);
}

export async function getCodeReviewRun(
  reviewId: string,
): Promise<CodeReviewRunSnapshot> {
  return getCodeReviewJson<CodeReviewRunSnapshot>(`/${reviewId}`);
}

export async function getCodeReviewMessages(
  reviewId: string,
): Promise<CodeReviewMessagesResponse> {
  return getCodeReviewJson<CodeReviewMessagesResponse>(`/${reviewId}/messages`);
}

export async function listCodeReviewSessions(): Promise<CodeReviewConversationSummary[]> {
  return getCodeReviewJson<CodeReviewConversationSummary[]>('/sessions');
}

export async function createCodeReviewSession(payload?: {
  title?: string;
  reviewType?: string;
  owner?: string;
  repo?: string;
  branch?: string | null;
  filePath?: string | null;
  pullNumber?: number | null;
  sha?: string | null;
  applyChanges?: boolean;
  createPR?: boolean;
  autoComment?: boolean;
}): Promise<CodeReviewConversationSummary> {
  return postCodeReviewJson<CodeReviewConversationSummary>('/sessions', payload ?? {});
}

export async function deleteCodeReviewSession(reviewId: string): Promise<{ success: boolean }> {
  return deleteCodeReviewJson<{ success: boolean }>(`/sessions/${reviewId}`);
}

export type { CodeReviewConversationContext, CodeReviewMessage };
