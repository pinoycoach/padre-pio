/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_PINECONE_API_KEY: string;
  readonly VITE_PINECONE_HOST: string;
  // ElevenLabs TTS — API key and voice ID are server-side only (no VITE_ prefix, set in Vercel dashboard)
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
