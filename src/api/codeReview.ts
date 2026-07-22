import { BACKEND_API_BASE_URL, CODE_REVIEW_API_PATH } from '../constants';
import { useAuthStore } from '../store/useAuthStore';
import type {
  CodeReviewPlanResponse,
  CodeReviewRequest,
  CodeReviewRunSnapshot,
} from '../types/codeReview';

type PlanPayload = {
  message?: string;
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

type ContinuePayload = {
  reviewId?: string;
  resume?: { confirmed?: boolean };
};

function buildAuthHeaders() {
  const token = useAuthStore.getState().token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function assertJsonResponseOk(response: Response) {
  if (response.ok) return;

  const errorData = await response.json().catch(() => ({}));
  throw new Error(
    errorData.error?.message ||
      errorData.error ||
      `请求失败: ${response.status}`,
  );
}

export async function planCodeReview(
  payload: PlanPayload,
): Promise<CodeReviewPlanResponse> {
  const response = await fetch(
    `${BACKEND_API_BASE_URL}${CODE_REVIEW_API_PATH}/plan`,
    {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload),
    },
  );

  await assertJsonResponseOk(response);
  return response.json();
}

export async function startCodeReviewStream(
  payload: CodeReviewRequest,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `${BACKEND_API_BASE_URL}${CODE_REVIEW_API_PATH}/start`,
    {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload),
      signal,
    },
  );

  await assertJsonResponseOk(response);
  return response;
}

export async function continueCodeReviewStream(
  reviewId: string,
  payload: ContinuePayload = { reviewId, resume: { confirmed: true } },
  signal?: AbortSignal,
) {
  const response = await fetch(
    `${BACKEND_API_BASE_URL}${CODE_REVIEW_API_PATH}/${reviewId}/continue`,
    {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(payload),
      signal,
    },
  );

  await assertJsonResponseOk(response);
  return response;
}

export async function getCodeReviewRun(
  reviewId: string,
): Promise<CodeReviewRunSnapshot> {
  const response = await fetch(
    `${BACKEND_API_BASE_URL}${CODE_REVIEW_API_PATH}/${reviewId}`,
    {
      method: 'GET',
      headers: buildAuthHeaders(),
    },
  );

  await assertJsonResponseOk(response);
  return response.json();
}
