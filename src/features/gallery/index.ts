/**
 * Gallery Feature — Phase 3 implementation stubs
 *
 * GalleryRoot  → folder list view
 * FolderView   → photo grid within a folder
 * PhotoViewer  → full-screen photo with metadata
 */

import { foldersDB } from '../../core/db/folders.js'
import { photosDB } from '../../core/db/photos.js'
import { events } from '../../ui/events.js'
import { toast } from '../../ui/toast.js'
import { router } from '../../ui/router.js'
import type { Folder, Photo } from '../../types/index.js'
import { formatDMS, formatAccuracy, formatTimestamp } from '../../core/geo/formatter.js'

// =============================================================================
// GalleryRoot — Folder list
// =============================================================================
export class GalleryRoot {
  private container: HTMLElement | null = null
  private unsubscribers: Array<() => void> = []

  async mount(container: HTMLElement): Promise<void> {
    this.container = container
    container.innerHTML = `
      <div class="gallery-root">
        <header class="screen-header">
          <h1>Gallery</h1>
          <button class="btn-icon" id="btn-new-folder" aria-label="New folder">＋ Folder</button>
        </header>
        <div id="folder-list" class="folder-list"></div>
      </div>
    `

    container.querySelector('#btn-new-folder')?.addEventListener('click', () => this.createFolder())
    this.unsubscribers.push(
      events.on('photo:deleted', () => this.render()),
      events.on('folder:deleted', () => this.render()),
    )

    await this.render()
  }

  private async render(): Promise<void> {
    const listEl = this.container?.querySelector<HTMLElement>('#folder-list')
    if (!listEl) return

    const [folders, allPhotos] = await Promise.all([
      foldersDB.getAllFolders(),
      photosDB.getPhotosByFolder(null),
    ])

    listEl.innerHTML = ''

    // "All photos" virtual folder
    const totalCount = (await photosDB.getAllPhotos()).length
    listEl.appendChild(this.buildFolderCard(null, 'All Photos', totalCount, null))

    // User folders
    for (const folder of folders) {
      const photos = await photosDB.getPhotosByFolder(folder.id)
      const cover = folder.coverPhotoId
        ? await photosDB.getPhoto(folder.coverPhotoId)
        : photos[0] ?? null
      listEl.appendChild(this.buildFolderCard(folder.id, folder.name, photos.length, cover))
    }

    // Uncategorized
    if (allPhotos.length > 0) {
      listEl.appendChild(this.buildFolderCard('uncategorized', 'Uncategorized', allPhotos.length, allPhotos[0] ?? null))
    }
  }

  private buildFolderCard(
    id: number | string | null,
    name: string,
    count: number,
    cover: Photo | null
  ): HTMLElement {
    const card = document.createElement('div')
    card.className = 'folder-card'
    card.innerHTML = `
      <div class="folder-thumb">
        ${cover ? `<img class="lazy-thumb" data-id="${cover.id}" alt="">` : '<div class="folder-empty-thumb">📁</div>'}
      </div>
      <div class="folder-info">
        <span class="folder-name">${escHtml(name)}</span>
        <span class="folder-count">${count} photo${count !== 1 ? 's' : ''}</span>
      </div>
    `

    // Lazy-load thumbnail
    const img = card.querySelector<HTMLImageElement>('img.lazy-thumb')
    if (img && cover) {
      loadThumb(cover.id, img)
    }

    card.addEventListener('click', () => {
      if (id === null) router.navigate('#/gallery/all')
      else if (id === 'uncategorized') router.navigate('#/gallery/uncategorized')
      else router.navigate(`#/gallery/${id}`)
    })

    return card
  }

  private async createFolder(): Promise<void> {
    const name = prompt('Folder name:')?.trim()
    if (!name) return
    await foldersDB.addFolder(name)
    await this.render()
  }

  unmount(): void {
    this.unsubscribers.forEach(fn => fn())
    this.unsubscribers = []
    // Revoke any blob URLs
    this.container?.querySelectorAll<HTMLImageElement>('img[src^="blob:"]').forEach(img => {
      URL.revokeObjectURL(img.src)
    })
  }
}

// =============================================================================
// FolderView — Photo thumbnail grid
// =============================================================================
export class FolderView {
  private folderId: number | null
  private container: HTMLElement | null = null
  private observer: IntersectionObserver | null = null
  private objectUrls: string[] = []

  constructor(folderId: number) {
    // folderId 0 = uncategorized (null in DB), any other = real folder
    this.folderId = folderId === 0 ? null : folderId
  }

  async mount(container: HTMLElement): Promise<void> {
    this.container = container

    const folder = this.folderId ? await foldersDB.getFolder(this.folderId) : null
    const folderName = folder?.name ?? (this.folderId === null ? 'Uncategorized' : 'All Photos')
    const photos = this.folderId !== null
      ? await photosDB.getPhotosByFolder(this.folderId)
      : await photosDB.getPhotosByFolder(null)

    container.innerHTML = `
      <div class="folder-view">
        <header class="screen-header">
          <button class="btn-back" aria-label="Back">←</button>
          <h1>${escHtml(folderName)}</h1>
          <span>${photos.length}</span>
        </header>
        <div class="photo-grid" id="photo-grid"></div>
        ${photos.length === 0 ? '<div class="empty-state">No photos here yet</div>' : ''}
      </div>
    `

    container.querySelector('.btn-back')?.addEventListener('click', () => router.back())

    if (photos.length > 0) {
      this.setupGrid(container.querySelector<HTMLElement>('#photo-grid')!, photos)
    }
  }

  private setupGrid(grid: HTMLElement, photos: Photo[]): void {
    // Sort newest first
    const sorted = [...photos].sort((a, b) => b.createdAt - a.createdAt)

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement
          const photoId = Number(img.dataset.id)
          loadThumb(photoId, img)
          this.observer?.unobserve(img)
        }
      })
    }, { rootMargin: '200px' })

    for (const photo of sorted) {
      const cell = document.createElement('div')
      cell.className = 'photo-cell'

      const img = document.createElement('img')
      img.dataset.id = String(photo.id)
      img.alt = ''
      img.loading = 'lazy'
      this.observer.observe(img)

      cell.appendChild(img)
      cell.addEventListener('click', () => router.navigate(`#/photo/${photo.id}`))
      grid.appendChild(cell)
    }
  }

  unmount(): void {
    this.observer?.disconnect()
    this.container?.querySelectorAll<HTMLImageElement>('img[src^="blob:"]').forEach(img => {
      URL.revokeObjectURL(img.src)
    })
  }
}

// =============================================================================
// PhotoViewer — Full-screen single photo
// =============================================================================
export class PhotoViewer {
  private photoId: number
  private container: HTMLElement | null = null
  private blobUrl: string | null = null

  constructor(photoId: number) {
    this.photoId = photoId
  }

  async mount(container: HTMLElement): Promise<void> {
    this.container = container

    const photo = await photosDB.getPhoto(this.photoId)
    if (!photo) {
      container.innerHTML = '<div class="error-state">Photo not found</div>'
      return
    }

    this.blobUrl = URL.createObjectURL(photo.imageBlob)

    const { metadata: m, description, createdAt, size } = photo
    const coordLine = m.lat !== null && m.lng !== null
      ? formatDMS(m.lat, m.lng)
      : 'No GPS'
    const accLine = m.accuracy !== null ? formatAccuracy(m.accuracy) : ''
    const altLine = m.altitude !== null ? `${m.altitude.toFixed(1)} m alt` : ''

    container.innerHTML = `
      <div class="photo-viewer">
        <header class="viewer-header">
          <button class="btn-back" aria-label="Back">←</button>
          <span class="viewer-date">${formatTimestamp(createdAt)}</span>
          <button class="btn-menu" aria-label="More options">⋮</button>
        </header>

        <div class="viewer-image-wrap">
          <img class="viewer-image" src="${this.blobUrl}" alt="Captured photo">
        </div>

        <div class="viewer-meta">
          <div class="meta-coords">${escHtml(coordLine)}</div>
          ${accLine ? `<div class="meta-accuracy">${escHtml(accLine)}${altLine ? ' · ' + escHtml(altLine) : ''}</div>` : ''}
          ${description ? `<div class="meta-desc">"${escHtml(description)}"</div>` : ''}
          <div class="meta-size">${formatBytes(size)}</div>
        </div>

        <div class="viewer-actions">
          <button class="btn-delete" id="btn-delete">🗑 Delete</button>
          <button class="btn-download" id="btn-download">⬇ Save</button>
        </div>
      </div>
    `

    container.querySelector('.btn-back')?.addEventListener('click', () => router.back())
    container.querySelector('#btn-delete')?.addEventListener('click', () => this.deletePhoto(photo))
    container.querySelector('#btn-download')?.addEventListener('click', () => this.downloadPhoto(photo))
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
    const ts = new Date(photo.createdAt)
    const name = `geoxam_${ts.getFullYear()}-${pad(ts.getMonth()+1)}-${pad(ts.getDate())}_${pad(ts.getHours())}-${pad(ts.getMinutes())}-${pad(ts.getSeconds())}.jpg`
    a.download = name
    a.click()
  }

  unmount(): void {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl)
      this.blobUrl = null
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Load thumbnail blob from DB and set as img src */
async function loadThumb(photoId: number, img: HTMLImageElement): Promise<void> {
  try {
    const photo = await photosDB.getPhoto(photoId)
    if (!photo) return
    const url = URL.createObjectURL(photo.thumbnailBlob)
    img.src = url
    img.onload = () => {}
  } catch {
    // Non-critical — thumbnail just won't load
  }
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
