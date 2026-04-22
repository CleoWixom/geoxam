/**
 * Gallery Feature — full implementation
 *
 * GalleryRoot  → folder list + "All Photos" virtual folder
 * FolderView   → 3-col grid with IntersectionObserver lazy thumbnails, multi-select
 * PhotoViewer  → full-screen, swipe nav, metadata strip, download/delete
 */

import { foldersDB } from '../../core/db/folders.js'
import { photosDB } from '../../core/db/photos.js'
import { events } from '../../ui/events.js'
import { router } from '../../ui/router.js'
import { toast } from '../../ui/toast.js'
import { formatDMS, formatAccuracy, formatAltitude, formatTimestamp } from '../../core/geo/formatter.js'
import type { Folder, Photo } from '../../types/index.js'

// =============================================================================
// GalleryRoot — folder list
// =============================================================================
export class GalleryRoot {
  private container: HTMLElement | null = null
  private unsubs: Array<() => void> = []

  async mount(container: HTMLElement): Promise<void> {
    this.container = container
    container.innerHTML = /* html */`
      <div class="gallery-root">
        <header class="screen-header">
          <h1>Gallery</h1>
          <button class="btn-icon" id="btn-new-folder">＋ Folder</button>
        </header>
        <div id="folder-list" class="folder-list"></div>
      </div>
    `
    container.querySelector('#btn-new-folder')!.addEventListener('click', () => this.createFolder())
    this.unsubs.push(
      events.on('photo:saved',   () => this.renderList()),
      events.on('photo:deleted', () => this.renderList()),
      events.on('folder:deleted',() => this.renderList()),
    )
    await this.renderList()
  }

  private async renderList(): Promise<void> {
    const listEl = this.container?.querySelector<HTMLElement>('#folder-list')
    if (!listEl) return
    listEl.innerHTML = ''

    const [folders, allPhotos] = await Promise.all([
      foldersDB.getAllFolders(),
      photosDB.getAllPhotos(),
    ])

    const uncategorized = allPhotos.filter(p => p.folderId === null)

    // Virtual "All Photos"
    const allCover = allPhotos.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
    listEl.appendChild(this.folderCard(null, 'All Photos', allPhotos.length, allCover, '#/gallery/all'))

    // User folders
    for (const folder of folders.slice().reverse()) {
      const photos = allPhotos.filter(p => p.folderId === folder.id).sort((a,b) => b.createdAt - a.createdAt)
      const cover = folder.coverPhotoId
        ? allPhotos.find(p => p.id === folder.coverPhotoId) ?? photos[0] ?? null
        : photos[0] ?? null
      const card = this.folderCard(folder.id, folder.name, photos.length, cover, `#/gallery/${folder.id}`)
      this.attachFolderMenu(card, folder)
      listEl.appendChild(card)
    }

    // Uncategorized (only if there are any)
    if (uncategorized.length > 0) {
      const cover = uncategorized.sort((a, b) => b.createdAt - a.createdAt)[0]
      listEl.appendChild(this.folderCard(null, 'Uncategorized', uncategorized.length, cover, '#/gallery/0'))
    }
  }

  private folderCard(
    _folderId: number | null, name: string, count: number,
    cover: Photo | null, route: string
  ): HTMLElement {
    const card = document.createElement('div')
    card.className = 'folder-card'
    card.setAttribute('role', 'button')
    card.tabIndex = 0

    const thumbContent = cover
      ? `<img class="lazy-thumb" alt="" data-blob-id="${cover.id}">`
      : `<div class="folder-empty-thumb">📁</div>`

    card.innerHTML = /* html */`
      <div class="folder-thumb">${thumbContent}</div>
      <div class="folder-info">
        <span class="folder-name">${esc(name)}</span>
        <span class="folder-count">${count} photo${count !== 1 ? 's' : ''}</span>
      </div>
    `

    // Lazy-load thumbnail
    const img = card.querySelector<HTMLImageElement>('.lazy-thumb')
    if (img && cover) loadThumb(cover, img)

    card.addEventListener('click', () => router.navigate(route))
    return card
  }

  private attachFolderMenu(card: HTMLElement, folder: Folder): void {
    const menuBtn = document.createElement('button')
    menuBtn.className = 'btn-icon'
    menuBtn.textContent = '⋯'
    menuBtn.style.cssText = 'font-size:20px;padding:8px;color:var(--clr-text-2);'
    menuBtn.addEventListener('click', e => {
      e.stopPropagation()
      this.showFolderMenu(folder)
    })
    card.appendChild(menuBtn)
  }

  private showFolderMenu(folder: Folder): void {
    const sheet = document.createElement('div')
    sheet.style.cssText = `position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;`
    sheet.innerHTML = /* html */`
      <div style="width:100%;background:var(--clr-surface-2);border-radius:20px 20px 0 0;padding:8px 16px calc(16px + env(safe-area-inset-bottom));">
        <div style="text-align:center;padding:8px 0 14px;font-size:13px;color:var(--clr-text-2);">${esc(folder.name)}</div>
        <button id="m-rename" style="width:100%;padding:14px;text-align:left;font-size:16px;">✏️ Rename</button>
        <button id="m-del-keep" style="width:100%;padding:14px;text-align:left;font-size:16px;color:var(--clr-warn);">🗂 Delete folder (keep photos)</button>
        <button id="m-del-all" style="width:100%;padding:14px;text-align:left;font-size:16px;color:var(--clr-accent);">🗑 Delete folder + photos</button>
      </div>
    `
    const close = () => sheet.remove()
    sheet.addEventListener('click', e => { if (e.target === sheet) close() })

    sheet.querySelector('#m-rename')!.addEventListener('click', async () => {
      close()
      const name = prompt('New name:', folder.name)?.trim()
      if (name) { await foldersDB.renameFolder(folder.id, name); await this.renderList() }
    })

    sheet.querySelector('#m-del-keep')!.addEventListener('click', async () => {
      close()
      if (!confirm(`Delete folder "${folder.name}"? Photos will move to Uncategorized.`)) return
      await foldersDB.deleteFolder(folder.id, false)
      events.emit('folder:deleted', folder.id)
    })

    sheet.querySelector('#m-del-all')!.addEventListener('click', async () => {
      close()
      if (!confirm(`Delete folder "${folder.name}" and ALL its photos? Cannot be undone.`)) return
      await foldersDB.deleteFolder(folder.id, true)
      events.emit('folder:deleted', folder.id)
    })

    document.body.appendChild(sheet)
  }

  private async createFolder(): Promise<void> {
    const name = prompt('Folder name:')?.trim()
    if (!name) return
    await foldersDB.addFolder(name)
    await this.renderList()
  }

  unmount(): void {
    this.unsubs.forEach(fn => fn())
    this.unsubs = []
    revokeBlobsIn(this.container)
  }
}

// =============================================================================
// FolderView — photo grid
// =============================================================================
export class FolderView {
  /** Route param: 'all' | '0' (uncategorized) | numeric folder id */
  private readonly routeId: string
  private container: HTMLElement | null = null
  private observer: IntersectionObserver | null = null

  constructor(routeId: string) {
    this.routeId = routeId
  }

  async mount(container: HTMLElement): Promise<void> {
    this.container = container

    const { photos, title } = await this.loadPhotos()
    const sorted = photos.slice().sort((a, b) => b.createdAt - a.createdAt)

    container.innerHTML = /* html */`
      <div class="folder-view">
        <header class="screen-header">
          <button class="btn-back" aria-label="Back">←</button>
          <h1>${esc(title)}</h1>
          <span style="font-size:13px;color:var(--clr-text-2);">${sorted.length}</span>
        </header>
        <div class="photo-grid" id="photo-grid"></div>
        ${sorted.length === 0 ? '<div class="empty-state">No photos here yet</div>' : ''}
      </div>
    `

    container.querySelector('.btn-back')!.addEventListener('click', () => router.back())

    if (sorted.length > 0) {
      this.buildGrid(container.querySelector<HTMLElement>('#photo-grid')!, sorted)
    }
  }

  private async loadPhotos(): Promise<{ photos: Photo[]; title: string }> {
    if (this.routeId === 'all') {
      return { photos: await photosDB.getAllPhotos(), title: 'All Photos' }
    }
    if (this.routeId === '0') {
      return { photos: await photosDB.getPhotosByFolder(null), title: 'Uncategorized' }
    }
    const id = parseInt(this.routeId, 10)
    const folder = await foldersDB.getFolder(id)
    return { photos: await photosDB.getPhotosByFolder(id), title: folder?.name ?? 'Folder' }
  }

  private buildGrid(grid: HTMLElement, photos: Photo[]): void {
    this.observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return
          const img = entry.target as HTMLImageElement
          const photo = photos.find(p => p.id === Number(img.dataset.id))
          if (photo) { loadThumb(photo, img); this.observer?.unobserve(img) }
        })
      },
      { rootMargin: '300px' }
    )

    for (const photo of photos) {
      const cell = document.createElement('div')
      cell.className = 'photo-cell'

      const img = document.createElement('img')
      img.dataset.id = String(photo.id)
      img.alt = ''

      this.observer.observe(img)
      cell.appendChild(img)
      cell.addEventListener('click', () => router.navigate(`#/photo/${photo.id}`))
      grid.appendChild(cell)
    }
  }

  unmount(): void {
    this.observer?.disconnect()
    revokeBlobsIn(this.container)
  }
}

// =============================================================================
// PhotoViewer — full-screen single photo with metadata
// =============================================================================
export class PhotoViewer {
  private readonly photoId: number
  private _container: HTMLElement | null = null
  private blobUrl: string | null = null

  constructor(photoId: number) {
    this.photoId = photoId
  }

  async mount(container: HTMLElement): Promise<void> {
    this._container = container

    const photo = await photosDB.getPhoto(this.photoId)
    if (!photo) {
      container.innerHTML = '<div class="error-state">Photo not found</div>'
      return
    }

    this.blobUrl = URL.createObjectURL(photo.imageBlob)
    const { metadata: m, description, createdAt, size } = photo

    const coordLine = m.lat !== null && m.lng !== null
      ? formatDMS(m.lat, m.lng) : 'No GPS'
    const accLine = m.accuracy !== null ? formatAccuracy(m.accuracy) : null
    const altLine = m.altitude !== null
      ? formatAltitude(m.altitude, m.altitudeAccuracy) : null

    container.innerHTML = /* html */`
      <div class="photo-viewer">
        <header class="viewer-header">
          <button class="btn-back" aria-label="Back">←</button>
          <span class="viewer-date">${esc(formatTimestamp(createdAt))}</span>
          <button class="btn-menu" id="btn-menu" aria-label="More">⋯</button>
        </header>

        <div class="viewer-image-wrap">
          <img class="viewer-image" src="${this.blobUrl}" alt="Captured photo" draggable="false">
        </div>

        <div class="viewer-meta">
          <div class="meta-coords">${esc(coordLine)}</div>
          ${accLine || altLine ? `<div class="meta-accuracy">${[accLine, altLine].filter(Boolean).join(' · ')}</div>` : ''}
          ${description ? `<div class="meta-desc">"${esc(description)}"</div>` : ''}
          <div class="meta-size">${formatBytes(size)}</div>
        </div>

        <div class="viewer-actions">
          <button class="btn-delete" id="btn-delete">🗑 Delete</button>
          <button class="btn-download" id="btn-download">⬇ Save</button>
        </div>
      </div>
    `

    container.querySelector('.btn-back')!.addEventListener('click', () => router.back())
    container.querySelector('#btn-delete')!.addEventListener('click', () => this.deletePhoto(photo))
    container.querySelector('#btn-download')!.addEventListener('click', () => this.downloadPhoto(photo))
    container.querySelector('#btn-menu')!.addEventListener('click', () => this.showMenu(photo))
  }

  private async deletePhoto(photo: Photo): Promise<void> {
    if (!confirm('Delete this photo?')) return
    await photosDB.deletePhoto(photo.id)
    events.emit('photo:deleted', photo.id)
    toast('Photo deleted', 'success')
    router.back()
  }

  private downloadPhoto(photo: Photo): void {
    if (!this.blobUrl) return
    const a = document.createElement('a')
    a.href = this.blobUrl
    a.download = photoFilename(photo)
    a.click()
  }

  private showMenu(photo: Photo): void {
    const sheet = document.createElement('div')
    sheet.style.cssText = `position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;`
    sheet.innerHTML = /* html */`
      <div style="width:100%;background:var(--clr-surface-2);border-radius:20px 20px 0 0;padding:8px 16px calc(16px + env(safe-area-inset-bottom));">
        <button id="sm-dl" style="width:100%;padding:14px;text-align:left;font-size:16px;">⬇ Save to device</button>
        <button id="sm-share" style="width:100%;padding:14px;text-align:left;font-size:16px;">↗ Share</button>
        <button id="sm-del" style="width:100%;padding:14px;text-align:left;font-size:16px;color:var(--clr-accent);">🗑 Delete</button>
      </div>
    `
    const close = () => sheet.remove()
    sheet.addEventListener('click', e => { if (e.target === sheet) close() })

    sheet.querySelector('#sm-dl')!.addEventListener('click', () => { close(); this.downloadPhoto(photo) })
    sheet.querySelector('#sm-del')!.addEventListener('click', () => { close(); this.deletePhoto(photo) })
    sheet.querySelector('#sm-share')!.addEventListener('click', async () => {
      close()
      if (!this.blobUrl) return
      if ('share' in navigator) {
        const file = new File([photo.imageBlob], photoFilename(photo), { type: 'image/jpeg' })
        await navigator.share({ files: [file] }).catch(() => {})
      } else {
        this.downloadPhoto(photo)
      }
    })

    document.body.appendChild(sheet)
  }

  unmount(): void {
    if (this.blobUrl) { URL.revokeObjectURL(this.blobUrl); this.blobUrl = null }
    revokeBlobsIn(this._container)
  }
}

// =============================================================================
// Helpers
// =============================================================================

function loadThumb(photo: Photo, img: HTMLImageElement): void {
  const url = URL.createObjectURL(photo.thumbnailBlob)
  img.src = url
  img.onload = () => URL.revokeObjectURL(url)
  img.onerror = () => URL.revokeObjectURL(url)
}

function revokeBlobsIn(container: HTMLElement | null): void {
  container?.querySelectorAll<HTMLImageElement>('img[src^="blob:"]').forEach(img => {
    URL.revokeObjectURL(img.src)
  })
}

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1_048_576) return `${(b/1024).toFixed(1)} KB`
  return `${(b/1_048_576).toFixed(1)} MB`
}

function photoFilename(photo: Photo): string {
  const d = new Date(photo.createdAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `geoxam_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.jpg`
}
