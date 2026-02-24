/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_INWORLD_API_KEY: string;
  readonly VITE_INWORLD_SECRET_KEY: string;
  readonly VITE_INWORLD_VOICE_ID: string;
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_PINECONE_API_KEY: string;
  readonly VITE_PINECONE_HOST: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
