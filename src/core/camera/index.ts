import type { CameraConstraints, FacingMode, ResolutionPreset } from '../../types/index.js'

// =============================================================================
// Resolution Presets
// =============================================================================
export const RESOLUTION_PRESETS: Record<ResolutionPreset, { width: number; height: number }> = {
  low:    { width: 1280,  height: 720  },
  medium: { width: 1920,  height: 1080 },
  high:   { width: 3840,  height: 2160 },
  max:    { width: 99999, height: 99999 },
}

// =============================================================================
// CameraService
// =============================================================================
class CameraService {
  private stream: MediaStream | null = null
  private videoEl: HTMLVideoElement | null = null
  private currentFacing: FacingMode = 'environment'

  /**
   * Start camera stream.
   * @returns The video element with the stream attached (hidden, not yet in DOM)
   */
  async start(constraints: CameraConstraints): Promise<HTMLVideoElement> {
    // Stop any existing stream first
    this.stop()

    this.currentFacing = constraints.facing

    const mediaConstraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: constraints.facing },
        width:  { ideal: constraints.width },
        height: { ideal: constraints.height },
      },
      audio: false,
    }

    this.stream = await navigator.mediaDevices.getUserMedia(mediaConstraints)

    const video = document.createElement('video')
    video.srcObject = this.stream
    video.playsInline = true
    video.muted = true
    video.autoplay = true

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Video failed to load'))
    })

    await video.play()

    this.videoEl = video
    return video
  }

  /** Stop stream and release camera hardware. */
  stop(): void {
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
    if (this.videoEl) {
      this.videoEl.srcObject = null
      this.videoEl = null
    }
  }

  /** Switch between front and back camera. */
  async switchFacing(constraints: Omit<CameraConstraints, 'facing'>): Promise<HTMLVideoElement> {
    const nextFacing: FacingMode = this.currentFacing === 'environment' ? 'user' : 'environment'
    return this.start({ ...constraints, facing: nextFacing })
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoEl
  }

  getStream(): MediaStream | null {
    return this.stream
  }

  isActive(): boolean {
    return this.stream !== null && this.stream.active
  }

  getCurrentFacing(): FacingMode {
    return this.currentFacing
  }
}

export const cameraService = new CameraService()
