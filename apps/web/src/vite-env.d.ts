/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ALLOW_PARTIAL_POSE_FALLBACK?: string;
  readonly VITE_ENABLE_PERSON_GATE?: string;
  readonly VITE_MEDIAPIPE_DELEGATE?: string;
  readonly VITE_MEDIAPIPE_WASM_URL?: string;
  readonly VITE_PERSON_DETECT_EVERY_MS?: string;
  readonly VITE_PERSON_MODEL_URL?: string;
  readonly VITE_POSE_DETECT_EVERY_MS?: string;
  readonly VITE_POSE_MODEL_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
