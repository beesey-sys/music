import * as Tone from 'tone';

export class AudioProcessor {
  private mic: Tone.UserMedia | null = null;
  private meter: Tone.Meter | null = null;
  private fft: Tone.FFT | null = null;
  private waveform: Tone.Waveform | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;

  private fileSource: MediaElementAudioSourceNode | null = null;
  private audioTag: HTMLAudioElement | null = null;

  constructor() {
    try {
      this.meter = new Tone.Meter();
      this.fft = new Tone.FFT(256);
      this.waveform = new Tone.Waveform(256);
      this.audioContext = Tone.getContext().rawContext as AudioContext;
    } catch (err) {
      console.error("AudioProcessor constructor failed:", err);
      // We'll handle null checks in methods
    }
  }

  async startFromFile(file: File, onAudioChunk: (base64: string) => void) {
    await Tone.start();
    const toneContext = Tone.getContext();
    
    if (this.audioTag) {
      this.audioTag.pause();
      this.audioTag.src = '';
    }

    this.audioTag = new Audio();
    this.audioTag.src = URL.createObjectURL(file);
    this.audioTag.crossOrigin = "anonymous";
    
    // Use Tone's context for playback and analysis
    const rawContext = toneContext.rawContext as AudioContext;
    this.fileSource = rawContext.createMediaElementSource(this.audioTag);
    this.fileSource.connect(rawContext.destination);

    // Connect to Tone.js analyzers (explicitly use .input for native nodes)
    if (this.meter) this.fileSource.connect(this.meter.input as AudioNode);
    if (this.fft) this.fileSource.connect(this.fft.input as AudioNode);
    if (this.waveform) this.fileSource.connect(this.waveform.input as AudioNode);

    // For Gemini capture, we need to resample to 16kHz.
    const dest = rawContext.createMediaStreamDestination();
    this.fileSource.connect(dest);
    
    this.setupCapture(dest.stream, onAudioChunk);
    this.audioTag.play();
  }

  async start(onAudioChunk: (base64: string) => void) {
    await Tone.start();
    this.mic = new Tone.UserMedia();
    await this.mic.open();
    
    // Connect to analyzers
    if (this.meter) this.mic.connect(this.meter);
    if (this.fft) this.mic.connect(this.fft);
    if (this.waveform) this.mic.connect(this.waveform);

    const stream = (this.mic as any).stream;
    if (!stream) {
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.setupCapture(fallbackStream, onAudioChunk);
      } catch (e) {
        throw new Error("Microphone stream is not available. Please check permissions.");
      }
      return;
    }

    this.setupCapture(stream, onAudioChunk);
  }

  private async setupCapture(stream: MediaStream, onAudioChunk: (base64: string) => void) {
    if (!stream || stream.getAudioTracks().length === 0) {
      throw new Error("MediaStream has no audio track. Please ensure your microphone is working and permissions are granted.");
    }
    const CaptureContext = window.AudioContext || (window as any).webkitAudioContext;
    // Gemini Live expects 16kHz PCM. Initializing context at 16kHz handles resampling automatically.
    const captureCtx = new CaptureContext({ sampleRate: 16000 });
    const source = captureCtx.createMediaStreamSource(stream);
    this.setupCaptureFromNode(source, captureCtx, onAudioChunk);
  }

  private async setupCaptureFromNode(source: AudioNode, captureCtx: AudioContext, onAudioChunk: (base64: string) => void) {
    try {
      if (captureCtx.audioWorklet) {
        const workletCode = `
          class PcmProcessor extends AudioWorkletProcessor {
            process(inputs) {
              const input = inputs[0];
              if (input && input[0]) {
                this.port.postMessage(input[0]);
              }
              return true;
            }
          }
          registerProcessor('pcm-processor', PcmProcessor);
        `;
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        await captureCtx.audioWorklet.addModule(url);
        const workletNode = new AudioWorkletNode(captureCtx, 'pcm-processor');
        
        workletNode.port.onmessage = (e) => {
          const pcmData = this.floatTo16BitPCM(e.data);
          onAudioChunk(this.arrayBufferToBase64(pcmData));
        };
        
        source.connect(workletNode);
        // We don't necessarily want to hear the captureCtx output if it's just for processing, 
        // but for files we might.
      } else {
        throw new Error("AudioWorklet not supported");
      }
    } catch (err) {
      console.warn("AudioWorklet failed, falling back to ScriptProcessor:", err);
      const processor = captureCtx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const pcmData = this.floatTo16BitPCM(e.inputBuffer.getChannelData(0));
        onAudioChunk(this.arrayBufferToBase64(pcmData));
      };
      source.connect(processor);
      processor.connect(captureCtx.destination);
    }
  }

  private floatTo16BitPCM(input: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  getEnergy(): number {
    return this.meter ? (this.meter.getValue() as number) : -100;
  }

  getFFT(): Float32Array {
    return this.fft ? this.fft.getValue() : new Float32Array(256);
  }

  getWaveform(): Float32Array {
    return this.waveform ? this.waveform.getValue() : new Float32Array(256);
  }

  stop() {
    if (this.mic) {
      this.mic.close();
    }
    if (this.audioTag) {
      this.audioTag.pause();
      this.audioTag.src = '';
    }
  }

  getAudioElement() {
    return this.audioTag;
  }

  // Helper to play back Gemini's audio
  async playGeminiAudio(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    // Gemini returns 24kHz PCM usually, but Live API might differ.
    // Let's assume 24kHz for now or check docs.
    if (!this.audioContext) {
      console.error("AudioContext not initialized");
      return;
    }
    const audioBuffer = this.audioContext.createBuffer(1, bytes.length / 2, 24000);
    const channelData = audioBuffer.getChannelData(0);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] = view.getInt16(i * 2, true) / 32768;
    }

    const source = this.audioContext!.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext!.destination);
    source.start();
  }
}
