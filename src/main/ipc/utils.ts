import { ZodError } from 'zod'

interface ParseSchema<T> {
  parse: (value: unknown) => T
}

export function parsePayload<T>(
  channel: string,
  payload: unknown,
  schema: ParseSchema<T>,
): T {
  try {
    return schema.parse(payload)
  }
  catch (error) {
    if (error instanceof ZodError) {
      throw new Error(`[ipc:${channel}] Invalid payload: ${error.message}`)
    }
    throw error
  }
}
