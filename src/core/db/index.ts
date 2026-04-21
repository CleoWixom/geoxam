import { openDB, type IDBPDatabase } from 'idb'
import type { Photo, Folder } from '../../types/index.js'

// =============================================================================
// Database Schema Version — increment on every schema change
// =============================================================================
export const SCHEMA_VERSION = 1
export const DB_NAME = 'geoxam_db'

// Typed DB interface for idb
export interface GeoXamDB {
  photos: {
    key: number
    value: Photo
    indexes: {
      'by-folder': number | null
      'by-date': number
    }
  }
  folders: {
    key: number
    value: Folder
    indexes: {
      'by-date': number
    }
  }
  settings: {
    key: string
    value: { key: string; value: unknown }
  }
}

let _db: IDBPDatabase<GeoXamDB> | null = null

export async function getDB(): Promise<IDBPDatabase<GeoXamDB>> {
  if (_db) return _db

  _db = await openDB<GeoXamDB>(DB_NAME, SCHEMA_VERSION, {
    upgrade(db, oldVersion, _newVersion, _tx) {
      // -----------------------------------------------------------------------
      // Version 0 → 1: Initial schema
      // -----------------------------------------------------------------------
      if (oldVersion < 1) {
        const photos = db.createObjectStore('photos', {
          keyPath: 'id',
          autoIncrement: true,
        })
        photos.createIndex('by-folder', 'folderId')
        photos.createIndex('by-date', 'createdAt')

        const folders = db.createObjectStore('folders', {
          keyPath: 'id',
          autoIncrement: true,
        })
        folders.createIndex('by-date', 'createdAt')

        db.createObjectStore('settings', { keyPath: 'key' })
      }

      // Future migrations:
      // if (oldVersion < 2) { ... non-destructive additions only ... }
    },

    blocked() {
      console.warn('[GeoXam DB] Upgrade blocked by open tab')
    },

    blocking() {
      // Another tab is waiting for a newer schema — close this connection
      _db?.close()
      _db = null
      window.location.reload()
    },

    terminated() {
      console.error('[GeoXam DB] Connection terminated unexpectedly')
      _db = null
    },
  })

  return _db
}

/** Close DB (for testing / cleanup) */
export function closeDB(): void {
  _db?.close()
  _db = null
}
