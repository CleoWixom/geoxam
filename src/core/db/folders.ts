import { getDB } from './index.js'
import type { Folder, NewFolder } from '../../types/index.js'

class FoldersDB {
  async addFolder(name: string): Promise<number> {
    const data: NewFolder = {
      name: name.trim(),
      createdAt: Date.now(),
      coverPhotoId: null,
    }
    const db = await getDB()
    return db.add('folders', data as Folder)
  }

  async getFolder(id: number): Promise<Folder | undefined> {
    const db = await getDB()
    return db.get('folders', id)
  }

  async getAllFolders(): Promise<Folder[]> {
    const db = await getDB()
    return db.getAllFromIndex('folders', 'by-date')
  }

  async renameFolder(id: number, name: string): Promise<void> {
    const db = await getDB()
    const tx = db.transaction('folders', 'readwrite')
    const folder = await tx.store.get(id)
    if (folder) {
      folder.name = name.trim()
      await tx.store.put(folder)
    }
    await tx.done
  }

  async updateCover(id: number, photoId: number | null): Promise<void> {
    const db = await getDB()
    const tx = db.transaction('folders', 'readwrite')
    const folder = await tx.store.get(id)
    if (folder) {
      folder.coverPhotoId = photoId
      await tx.store.put(folder)
    }
    await tx.done
  }

  /**
   * Delete a folder.
   * @param id - Folder ID
   * @param deletePhotos - If true, also delete all photos in this folder.
   *                       If false, photos are moved to uncategorized (folderId = null).
   */
  async deleteFolder(id: number, deletePhotos: boolean): Promise<void> {
    const db = await getDB()

    if (deletePhotos) {
      // Delete all photos in folder
      const tx = db.transaction(['folders', 'photos'], 'readwrite')
      const photosInFolder = await tx.objectStore('photos').index('by-folder').getAll(id)
      for (const photo of photosInFolder) {
        await tx.objectStore('photos').delete(photo.id)
      }
      await tx.objectStore('folders').delete(id)
      await tx.done
    } else {
      // Move photos to uncategorized
      const tx = db.transaction(['folders', 'photos'], 'readwrite')
      const photosInFolder = await tx.objectStore('photos').index('by-folder').getAll(id)
      for (const photo of photosInFolder) {
        photo.folderId = null
        await tx.objectStore('photos').put(photo)
      }
      await tx.objectStore('folders').delete(id)
      await tx.done
    }
  }
}

export const foldersDB = new FoldersDB()
