export interface AsrHealthResponse {
  status: string
  model_loaded: boolean
  model_error?: string | null
}

export interface AsrModelInfo {
  modelId: string
  modelDir: string
  exists: boolean
}

export interface AsrTranscribeResponse {
  text: string
  language: string
  elapsed_ms?: number
}
