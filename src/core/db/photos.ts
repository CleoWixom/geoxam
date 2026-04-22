import { getDB } from './index.js'
import type { Photo, NewPhoto, StorageStats } from '../../types/index.js'

class PhotosDB {
  async addPhoto(data: NewPhoto): Promise<number> {
    const db = await getDB()
    return (db.add('photos', data as Photo) as unknown) as Promise<number>
  }

  async getPhoto(id: number): Promise<Photo | undefined> {
    const db = await getDB()
    return db.get('photos', id)
  }

  async getPhotosByFolder(folderId: number | null): Promise<Photo[]> {
    const db = await getDB()
    return db.getAllFromIndex('photos', 'by-folder', folderId)
  }

  async getAllPhotos(): Promise<Photo[]> {
    const db = await getDB()
    return db.getAll('photos')
  }

  async deletePhoto(id: number): Promise<void> {
    const db = await getDB()
    await db.delete('photos', id)
  }

  async moveToFolder(id: number, folderId: number | null): Promise<void> {
    const db = await getDB()
    const tx = db.transaction('photos', 'readwrite')
    const photo = await tx.store.get(id)
    if (photo) {
      photo.folderId = folderId
      await tx.store.put(photo)
    }
    await tx.done
  }

  /** Returns bytes used by all imageBlobs + count of photos */
  async getStorageStats(): Promise<StorageStats> {
    const db = await getDB()
    const all = await db.getAll('photos')

    let used = 0
    for (const photo of all) {
      used += photo.size
    }

    const stats: StorageStats = { used, count: all.length }

    // Attempt to get browser storage estimate
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate()
        stats.estimate = {
          usage: estimate.usage ?? 0,
          quota: estimate.quota ?? 0,
        }
      } catch {
        // estimate not available — not critical
      }
    }

    return stats
  }

  async deleteAll(): Promise<void> {
    const db = await getDB()
    await db.clear('photos')
  }
}

export const photosDB = new PhotosDB()
