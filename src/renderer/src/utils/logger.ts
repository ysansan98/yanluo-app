type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface RendererLogger {
  debug: (message: string, extra?: unknown) => void
  info: (message: string, extra?: unknown) => void
  warn: (message: string, extra?: unknown) => void
  error: (message: string, extra?: unknown) => void
}

function writeFallbackConsole(
  level: LogLevel,
  scope: string,
  message: string,
  extra?: unknown,
): void {
  const line = `[renderer:${scope}] ${message}`
  if (level === 'error') {
    console.error(line, extra ?? {})
    return
  }
  if (level === 'warn') {
    console.warn(line, extra ?? {})
    return
  }
  console.info(line, extra ?? {})
}

export function createRendererLogger(scope: string): RendererLogger {
  const emit = (level: LogLevel, message: string, extra?: unknown) => {
    writeFallbackConsole(level, scope, message, extra)
    void window.api.log[level](scope, message, extra).catch((error) => {
      writeFallbackConsole('warn', scope, 'failed to send renderer log to main', {
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }

  return {
    debug: (message, extra) => emit('debug', message, extra),
    info: (message, extra) => emit('info', message, extra),
    warn: (message, extra) => emit('warn', message, extra),
    error: (message, extra) => emit('error', message, extra),
  }
}
