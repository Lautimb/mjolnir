import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'
import { AppError } from '../../shared/errors'
import { isTrustedSender } from '../security'

type Schemas = readonly z.ZodType[]
type Args<S extends Schemas> = { -readonly [K in keyof S]: z.infer<S[K]> }

export function parseArgs<S extends Schemas>(schemas: S, args: unknown[]): Args<S> | null {
  if (args.length > schemas.length) return null
  const parsed: unknown[] = []
  for (const [index, schema] of schemas.entries()) {
    const result = schema.safeParse(args[index])
    if (!result.success) return null
    parsed.push(result.data)
  }
  return parsed as Args<S>
}

function accept<S extends Schemas>(event: IpcMainEvent | IpcMainInvokeEvent, schemas: S, args: unknown[]): Args<S> | null {
  return isTrustedSender(event.senderFrame) ? parseArgs(schemas, args) : null
}

export function handle<const S extends Schemas>(channel: string, schemas: S, handler: (...args: Args<S>) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    const parsed = accept(event, schemas, args)
    if (!parsed) throw new AppError('invalidRequest', { channel })
    return handler(...parsed)
  })
}

export function listen<const S extends Schemas>(channel: string, schemas: S, handler: (...args: Args<S>) => void): void {
  ipcMain.on(channel, (event, ...args) => {
    const parsed = accept(event, schemas, args)
    if (parsed) handler(...parsed)
  })
}
