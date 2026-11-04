import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, nativeImage } from 'electron'

const dir = path.resolve(import.meta.dirname, '../apps/desktop/resources')
const RENDER_SIZE = 1024
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length + 16 * images.length
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)])
}

app.disableHardwareAcceleration()

async function generate() {
  const svg = readFileSync(path.join(dir, 'icon.svg')).toString('base64')
  const win = new BrowserWindow({
    show: false,
    width: RENDER_SIZE,
    height: RENDER_SIZE,
    useContentSize: true,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  })
  const html = `<style>html,body{margin:0;background:transparent}img{display:block;width:100vw;height:100vh}</style><img src="data:image/svg+xml;base64,${svg}">`
  await win.loadURL(`data:text/html,${encodeURIComponent(html)}`)
  await new Promise((resolve) => setTimeout(resolve, 300))

  const capture = await win.webContents.capturePage()
  const master = nativeImage.createFromBuffer(capture.toPNG())
  const resize = (size) => master.resize({ width: size, height: size, quality: 'best' }).toPNG()

  writeFileSync(path.join(dir, 'icon.png'), resize(512))
  writeFileSync(path.join(dir, 'icon.ico'), ico(ICO_SIZES.map((size) => ({ size, png: resize(size) }))))
  console.log(`icon.png e icon.ico generados en ${dir} (captura de ${master.getSize().width}px)`)
  app.quit()
}

void app.whenReady().then(generate)
