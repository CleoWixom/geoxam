/**
 * Gallery — GalleryRoot, FolderView (with sort + multi-select), PhotoViewer
 */

import { foldersDB } from '../../core/db/folders.js'
import { photosDB } from '../../core/db/photos.js'
import { events } from '../../ui/events.js'
import { router } from '../../ui/router.js'
import { toast } from '../../ui/toast.js'
import {
  formatDMS, formatAccuracy, formatAltitude, formatTimestamp,
} from '../../core/geo/formatter.js'
import type { Folder, Photo } from '../../types/index.js'

type SortKey = 'date-desc' | 'date-asc' | 'size-desc' | 'size-asc'

function sortPhotos(photos: Photo[], key: SortKey): Photo[] {
  return photos.slice().sort((a, b) => {
    switch (key) {
      case 'date-desc': return b.createdAt - a.createdAt
      case 'date-asc':  return a.createdAt - b.createdAt
      case 'size-desc': return b.size - a.size
      case 'size-asc':  return a.size - b.size
    }
  })
}

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
    container.querySelector('#btn-new-folder')!
      .addEventListener('click', () => this.createFolder())

    this.unsubs.push(
      events.on('photo:saved',    () => this.renderList()),
      events.on('photo:deleted',  () => this.renderList()),
      events.on('folder:deleted', () => this.renderList()),
    )
    await this.renderList()
  }

  private async renderList(): Promise<void> {
    const listEl = this.container?.querySelector<HTMLElement>('#folder-list')
    if (!listEl) return

    // Revoke old blob URLs before clearing
    revokeBlobsIn(listEl)
    listEl.innerHTML = ''

    const [folders, allPhotos] = await Promise.all([
      foldersDB.getAllFolders(),
      photosDB.getAllPhotos(),
    ])

    const byNewest = allPhotos.slice().sort((a, b) => b.createdAt - a.createdAt)
    const uncategorized = allPhotos.filter(p => p.folderId === null)

    // "All Photos" virtual folder
    listEl.appendChild(
      this.folderCard('all', 'All Photos', allPhotos.length, byNewest[0] ?? null, '#/gallery/all')
    )

    // User folders (newest-created first)
    for (const folder of folders.slice().reverse()) {
      const photosInFolder = allPhotos
        .filter(p => p.folderId === folder.id)
        .sort((a, b) => b.createdAt - a.createdAt)
      const cover = folder.coverPhotoId
        ? allPhotos.find(p => p.id === folder.coverPhotoId) ?? photosInFolder[0] ?? null
        : photosInFolder[0] ?? null

      const card = this.folderCard(
        String(folder.id), folder.name, photosInFolder.length, cover, `#/gallery/${folder.id}`
      )
      this.attachFolderMenu(card, folder)
      listEl.appendChild(card)
    }

    // Uncategorized (only if exists)
    if (uncategorized.length > 0) {
      const ucSorted = uncategorized.sort((a, b) => b.createdAt - a.createdAt)
      listEl.appendChild(
        this.folderCard('0', 'Uncategorized', uncategorized.length, ucSorted[0], '#/gallery/0')
      )
    }
  }

  private folderCard(
    _id: string, name: string, count: number,
    cover: Photo | null, route: string
  ): HTMLElement {
    const card = document.createElement('div')
    card.className = 'folder-card'

    const thumb = cover
      ? `<img alt="" data-photo-id="${cover.id}">`
      : `<div class="folder-empty-thumb">📁</div>`

    card.innerHTML = /* html */`
      <div class="folder-thumb">${thumb}</div>
      <div class="folder-info">
        <span class="folder-name">${esc(name)}</span>
        <span class="folder-count">${count} photo${count !== 1 ? 's' : ''}</span>
      </div>
    `

    const img = card.querySelector<HTMLImageElement>('img[data-photo-id]')
    if (img && cover) loadThumb(cover, img)

    card.addEventListener('click', () => router.navigate(route))
    return card
  }

  private attachFolderMenu(card: HTMLElement, folder: Folder): void {
    const btn = document.createElement('button')
    btn.className = 'btn-menu'
    btn.textContent = '⋯'
    btn.addEventListener('click', e => { e.stopPropagation(); this.showFolderMenu(folder) })
    card.appendChild(btn)
  }

  private showFolderMenu(folder: Folder): void {
    const sheet = bottomSheet([
      { label: '✏️ Rename', onClick: async () => {
          const name = prompt('New name:', folder.name)?.trim()
          if (name) { await foldersDB.renameFolder(folder.id, name); await this.renderList() }
        }
      },
      { label: '🗂 Delete folder (keep photos)', color: 'var(--clr-warn)', onClick: async () => {
          if (!confirm(`Delete "${folder.name}"? Photos move to Uncategorized.`)) return
          await foldersDB.deleteFolder(folder.id, false)
          events.emit('folder:deleted', folder.id)
        }
      },
      { label: '🗑 Delete folder + all photos', color: 'var(--clr-accent)', onClick: async () => {
          if (!confirm(`Delete "${folder.name}" and ALL photos? Cannot be undone.`)) return
          await foldersDB.deleteFolder(folder.id, true)
          events.emit('folder:deleted', folder.id)
        }
      },
    ])
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
// FolderView — photo grid with sort + multi-select
// =============================================================================
export class FolderView {
  private readonly routeId: string
  private container: HTMLElement | null = null
  private observer: IntersectionObserver | null = null
  private photos: Photo[] = []
  private sortKey: SortKey = 'date-desc'
  private selected = new Set<number>()
  private multiSelect = false

  constructor(routeId: string) { this.routeId = routeId }

  async mount(container: HTMLElement): Promise<void> {
    this.container = container
    const { photos, title } = await this.loadPhotos()
    this.photos = sortPhotos(photos, this.sortKey)

    container.innerHTML = /* html */`
      <div class="folder-view">
        <header class="screen-header">
          <button class="btn-back" aria-label="Back">←</button>
          <h1>${esc(title)}</h1>
          <button class="btn-icon" id="btn-sort">Sort ▾</button>
        </header>
        <div class="photo-grid" id="photo-grid"></div>
        <div class="bulk-bar" id="bulk-bar" style="display:none">
          <span id="bulk-count">0 selected</span>
          <button id="bulk-delete" class="btn-destructive" style="padding:8px 16px;">🗑 Delete</button>
          <button id="bulk-cancel" class="btn-secondary" style="padding:8px 16px;">Cancel</button>
        </div>
        ${photos.length === 0 ? '<div class="empty-state">No photos here yet</div>' : ''}
      </div>
    `

    container.querySelector('.btn-back')!.addEventListener('click', () => router.back())
    container.querySelector('#btn-sort')!.addEventListener('click', () => this.showSortMenu())
    container.querySelector('#bulk-delete')!.addEventListener('click', () => this.deleteSelected())
    container.querySelector('#bulk-cancel')!.addEventListener('click', () => this.exitMultiSelect())

    if (photos.length > 0) this.buildGrid()
  }

  private async loadPhotos(): Promise<{ photos: Photo[]; title: string }> {
    if (this.routeId === 'all')
      return { photos: await photosDB.getAllPhotos(), title: 'All Photos' }
    if (this.routeId === '0')
      return { photos: await photosDB.getPhotosByFolder(null), title: 'Uncategorized' }
    const id = parseInt(this.routeId, 10)
    const folder = await foldersDB.getFolder(id)
    return { photos: await photosDB.getPhotosByFolder(id), title: folder?.name ?? 'Folder' }
  }

  private buildGrid(): void {
    const grid = this.container!.querySelector<HTMLElement>('#photo-grid')!
    revokeBlobsIn(grid)
    grid.innerHTML = ''

    this.observer?.disconnect()
    this.observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        const img = entry.target as HTMLImageElement
        const photo = this.photos.find(p => p.id === Number(img.dataset.id))
        if (photo) { loadThumb(photo, img); this.observer!.unobserve(img) }
      })
    }, { rootMargin: '300px' })

    for (const photo of this.photos) {
      const cell = document.createElement('div')
      cell.className = 'photo-cell'
      cell.dataset.id = String(photo.id)

      const img = document.createElement('img')
      img.dataset.id = String(photo.id)
      img.alt = ''

      const check = document.createElement('div')
      check.className = 'photo-check'
      check.innerHTML = '✓'

      cell.appendChild(img)
      cell.appendChild(check)

      // Long-press enters multi-select
      let pressTimer: ReturnType<typeof setTimeout> | null = null
      cell.addEventListener('pointerdown', () => {
        pressTimer = setTimeout(() => { this.enterMultiSelect(photo.id) }, 500)
      })
      cell.addEventListener('pointerup', () => { if (pressTimer) clearTimeout(pressTimer) })
      cell.addEventListener('pointermove', () => { if (pressTimer) clearTimeout(pressTimer) })

      cell.addEventListener('click', () => {
        if (this.multiSelect) this.toggleSelect(photo.id, cell)
        else router.navigate(`#/photo/${photo.id}`)
      })

      this.observer.observe(img)
      grid.appendChild(cell)
    }
  }

  private showSortMenu(): void {
    const opts: Array<{ label: string; key: SortKey }> = [
      { label: '📅 Newest first',   key: 'date-desc' },
      { label: '📅 Oldest first',   key: 'date-asc'  },
      { label: '📦 Largest first',  key: 'size-desc' },
      { label: '📦 Smallest first', key: 'size-asc'  },
    ]
    const sheet = bottomSheet(opts.map(o => ({
      label: (o.key === this.sortKey ? '✓ ' : '    ') + o.label,
      onClick: () => {
        this.sortKey = o.key
        this.photos = sortPhotos(this.photos, o.key)
        this.buildGrid()
      },
    })))
    document.body.appendChild(sheet)
  }

  private enterMultiSelect(firstId: number): void {
    this.multiSelect = true
    this.selected.clear()
    this.selected.add(firstId)
    this.container!.querySelector('.photo-grid')!.classList.add('multi-select')
    this.updateBulkBar()
    this.refreshCheckmarks()
    if ('vibrate' in navigator) navigator.vibrate(30)
  }

  private exitMultiSelect(): void {
    this.multiSelect = false
    this.selected.clear()
    this.container!.querySelector('.photo-grid')!.classList.remove('multi-select')
    this.updateBulkBar()
    this.refreshCheckmarks()
  }

  private toggleSelect(id: number, cell: HTMLElement): void {
    if (this.selected.has(id)) this.selected.delete(id)
    else this.selected.add(id)
    cell.classList.toggle('selected', this.selected.has(id))
    this.updateBulkBar()
    if (this.selected.size === 0) this.exitMultiSelect()
  }

  private refreshCheckmarks(): void {
    this.container?.querySelectorAll<HTMLElement>('.photo-cell').forEach(cell => {
      const id = Number(cell.dataset.id)
      cell.classList.toggle('selected', this.selected.has(id))
    })
  }

  private updateBulkBar(): void {
    const bar = this.container!.querySelector<HTMLElement>('#bulk-bar')!
    const count = this.container!.querySelector<HTMLElement>('#bulk-count')!
    bar.style.display = this.multiSelect ? 'flex' : 'none'
    count.textContent = `${this.selected.size} selected`
  }

  private async deleteSelected(): Promise<void> {
    const ids = [...this.selected]
    if (!confirm(`Delete ${ids.length} photo${ids.length !== 1 ? 's' : ''}?`)) return
    await Promise.all(ids.map(id => photosDB.deletePhoto(id)))
    ids.forEach(id => events.emit('photo:deleted', id))
    this.photos = this.photos.filter(p => !ids.includes(p.id))
    this.exitMultiSelect()
    this.buildGrid()
    toast(`${ids.length} photo${ids.length !== 1 ? 's' : ''} deleted`, 'success')
  }

  unmount(): void {
    this.observer?.disconnect()
    revokeBlobsIn(this.container)
  }
}

// =============================================================================
// PhotoViewer — full-screen with metadata
// =============================================================================
export class PhotoViewer {
  private readonly photoId: number
  private blobUrl: string | null = null

  constructor(photoId: number) { this.photoId = photoId }

  async mount(container: HTMLElement): Promise<void> {
    const photo = await photosDB.getPhoto(this.photoId)
    if (!photo) {
      container.innerHTML = '<div class="error-state">Photo not found</div>'
      return
    }

    this.blobUrl = URL.createObjectURL(photo.imageBlob)
    const { metadata: m, description, createdAt, size } = photo

    const coordLine = m.lat !== null && m.lng !== null
      ? formatDMS(m.lat, m.lng) : 'No GPS'
    const accLine   = m.accuracy  !== null ? formatAccuracy(m.accuracy)          : null
    const altLine   = m.altitude  !== null ? formatAltitude(m.altitude, m.altitudeAccuracy) : null

    container.innerHTML = /* html */`
      <div class="photo-viewer">
        <header class="viewer-header">
          <button class="btn-back">←</button>
          <span class="viewer-date">${esc(formatTimestamp(createdAt))}</span>
          <button class="btn-menu" id="btn-menu">⋯</button>
        </header>
        <div class="viewer-image-wrap">
          <img class="viewer-image" src="${this.blobUrl}" alt="Captured photo" draggable="false">
        </div>
        <div class="viewer-meta">
          <div class="meta-coords">${esc(coordLine)}</div>
          ${accLine || altLine
            ? `<div class="meta-accuracy">${([accLine, altLine] as (string|null)[]).filter((x): x is string => x !== null).map(esc).join(' · ')}</div>`
            : ''}
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
    const sheet = bottomSheet([
      { label: '⬇ Save to device', onClick: () => this.downloadPhoto(photo) },
      { label: '↗ Share', onClick: async () => {
          if (!this.blobUrl) return
          if ('share' in navigator) {
            const file = new File([photo.imageBlob], photoFilename(photo), { type: 'image/jpeg' })
            await navigator.share({ files: [file] }).catch(() => {})
          } else {
            this.downloadPhoto(photo)
          }
        }
      },
      { label: '🗑 Delete', color: 'var(--clr-accent)',
        onClick: () => this.deletePhoto(photo) },
    ])
    document.body.appendChild(sheet)
  }

  unmount(): void {
    if (this.blobUrl) { URL.revokeObjectURL(this.blobUrl); this.blobUrl = null }
  }
}

// =============================================================================
// Shared helpers
// =============================================================================

function loadThumb(photo: Photo, img: HTMLImageElement): void {
  const url = URL.createObjectURL(photo.thumbnailBlob)
  img.src = url
  img.onload = () => URL.revokeObjectURL(url)
  img.onerror = () => URL.revokeObjectURL(url)
}

function revokeBlobsIn(el: HTMLElement | null): void {
  el?.querySelectorAll<HTMLImageElement>('img[src^="blob:"]')
    .forEach(img => URL.revokeObjectURL(img.src))
}

/** Reusable bottom action sheet */
function bottomSheet(actions: Array<{ label: string; color?: string; onClick: () => void }>): HTMLElement {
  const sheet = document.createElement('div')
  sheet.style.cssText =
    'position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;'

  const inner = document.createElement('div')
  inner.style.cssText =
    'width:100%;background:var(--clr-surface-2);border-radius:20px 20px 0 0;' +
    'padding:8px 0 calc(16px + env(safe-area-inset-bottom));'

  for (const action of actions) {
    const btn = document.createElement('button')
    btn.textContent = action.label
    btn.style.cssText =
      `width:100%;padding:16px 20px;text-align:left;font-size:16px;color:${action.color ?? 'var(--clr-text)'};`
    btn.addEventListener('click', () => { sheet.remove(); action.onClick() })
    inner.appendChild(btn)
  }

  sheet.appendChild(inner)
  sheet.addEventListener('click', e => { if (e.target === sheet) sheet.remove() })
  return sheet
}

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1_048_576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1_048_576).toFixed(1)} MB`
}

function photoFilename(photo: Photo): string {
  const d = new Date(photo.createdAt)
  const p = (n: number) => String(n).padStart(2, '0')
  return `geoxam_${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.jpg`
}
