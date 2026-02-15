import type { InjectResult, TextInjector } from './types'

export class StubTextInjector implements TextInjector {
  async inject(text: string): Promise<InjectResult> {
    if (!text.trim()) {
      return {
        ok: false,
        mode: 'CLIPBOARD_ONLY',
        reason: 'Empty text cannot be injected',
      }
    }

    return {
      ok: true,
      mode: 'CLIPBOARD_ONLY',
      reason: 'Stub injector currently uses clipboard fallback semantics',
    }
  }
}
