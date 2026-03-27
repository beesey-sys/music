import { GoogleGenAI } from "@google/genai";

export interface AudioStats {
  bpm: number;
  key: string;
  genre: string;
  energy: number;
}

export class GeminiAccompanist {
  private ai: GoogleGenAI;
  private onAudioData: (base64Audio: string) => void;
  private onStatsUpdate: (stats: Partial<AudioStats>) => void;
  private isProcessing: boolean = false;

  constructor(onAudioData: (base64Audio: string) => void, onStatsUpdate: (stats: Partial<AudioStats>) => void) {
    // Note: In a production Vercel app, you should use an environment variable
    // For client-side Vite, it's usually VITE_GEMINI_API_KEY
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
    this.ai = new GoogleGenAI(apiKey);
    this.onAudioData = onAudioData;
    this.onStatsUpdate = onStatsUpdate;
  }

  async connect(musicalStyle: string = "modern fusion") {
    console.log("Gemini Service initialized with style:", musicalStyle);
    // No persistent connection needed for standard API, but we keep the method for compatibility
  }

  async sendAudio(base64Data: string) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const model = this.ai.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: `You are an AI DJ and Accompanist. Analyze the incoming audio and provide a musical response.
        1. Determine BPM, Key, and Genre.
        2. Generate a short musical accompaniment description or stats.
        3. Output format for stats: BPM: [number], Key: [string], Genre: [string].`
      });

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: "audio/pcm;rate=16000",
            data: base64Data
          }
        },
        { text: "Analyze this audio and provide the current BPM, Key, and Genre." }
      ]);

      const response = await result.response;
      const text = response.text();
      this.parseStats(text);
      
      // Note: Free tier Gemini 1.5 Flash doesn't support direct AUDIO output modality in the same way as Live API
      // It primarily returns text. For actual audio generation, one would typically use a different model or 
      // wait for Gemini 2.0+ features to be fully available in free tier.
      // For now, we focus on the analysis part to keep the app functional.
      
    } catch (error) {
      console.error("Gemini API error:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  private parseStats(text: string) {
    const bpmMatch = text.match(/BPM:?\s*(\d+)/i);
    const keyMatch = text.match(/Key:?\s*([A-G][#b]?\s*(?:maj|min|major|minor)?)/i);
    const genreMatch = text.match(/Genre:?\s*(\w+)/i);
    
    const stats: Partial<AudioStats> = {};
    if (bpmMatch) stats.bpm = parseInt(bpmMatch[1]);
    if (keyMatch) stats.key = keyMatch[1];
    if (genreMatch) stats.genre = genreMatch[1];
    
    if (Object.keys(stats).length > 0) {
      this.onStatsUpdate(stats);
    }
  }

  disconnect() {
    this.isProcessing = false;
  }
}
