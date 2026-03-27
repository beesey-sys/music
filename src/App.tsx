import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Music, Activity, Zap, Info, Play, Square, Star, History, Trash2, X, ChevronRight, Upload } from 'lucide-react';
import { GeminiAccompanist, AudioStats } from './services/geminiService';
import { AudioProcessor } from './services/audioProcessor';
import { LyriaService } from './services/lyriaService';
import { ErrorBoundary } from './components/ErrorBoundary';

interface JamSession {
  id: string;
  style: string;
  bpm: number;
  key: string;
  genre: string;
  timestamp: number;
  isFromFile?: boolean;
}

// Removed aistudio interface as we use standard environment variables now

export default function App() {
  console.log("App component rendering...");
  const [isJamming, setIsJamming] = useState(false);
  const [isFromFile, setIsFromFile] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState('modern fusion');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [history, setHistory] = useState<JamSession[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAudio, setGeneratedAudio] = useState<{ url: string; lyrics: string } | null>(null);
  
  const [stats, setStats] = useState<AudioStats>({
    bpm: 0,
    key: '---',
    genre: 'Detecting...',
    energy: 0
  });
  const [fftData, setFftData] = useState<Float32Array>(new Float32Array(64));
  const [waveform, setWaveform] = useState<Float32Array>(new Float32Array(128));
  
  const audioProcessor = useRef<AudioProcessor | null>(null);
  const gemini = useRef<GeminiAccompanist | null>(null);
  const lyria = useRef<LyriaService | null>(null);
  const animationFrame = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const styles = [
    { id: 'DJ Dance Floor Mix', label: 'DJ Mix', icon: <Zap size={14} /> },
    { id: 'modern fusion', label: 'Fusion', icon: <Zap size={14} /> },
    { id: 'jazz improvisation', label: 'Jazz', icon: <Music size={14} /> },
    { id: 'classical counterpoint', label: 'Classical', icon: <Activity size={14} /> },
    { id: 'electronic dance music', label: 'EDM', icon: <Zap size={14} /> },
    { id: 'ambient soundscape', label: 'Ambient', icon: <Info size={14} /> }
  ];

  // Load data from localStorage
  useEffect(() => {
    console.log("App mounted, initializing services...");
    try {
      const savedFavorites = localStorage.getItem('ai_accompanist_favorites');
      const savedHistory = localStorage.getItem('ai_accompanist_history');
      if (savedFavorites) setFavorites(JSON.parse(savedFavorites));
      if (savedHistory) setHistory(JSON.parse(savedHistory));
    } catch (err) {
      console.error("Failed to load from localStorage:", err);
    }

    try {
      audioProcessor.current = new AudioProcessor();
      gemini.current = new GeminiAccompanist(
        (base64) => audioProcessor.current?.playGeminiAudio(base64),
        (newStats) => setStats(prev => ({ ...prev, ...newStats }))
      );
      lyria.current = new LyriaService();
    } catch (err) {
      console.error("Failed to initialize services:", err);
      setError("Failed to initialize audio services. Please refresh the page.");
    }

    return () => {
      stopJamming();
    };
  }, []);

  // Save data to localStorage
  useEffect(() => {
    localStorage.setItem('ai_accompanist_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('ai_accompanist_history', JSON.stringify(history));
  }, [history]);

  const startJamming = async (file?: File) => {
    setError(null);
    
    // Check for API key
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      setError("Please set VITE_GEMINI_API_KEY in your environment variables.");
      return;
    }

    try {
      if (file) {
        setIsFromFile(true);
        await audioProcessor.current?.startFromFile(file, (base64) => {
          gemini.current?.sendAudio(base64);
        });
      } else {
        setIsFromFile(false);
        await audioProcessor.current?.start((base64) => {
          gemini.current?.sendAudio(base64);
        });
      }
      await gemini.current?.connect(selectedStyle);
      setIsJamming(true);
      updateVisuals();
    } catch (err) {
      console.error("Failed to start jamming:", err);
      setError(err instanceof Error ? err.message : String(err));
      stopJamming();
    }
  };

  const stopJamming = () => {
    if (isJamming) {
      // Save session to history
      const newSession: JamSession = {
        id: Date.now().toString(),
        style: selectedStyle,
        bpm: stats.bpm,
        key: stats.key,
        genre: stats.genre,
        timestamp: Date.now(),
        isFromFile
      };
      setHistory(prev => [newSession, ...prev].slice(0, 20)); // Keep last 20
    }

    setIsJamming(false);
    setIsFromFile(false);
    audioProcessor.current?.stop();
    gemini.current?.disconnect();
    if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      startJamming(file);
    }
  };

  const generateStudioArrangement = async () => {
    if (!lyria.current) return;
    
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      setError("Please set VITE_GEMINI_API_KEY in your environment variables.");
      return;
    }

    setIsGenerating(true);
    setGeneratedAudio(null);
    
    try {
      const prompt = `Generate a professional studio arrangement based on these parameters: 
        BPM: ${stats.bpm}, Key: ${stats.key}, Genre: ${stats.genre}. 
        Style: ${selectedStyle}. 
        The track should be a high-quality musical piece that captures the essence of this jam session.`;
        
      const result = await lyria.current.generateArrangement(prompt);
      setGeneratedAudio({ url: result.audioUrl, lyrics: result.lyrics });
    } catch (err: any) {
      console.error("Generation failed:", err);
      setError("Failed to generate studio arrangement. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleFavorite = (styleId: string) => {
    setFavorites(prev => 
      prev.includes(styleId) ? prev.filter(id => id !== styleId) : [...prev, styleId]
    );
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const updateVisuals = () => {
    if (audioProcessor.current) {
      const energy = audioProcessor.current.getEnergy();
      const fft = audioProcessor.current.getFFT();
      const wave = audioProcessor.current.getWaveform();
      
      setFftData(fft.slice(0, 64)); // Use first 64 bins
      setWaveform(wave);
      setStats(prev => ({ ...prev, energy: Math.max(0, (energy + 100) / 100) }));
    }
    animationFrame.current = requestAnimationFrame(updateVisuals);
  };

  const generateWaveformPath = (data: Float32Array) => {
    const points = Array.from(data);
    const step = 100 / (points.length - 1);
    return points.reduce((acc, val, i) => {
      const x = i * step;
      const y = 50 + val * 40; // Center at 50%, scale by 40
      return acc + (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
    }, "");
  };

  return (
    <div className="min-h-screen bg-[#0a0502] text-[#e0d8d0] font-sans selection:bg-[#ff4e00] selection:text-white relative">
      {error && (
        <div className="fixed top-0 left-0 right-0 z-[100] p-4 bg-red-500 text-white text-center font-bold">
          {error}
          <button onClick={() => setError(null)} className="ml-4 underline">Dismiss</button>
        </div>
      )}
      {/* Atmospheric Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-20 blur-[120px]"
          style={{
            background: 'radial-gradient(circle, #ff4e00 0%, transparent 70%)',
            transform: `scale(${1 + stats.energy * 0.5})`,
            transition: 'transform 0.1s ease-out'
          }}
        />
        <div 
          className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-10 blur-[100px]"
          style={{
            background: 'radial-gradient(circle, #3a1510 0%, transparent 70%)'
          }}
        />
      </div>

      {/* Sidebar Trigger */}
      <button 
        onClick={() => setIsSidebarOpen(true)}
        className="fixed right-6 top-6 z-50 p-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all group"
      >
        <History size={20} className="group-hover:rotate-[-12deg] transition-transform" />
      </button>

      {/* Sidebar Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#151619] border-l border-white/10 z-[70] p-8 overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-12">
                <h2 className="text-3xl font-serif">Library</h2>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              {/* Favorites Section */}
              <section className="mb-12">
                <div className="flex items-center gap-2 mb-6 opacity-40">
                  <Star size={14} />
                  <span className="text-[10px] uppercase tracking-widest font-medium">Favorite Styles</span>
                </div>
                {favorites.length === 0 ? (
                  <p className="text-sm opacity-30 italic font-serif">No favorites saved yet.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {favorites.map(id => {
                      const style = styles.find(s => s.id === id);
                      return style ? (
                        <button 
                          key={id}
                          onClick={() => { setSelectedStyle(id); setIsSidebarOpen(false); }}
                          className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-[#ff4e00]/40 transition-all text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="text-[#ff4e00]">{style.icon}</div>
                            <span className="text-sm font-medium">{style.label}</span>
                          </div>
                          <ChevronRight size={14} className="opacity-20" />
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
              </section>

              {/* History Section */}
              <section>
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-2 opacity-40">
                    <History size={14} />
                    <span className="text-[10px] uppercase tracking-widest font-medium">Recent Sessions</span>
                  </div>
                  {history.length > 0 && (
                    <button onClick={clearHistory} className="text-[10px] uppercase tracking-widest opacity-40 hover:opacity-100 flex items-center gap-1 transition-opacity">
                      <Trash2 size={10} /> Clear
                    </button>
                  )}
                </div>
                {history.length === 0 ? (
                  <p className="text-sm opacity-30 italic font-serif">Your jam history will appear here.</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {history.map(session => (
                      <div 
                        key={session.id}
                        onClick={() => { setSelectedStyle(session.style); setIsSidebarOpen(false); }}
                        className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/5 transition-all cursor-pointer group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-medium text-[#ff4e00] uppercase tracking-wider">
                            {styles.find(s => s.id === session.style)?.label || 'Custom'}
                            {session.isFromFile && <span className="ml-2 opacity-40 lowercase text-[9px]">(file)</span>}
                          </span>
                          <span className="text-[10px] opacity-30 font-mono">
                            {new Date(session.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex gap-4 text-sm font-serif italic opacity-60">
                          <span>{session.bpm} BPM</span>
                          <span>{session.key}</span>
                          <span>{session.genre}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12 min-h-screen flex flex-col">
        {/* Header */}
        <header className="flex justify-between items-start mb-12">
          <div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-6xl font-serif font-light tracking-tighter mb-2"
            >
              AI Accompanist
            </motion.h1>
            <p className="text-sm uppercase tracking-[0.2em] opacity-50 font-medium">
              {selectedStyle === 'DJ Dance Floor Mix' ? 'Live AI DJ Set' : 'Intelligent Musical Jam Layer'}
            </p>
          </div>
          
          <div className="flex gap-4 items-center">
             {selectedStyle === 'DJ Dance Floor Mix' && isJamming && (
               <motion.div 
                 initial={{ opacity: 0, scale: 0.8 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="px-3 py-1 rounded-full bg-[#ff4e00]/20 border border-[#ff4e00]/40 text-[#ff4e00] text-[10px] uppercase tracking-widest font-bold"
               >
                 DJ Active
               </motion.div>
             )}
             <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase tracking-widest opacity-40 mb-1">Status</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isJamming ? 'bg-[#ff4e00] animate-pulse shadow-[0_0_10px_#ff4e00]' : 'bg-white/20'}`} />
                  <span className="text-xs font-mono uppercase tracking-wider">
                    {isJamming ? (isFromFile ? 'Jamming with File' : 'Live Jamming') : 'Standby'}
                  </span>
                </div>
             </div>

             {isJamming && (
               <motion.button
                 whileHover={{ scale: 1.05 }}
                 whileTap={{ scale: 0.95 }}
                 onClick={generateStudioArrangement}
                 disabled={isGenerating}
                 className="px-6 py-2 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition-colors text-[10px] uppercase tracking-widest font-bold disabled:opacity-50"
               >
                 {isGenerating ? 'Generating Studio...' : 'Studio Arrangement'}
               </motion.button>
             )}
          </div>
        </header>

        {/* Visualizer & Stats Grid */}
        <div className="flex-1 flex flex-col mb-12">
          <AnimatePresence>
            {generatedAudio && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="mb-8 p-6 rounded-[32px] bg-white/[0.05] border border-white/10 backdrop-blur-xl"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-serif italic">Studio Arrangement Generated</h3>
                  <button 
                    onClick={() => setGeneratedAudio(null)}
                    className="text-[10px] uppercase tracking-widest opacity-40 hover:opacity-100"
                  >
                    Close
                  </button>
                </div>
                <audio controls src={generatedAudio.url} className="w-full h-10 filter invert opacity-80" />
                {generatedAudio.lyrics && (
                  <div className="mt-4 p-4 rounded-xl bg-black/20 text-xs font-serif italic opacity-60 max-h-32 overflow-y-auto">
                    {generatedAudio.lyrics}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Visualizer */}
          <div className="lg:col-span-2 relative group">
            <div className="absolute inset-0 bg-white/[0.02] border border-white/10 rounded-[32px] backdrop-blur-3xl" />
            
            {/* Waveform Layer */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden rounded-[32px]">
              {selectedStyle === 'DJ Dance Floor Mix' && isJamming && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute opacity-5"
                >
                  <Music size={400} />
                </motion.div>
              )}
              <svg className="w-full h-full opacity-30" viewBox="0 0 100 100" preserveAspectRatio="none">
                <motion.path
                  d={generateWaveformPath(waveform)}
                  fill="none"
                  stroke={isJamming ? '#ff4e00' : '#ffffff20'}
                  strokeWidth="0.5"
                  initial={false}
                  animate={{ stroke: isJamming ? '#ff4e00' : '#ffffff20' }}
                />
              </svg>
            </div>

            <div className="absolute inset-0 flex items-center justify-center p-12">
              <div className="w-full h-full flex items-end justify-between gap-1">
                {Array.from(fftData).map((val: any, i) => (
                  <motion.div
                    key={i}
                    animate={{ 
                      height: `${Math.max(4, (Number(val) + 140) * 1.5)}%`,
                      backgroundColor: isJamming ? '#ff4e00' : '#ffffff20'
                    }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="flex-1 rounded-full min-h-[4px]"
                  />
                ))}
              </div>
            </div>
            
            {/* Overlay Info */}
            <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end">
               <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-widest opacity-40 mb-1">Energy Level</span>
                  <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-[#ff4e00]"
                      animate={{ width: `${stats.energy * 100}%` }}
                    />
                  </div>
               </div>
               <div className="text-right">
                  <span className="text-[10px] uppercase tracking-widest opacity-40 mb-1">Detected Genre</span>
                  <p className="text-xl font-serif italic">{stats.genre}</p>
               </div>
            </div>
          </div>

          {/* Stats Sidebar */}
          <div className="flex flex-col gap-6">
            <StatCard 
              label="Tempo" 
              value={stats.bpm > 0 ? `${stats.bpm} BPM` : '---'} 
              icon={<Activity size={16} />}
              active={isJamming && stats.bpm > 0}
            />
            <StatCard 
              label="Key Signature" 
              value={stats.key} 
              icon={<Music size={16} />}
              active={isJamming && stats.key !== '---'}
            />
            <StatCard 
              label="Intensity" 
              value={`${Math.round(stats.energy * 100)}%`} 
              icon={<Zap size={16} />}
              active={isJamming}
            />
            
            <div className="mt-auto p-6 rounded-[24px] bg-white/[0.03] border border-white/5">
              <div className="flex items-start gap-3">
                <Info size={16} className="mt-1 opacity-40" />
                <p className="text-xs leading-relaxed opacity-60 italic font-serif">
                  The AI analyzes your audio and generates a complementary layer of drums, bass, and synths in real-time.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
        <footer className="flex flex-col items-center gap-8 pb-12">
          {/* Style Selector */}
          <div className="flex flex-wrap justify-center gap-3">
            {styles.map((style) => (
              <div key={style.id} className="relative group/style">
                <button
                  disabled={isJamming}
                  onClick={() => setSelectedStyle(style.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium tracking-wider uppercase transition-all
                    ${selectedStyle === style.id 
                      ? 'bg-[#ff4e00] text-white shadow-[0_0_15px_rgba(255,78,0,0.4)]' 
                      : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                    }
                    ${isJamming ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  {style.icon}
                  {style.label}
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(style.id); }}
                  className={`
                    absolute -top-2 -right-2 p-1.5 rounded-full bg-[#151619] border border-white/10 
                    opacity-0 group-hover/style:opacity-100 transition-all scale-75 hover:scale-100
                    ${favorites.includes(style.id) ? 'text-yellow-400 opacity-100' : 'text-white/40'}
                  `}
                >
                  <Star size={10} fill={favorites.includes(style.id) ? "currentColor" : "none"} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="audio/*" 
              className="hidden" 
            />
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => isJamming ? stopJamming() : startJamming()}
              className={`
                group relative flex items-center gap-4 px-12 py-6 rounded-full transition-all duration-500
                ${isJamming 
                  ? 'bg-white text-black' 
                  : 'bg-[#ff4e00] text-white shadow-[0_0_40px_rgba(255,78,0,0.3)] hover:shadow-[0_0_60px_rgba(255,78,0,0.5)]'
                }
              `}
            >
              {isJamming ? (
                <>
                  <Square size={24} fill="currentColor" />
                  <span className="text-lg font-medium tracking-tight">Stop Jamming</span>
                </>
              ) : (
                <>
                  <Play size={24} fill="currentColor" />
                  <span className="text-lg font-medium tracking-tight">Start Live Jam</span>
                </>
              )}
            </motion.button>

            {!isJamming && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => fileInputRef.current?.click()}
                className="group relative flex items-center gap-4 px-8 py-6 rounded-full bg-white/5 border border-white/10 text-white transition-all duration-500 hover:bg-white/10"
              >
                <Upload size={24} />
                <span className="text-lg font-medium tracking-tight">Upload File</span>
              </motion.button>
            )}
          </div>
        </footer>
      </main>

      {/* Decorative Rail Text */}
      <div className="fixed left-6 top-1/2 -translate-y-1/2 [writing-mode:vertical-rl] pointer-events-none opacity-20">
        <span className="text-[10px] uppercase tracking-[0.5em] font-mono">
          Real-time Neural Accompaniment Engine v1.0
        </span>
      </div>
      </div>
  );
}

function StatCard({ label, value, icon, active }: { label: string, value: string, icon: React.ReactNode, active: boolean }) {
  return (
    <div className={`
      p-6 rounded-[24px] border transition-all duration-500
      ${active ? 'bg-white/[0.05] border-white/20' : 'bg-transparent border-white/5'}
    `}>
      <div className="flex items-center gap-2 mb-4 opacity-40">
        {icon}
        <span className="text-[10px] uppercase tracking-widest font-medium">{label}</span>
      </div>
      <p className={`text-4xl font-serif transition-colors duration-500 ${active ? 'text-white' : 'text-white/20'}`}>
        {value}
      </p>
    </div>
  );
}
