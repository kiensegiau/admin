class ChunkedVideoPlayer {
  constructor(videoElement, fileId) {
    this.video = videoElement;
    this.fileId = fileId;
    this.mediaSource = new MediaSource();
    this.sourceBuffer = null;
    this.metadata = null;
    this.loadedParts = new Set();
    this.loadingParts = new Set();
    this.pendingChunks = [];
    this.isInitialized = false;
    this.retryCount = 0;
    this.maxRetries = 3;

    // Bind methods
    this.handleSourceOpen = this.handleSourceOpen.bind(this);
    this.handleSeeking = this.handleSeeking.bind(this);
    this.handleTimeUpdate = this.handleTimeUpdate.bind(this);
    this.handleSourceBufferUpdate = this.handleSourceBufferUpdate.bind(this);

    this.init();
  }

  async init() {
    try {
      console.log("Initializing player...");

      // 1. Fetch metadata
      const response = await fetch(`/api/proxy/files?id=${this.fileId}`);
      if (!response.ok) throw new Error("Failed to fetch metadata");

      this.metadata = await response.json();
      console.log("Video metadata:", this.metadata);

      // 2. Setup MediaSource
      this.video.src = URL.createObjectURL(this.mediaSource);
      this.mediaSource.addEventListener("sourceopen", this.handleSourceOpen);

      // 3. Setup event listeners
      this.video.addEventListener("seeking", this.handleSeeking);
      this.video.addEventListener("timeupdate", this.handleTimeUpdate);
    } catch (error) {
      console.error("Initialization error:", error);
      this.handleError(error);
    }
  }

  async handleSourceOpen() {
    try {
      if (this.isInitialized) return;
      this.isInitialized = true;

      console.log("MediaSource opened");

      // Create SourceBuffer with proper codec
      const mimeCodec = this.metadata.mimeType;
      if (!MediaSource.isTypeSupported(mimeCodec)) {
        throw new Error(`Unsupported MIME type: ${mimeCodec}`);
      }

      this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeCodec);
      this.sourceBuffer.addEventListener(
        "updateend",
        this.handleSourceBufferUpdate
      );

      // Start loading first chunk
      await this.loadPart(0);
    } catch (error) {
      console.error("Source open error:", error);
      this.handleError(error);
    }
  }

  async loadPart(part) {
    if (this.loadedParts.has(part) || this.loadingParts.has(part)) {
      return;
    }

    try {
      this.loadingParts.add(part);
      console.log(`Loading part ${part}...`);

      const response = await fetch(
        `/api/proxy/files?id=${this.fileId}&part=${part}`
      );
      if (!response.ok) throw new Error(`Failed to load part ${part}`);

      const arrayBuffer = await response.arrayBuffer();
      this.pendingChunks.push({ part, data: arrayBuffer });

      console.log(`Part ${part} loaded (${arrayBuffer.byteLength} bytes)`);

      this.loadedParts.add(part);
      this.loadingParts.delete(part);

      this.appendNextChunk();

      // Preload next part
      if (part < this.metadata.parts - 1) {
        this.loadPart(part + 1);
      }
    } catch (error) {
      console.error(`Error loading part ${part}:`, error);
      this.loadingParts.delete(part);

      // Retry logic
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log(`Retrying part ${part} (attempt ${this.retryCount})`);
        setTimeout(() => this.loadPart(part), 1000 * this.retryCount);
      } else {
        this.handleError(error);
      }
    }
  }

  appendNextChunk() {
    if (
      !this.sourceBuffer ||
      this.sourceBuffer.updating ||
      this.pendingChunks.length === 0
    ) {
      return;
    }

    const chunk = this.pendingChunks.shift();
    try {
      this.sourceBuffer.appendBuffer(chunk.data);
      console.log(`Appended part ${chunk.part} to SourceBuffer`);
    } catch (error) {
      console.error(`Error appending chunk ${chunk.part}:`, error);
      this.handleError(error);
    }
  }

  handleSourceBufferUpdate() {
    this.appendNextChunk();
  }

  handleSeeking() {
    const currentTime = this.video.currentTime;
    const seekPart = Math.floor(
      (currentTime * this.metadata.parts) / this.video.duration
    );

    console.log(`Seeking to part ${seekPart} (time: ${currentTime})`);

    // Clear pending chunks when seeking
    this.pendingChunks = [];

    // Load the part we're seeking to
    this.loadPart(seekPart);
  }

  handleTimeUpdate() {
    const currentTime = this.video.currentTime;
    const nextPart =
      Math.floor((currentTime * this.metadata.parts) / this.video.duration) + 1;

    // Preload next part if needed
    if (
      nextPart < this.metadata.parts &&
      !this.loadedParts.has(nextPart) &&
      !this.loadingParts.has(nextPart)
    ) {
      this.loadPart(nextPart);
    }
  }

  handleError(error) {
    console.error("Player error:", error);
    // Emit error event
    const errorEvent = new CustomEvent("playererror", {
      detail: { error: error.message },
    });
    this.video.dispatchEvent(errorEvent);
  }

  // Public methods
  destroy() {
    this.video.removeEventListener("seeking", this.handleSeeking);
    this.video.removeEventListener("timeupdate", this.handleTimeUpdate);
    if (this.sourceBuffer) {
      this.sourceBuffer.removeEventListener(
        "updateend",
        this.handleSourceBufferUpdate
      );
    }
    URL.revokeObjectURL(this.video.src);
  }
}

// Usage example:
/*
const video = document.getElementById('player');
const fileId = 'your-file-id';
const player = new ChunkedVideoPlayer(video, fileId);

// Error handling
video.addEventListener('playererror', (event) => {
  console.error('Player error:', event.detail.error);
});

// Cleanup when done
window.addEventListener('beforeunload', () => {
  player.destroy();
});
*/
