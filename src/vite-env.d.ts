/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly QWEN_API_KEY: string
  readonly QWEN_BASE_URL?: string
  readonly QWEN_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
