import { GoogleGenAI } from "@google/genai";

export class LyriaService {
  constructor() {}

  async generateArrangement(prompt: string, onProgress?: (text: string) => void): Promise<{ audioUrl: string; lyrics: string }> {
    // Note: In a production Vercel app, you should use an environment variable
    // For client-side Vite, it's usually VITE_GEMINI_API_KEY
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
    const ai = new GoogleGenAI(apiKey);
    
    // Using gemini-1.5-flash as it's available in the free tier
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const result = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    let lyrics = "";
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      lyrics += chunkText;
      if (onProgress) onProgress(lyrics);
    }

    // Since gemini-1.5-flash in free tier primarily returns text, 
    // we return a placeholder or handle the lack of audio generation gracefully.
    // In a real scenario, you might use a separate TTS or music generation API.
    
    return { 
      audioUrl: "", // Free tier Gemini 1.5 Flash doesn't generate audio files directly
      lyrics 
    };
  }
}
