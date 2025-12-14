import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, Power, MicOff, Video, VideoOff, Activity, Eye, Wifi, MapPin, Trash2 } from 'lucide-react';
import Orb from './components/Orb';
import TechOverlay from './components/TechOverlay';
import { SystemState, LogEntry } from './types';
import { decodeAudioData, createPcmBlob, base64ToUint8Array } from './services/audioUtils';

// Constants
const SYSTEM_INSTRUCTION = `
SYSTEM IDENTITY:
You are J.A.R.V.I.S., the advanced AI interface of Rusho Industries.
User: Rohan Rusho ("Sir" or "Boss").

**CRITICAL PROTOCOLS (READ CAREFULLY):**

1.  **INITIAL GREETING (PRIORITY 1):**
    -   **IMMEDIATELY** upon the start of the session, you MUST greet the user based on the time of day.
    -   Format: "Good [Morning/Afternoon/Evening], Boss. [System Status]. How may I assist you?"
    -   Do not wait for a specific question. Greet as soon as you detect presence.

2.  **LOCATION AWARENESS (MANDATORY):**
    -   Your system has direct access to the user's GPS coordinates provided in the context below.
    -   **IF ASKED "WHERE AM I?" OR "LOCATE ME":**
        -   Use the provided Latitude/Longitude coordinates to determine the City, District, and Country.
        -   **DO NOT** read the numbers.
        -   **CORRECT RESPONSE:** "Sir, digital triangulation places us in Dhaka, Bangladesh." or "We are currently located in Central London, Boss."

3.  **REAL-TIME INTELLIGENCE:**
    -   Use 'googleSearch' for news/facts.
    -   Use 'googleMaps' for navigation/places.

4.  **VOICE PERSONA:**
    -   Tone: Calm, hyper-intelligent, slightly witty, and fiercely loyal.
    -   Style: Concise. Do not ramble. Use tech jargon (e.g., "Calibrating...", "Uplink established").

5.  **VISUAL ANALYSIS:**
    -   If the user shows you an object, analyze it like a tactical scanner. Describe material, condition, and utility.
`;

const App: React.FC = () => {
  // Application State
  const [apiKeyVerified, setApiKeyVerified] = useState<boolean>(false);
  const [systemState, setSystemState] = useState<SystemState>(SystemState.OFFLINE);
  const [audioVolume, setAudioVolume] = useState<number>(0);
  
  // Log State with LocalStorage Persistence
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    try {
      const savedLogs = localStorage.getItem('JARVIS_LOGS');
      return savedLogs ? JSON.parse(savedLogs) : [];
    } catch (e) {
      return [];
    }
  });

  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [locationCoords, setLocationCoords] = useState<{lat: number, lng: number} | null>(null);

  // Refs for Audio/Video handling
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null); 
  const canvasRef = useRef<HTMLCanvasElement>(null); 
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null); 
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const isMicEnabledRef = useRef<boolean>(isMicEnabled); 
  const locationRef = useRef<{lat: number, lng: number} | null>(null);
  const isAiSpeakingRef = useRef<boolean>(false); 

  // Persist logs whenever they change
  useEffect(() => {
    localStorage.setItem('JARVIS_LOGS', JSON.stringify(logs));
  }, [logs]);

  const addLog = (source: 'USER' | 'JARVIS' | 'SYSTEM', message: string) => {
    setLogs(prev => [...prev.slice(-20), { timestamp: new Date().toLocaleTimeString(), source, message }]);
  };

  const clearLogs = () => {
    setLogs([]);
    localStorage.removeItem('JARVIS_LOGS');
    addLog('SYSTEM', 'Log buffer purged.');
  };

  // Sync isMicEnabled state to ref
  useEffect(() => {
    isMicEnabledRef.current = isMicEnabled;
  }, [isMicEnabled]);

  // 1. Initialization & Background Services
  useEffect(() => {
    if (process.env.API_KEY) {
      setApiKeyVerified(true);
      if (logs.length === 0) {
        addLog('SYSTEM', 'Rusho Industries Protocol initialized.');
      }
      
      // Start Background GPS Acquisition immediately
      navigator.geolocation.getCurrentPosition(
        (pos) => {
            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setLocationCoords(coords);
            locationRef.current = coords;
        },
        (err) => console.warn("Background GPS pending...", err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );

    } else {
        addLog('SYSTEM', 'CRITICAL: API_KEY missing.');
    }
  }, []);

  // Helper: Get Geolocation (Promisified)
  const getPosition = (): Promise<GeolocationPosition | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position),
        (error) => {
          console.warn('GPS Error', error);
          resolve(null);
        },
        { timeout: 4000, enableHighAccuracy: true }
      );
    });
  };

  // 2. Main Connection Logic
  const connectToGemini = async () => {
    if (!process.env.API_KEY) return;

    try {
      setSystemState(SystemState.IDLE);
      addLog('SYSTEM', 'Initializing Mark X Systems...');

      // Setup Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
      try {
        inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      } catch (e) {
        // Fallback to default rate if 16k is not supported
        inputAudioContextRef.current = new AudioContextClass();
      }
      
      // Log the actual rate being used
      if (inputAudioContextRef.current) {
          addLog('SYSTEM', `Audio Input Rate: ${inputAudioContextRef.current.sampleRate}Hz`);
      }

      outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });

      // Browsers often suspend AudioContext if no user interaction.
      const resumeContext = async () => {
         if (inputAudioContextRef.current?.state === 'suspended') {
             await inputAudioContextRef.current.resume();
         }
         if (outputAudioContextRef.current?.state === 'suspended') {
             await outputAudioContextRef.current.resume();
         }
      };
      await resumeContext();
      
      inputAudioContextRef.current.onstatechange = () => {
          if (inputAudioContextRef.current?.state === 'suspended') resumeContext();
      };


      // Get User Media
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true, // Critical for preventing self-hearing
            noiseSuppression: true,
            autoGainControl: true
          }, 
          video: { width: 1280, height: 720 } 
        });
        streamRef.current = stream;
      } catch (err) {
        addLog('SYSTEM', 'ERR: Audio/Visual Sensors Blocked.');
        setSystemState(SystemState.OFFLINE);
        return;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Resolve Location Strategy
      let finalLat = 0;
      let finalLng = 0;
      let hasLocation = false;

      // Check cached or fetch new
      if (locationRef.current) {
          finalLat = locationRef.current.lat;
          finalLng = locationRef.current.lng;
          hasLocation = true;
          addLog('SYSTEM', `Sat-Nav Locked (Cached): ${finalLat.toFixed(4).slice(0,5)}...`);
      } else {
          addLog('SYSTEM', 'Triangulating Position...');
          const position = await getPosition();
          if (position) {
              finalLat = position.coords.latitude;
              finalLng = position.coords.longitude;
              hasLocation = true;
              setLocationCoords({ lat: finalLat, lng: finalLng });
              locationRef.current = { lat: finalLat, lng: finalLng };
              addLog('SYSTEM', `Sat-Nav Locked: ${finalLat.toFixed(4).slice(0,5)}...`);
          } else {
              addLog('SYSTEM', 'GPS Signal Weak. Disabling Navigation.');
          }
      }

      // Initialize Gemini Client
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      addLog('SYSTEM', 'Establishing Neural Uplink...');

      // Dynamic Greeting & Location Logic
      const hour = new Date().getHours();
      const timeOfDay = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
      
      // We inject the location DIRECTLY into the system instructions so the model "knows" it immediately.
      const locationContext = hasLocation 
        ? `CURRENT GPS COORDINATES: Latitude ${finalLat}, Longitude ${finalLng}`
        : `GPS SIGNAL LOST. Location unknown.`;

      const dynamicInstruction = `${SYSTEM_INSTRUCTION}
      
      CURRENT STATUS:
      - Local Time: ${timeOfDay}
      - ${locationContext}
      - System: Online and Fully Operational.

      CRITICAL OVERRIDE:
      Your very FIRST sentence MUST be: "Good ${timeOfDay}, Boss. Systems online. How may I assist you?"
      Say this IMMEDIATELY upon hearing the user or background noise.
      `;

      // Build Config
      const config: any = {
        tools: [
            { googleSearch: {} }, 
            { googleMaps: {} }
        ],
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } },
        },
        systemInstruction: dynamicInstruction,
      };

      // Add tool config if we have location
      if (hasLocation) {
          config.toolConfig = {
              retrievalConfig: {
                  latLng: {
                      latitude: finalLat,
                      longitude: finalLng
                  }
              }
          };
      }

      // Connect to Live API
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: config,
        callbacks: {
          onopen: () => {
            addLog('SYSTEM', 'J.A.R.V.I.S. Protocol Active.');
            setSystemState(SystemState.LISTENING);
            startAudioInput(stream, sessionPromise);
            
            if (isVideoEnabled) {
                startVideoInput(sessionPromise);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            // Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              setSystemState(SystemState.SPEAKING);
              await playAudioChunk(base64Audio);
            }

            // Visual Feedback for Tool Use
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts && parts.length > 0) {
                const grounding = parts[0].groundingMetadata;
                if (grounding) {
                   if (grounding.groundingChunks?.some(c => c.web)) {
                       addLog('JARVIS', 'Accessing Worldwide Web...');
                   }
                   if (grounding.groundingChunks?.some(c => c.maps)) {
                       addLog('JARVIS', 'Calibrating Map Data...');
                   }
                }
            }

            // Handle Barge-In Interruption
            if (message.serverContent?.interrupted) {
              addLog('SYSTEM', 'Output Interrupted.');
              stopAudioPlayback(); // Stop current audio
              isAiSpeakingRef.current = false; // Reset speaking flag
              setSystemState(SystemState.LISTENING); // Go back to listening
            }

            if (message.serverContent?.turnComplete) {
              if (sourcesRef.current.size === 0 && !isAiSpeakingRef.current) {
                 setSystemState(SystemState.LISTENING);
              }
            }
          },
          onclose: () => {
            addLog('SYSTEM', 'Uplink Severed.');
            disconnect();
          },
          onerror: (err) => {
            console.error(err);
            addLog('SYSTEM', 'System Failure.');
            setSystemState(SystemState.OFFLINE);
          }
        }
      });

      sessionRef.current = sessionPromise;

    } catch (error: any) {
      console.error("Connection failed", error);
      addLog('SYSTEM', `Init Error: ${error.message}`);
      setSystemState(SystemState.OFFLINE);
    }
  };

  // 3. Audio Input Streaming
  const startAudioInput = (stream: MediaStream, sessionPromise: Promise<any>) => {
    if (!inputAudioContextRef.current) return;
    
    // Capture the actual sample rate of the device
    const actualSampleRate = inputAudioContextRef.current.sampleRate;

    const source = inputAudioContextRef.current.createMediaStreamSource(stream);
    const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      if (!isMicEnabledRef.current) return; 

      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate RMS for visualizer only
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
      const rms = Math.sqrt(sum / inputData.length);
      
      setAudioVolume(Math.min(1, rms * 15)); 

      // Send audio data to Gemini
      // Note: Removed noise gate threshold to ensure even quiet voices are sent.
      // The model's VAD (Voice Activity Detection) handles silence better than a simple threshold.
      const pcmBlob = createPcmBlob(inputData, actualSampleRate);
      
      sessionPromise.then((session) => {
        session.sendRealtimeInput({ media: pcmBlob });
      });
    };

    source.connect(processor);
    
    const gain = inputAudioContextRef.current.createGain();
    gain.gain.value = 0; 
    processor.connect(gain);
    gain.connect(inputAudioContextRef.current.destination);
    
    scriptProcessorRef.current = processor;
  };

  // 4. Video Input Streaming
  const startVideoInput = (sessionPromise: Promise<any>) => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);

    frameIntervalRef.current = window.setInterval(() => {
        if (!videoRef.current || !canvasRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = 640;
        const height = 360;
        
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;

        ctx.drawImage(videoRef.current, 0, 0, width, height);

        const base64Data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        
        sessionPromise.then((session) => {
            session.sendRealtimeInput({
                media: {
                    mimeType: 'image/jpeg',
                    data: base64Data
                }
            });
        });

    }, 1000); 
  };

  // Monitor Rendering Loop
  useEffect(() => {
    let animId: number;
    const renderPreview = () => {
        if (previewCanvasRef.current && videoRef.current && isVideoEnabled) {
             const ctx = previewCanvasRef.current.getContext('2d');
             if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
                
                ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
                ctx.fillRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);

                const time = Date.now() / 1500;
                const y = (Math.sin(time * 3) + 1) / 2 * previewCanvasRef.current.height;
                
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#22d3ee';
                ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(previewCanvasRef.current.width, y);
                ctx.stroke();
                ctx.shadowBlur = 0;

                ctx.strokeStyle = 'rgba(34, 211, 238, 0.2)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                for(let i=0; i<previewCanvasRef.current.width; i+=40) {
                    ctx.moveTo(i, 0);
                    ctx.lineTo(i, previewCanvasRef.current.height);
                }
                ctx.stroke();
             }
        }
        animId = requestAnimationFrame(renderPreview);
    };
    renderPreview();
    return () => cancelAnimationFrame(animId);
  }, [isVideoEnabled]);


  // 5. Audio Output Handling
  const playAudioChunk = async (base64Audio: string) => {
    if (!outputAudioContextRef.current) return;
    
    isAiSpeakingRef.current = true;

    try {
        const ctx = outputAudioContextRef.current;
        const arrayBuffer = base64ToUint8Array(base64Audio);
        const audioBuffer = await decodeAudioData(arrayBuffer, ctx, 24000, 1);

        let startTime = Math.max(nextStartTimeRef.current, ctx.currentTime);
        if (startTime < ctx.currentTime) startTime = ctx.currentTime;
        
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        
        const gainNode = ctx.createGain();
        gainNode.gain.value = 1.0; 
        
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        source.start(startTime);
        nextStartTimeRef.current = startTime + audioBuffer.duration;
        
        sourcesRef.current.add(source);
        source.onended = () => {
            sourcesRef.current.delete(source);
            if (sourcesRef.current.size === 0) {
                setTimeout(() => {
                     if (sourcesRef.current.size === 0 && ctx.currentTime >= nextStartTimeRef.current) {
                         isAiSpeakingRef.current = false;
                         setSystemState(SystemState.LISTENING);
                         setAudioVolume(0);
                     }
                }, 200);
            }
        };
    } catch (e) {
        console.error("Audio Decode Error:", e);
        isAiSpeakingRef.current = false;
        setSystemState(SystemState.LISTENING);
    }
  };

  const stopAudioPlayback = () => {
    sourcesRef.current.forEach(source => {
        try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    isAiSpeakingRef.current = false; 
  };

  // 6. Cleanup
  const disconnect = useCallback(() => {
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
    if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close();
        inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
        outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
    }
    if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
    }
    setSystemState(SystemState.OFFLINE);
    isAiSpeakingRef.current = false;
    addLog('SYSTEM', 'Protocol terminated.');
    setLocationCoords(null);
    locationRef.current = null;
  }, []);


  return (
    <div className="relative min-h-screen w-full bg-[#020617] flex flex-col items-center justify-center overflow-hidden font-mono selection:bg-cyan-500/30">
      
      {/* --- BACKGROUND LAYERS --- */}
      <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#0e7490_1px,transparent_1px),linear-gradient(to_bottom,#0e7490_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-[0.15]"></div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,transparent_0%,#020617_100%)]"></div>
      </div>

      <div className={`absolute inset-0 z-0 transition-all duration-1000 ease-in-out ${isVideoEnabled && systemState !== SystemState.OFFLINE ? 'opacity-30 blur-[2px] scale-105' : 'opacity-0 scale-100'}`}>
         <video 
            ref={videoRef} 
            className="w-full h-full object-cover grayscale sepia-[0.3] hue-rotate-[190deg] contrast-125 brightness-75"
            muted 
            playsInline 
            autoPlay 
         />
      </div>

      <TechOverlay />

      {/* --- VISION MONITOR (Top Right) --- */}
      <div className={`absolute top-6 right-6 z-40 transition-all duration-500 ${isVideoEnabled ? 'translate-x-0 opacity-100' : 'translate-x-10 opacity-60'}`}>
          <div className="flex flex-col items-end gap-1">
            <div className={`relative w-64 aspect-video bg-black/60 border border-cyan-500/40 rounded-sm overflow-hidden backdrop-blur-md shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all duration-300 ${isVideoEnabled ? 'border-cyan-400' : 'border-cyan-900/50'}`}>
                <canvas 
                    ref={previewCanvasRef} 
                    width={320} 
                    height={180} 
                    className={`w-full h-full object-cover transition-opacity duration-300 ${isVideoEnabled ? 'opacity-100' : 'opacity-0'}`} 
                />
                
                {!isVideoEnabled && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-cyan-950/20">
                        <div className="w-12 h-12 border border-cyan-800 rounded-full flex items-center justify-center mb-2">
                             <div className="w-1 h-1 bg-cyan-800 rounded-full"></div>
                        </div>
                        <div className="text-cyan-800 text-[8px] tracking-[0.2em] font-bold">SIGNAL LOST</div>
                    </div>
                )}

                <div className="absolute inset-0 pointer-events-none p-2 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm ${isVideoEnabled ? 'bg-cyan-500/20 border border-cyan-500/50' : 'bg-red-900/20 border border-red-900/50'}`}>
                             <div className={`w-1.5 h-1.5 rounded-full ${isVideoEnabled ? 'bg-cyan-400 animate-pulse' : 'bg-red-800'}`}></div>
                             <span className={`text-[8px] font-bold tracking-wider ${isVideoEnabled ? 'text-cyan-300' : 'text-red-800'}`}>{isVideoEnabled ? 'LIVE FEED' : 'OFFLINE'}</span>
                        </div>
                        {isVideoEnabled && <Activity size={10} className="text-cyan-400 animate-pulse" />}
                    </div>
                    
                    <div className="flex justify-between items-end text-[7px] text-cyan-600/80 font-mono">
                        <span>RUSHO_CAM_1</span>
                        <span>{isVideoEnabled ? 'DATA_STREAM_ACTIVE' : 'NO_DATA'}</span>
                    </div>
                </div>
            </div>
            
            <div className="text-[9px] text-cyan-700/80 font-bold tracking-widest flex items-center gap-2 uppercase">
                <Wifi size={10} className={isVideoEnabled ? "text-cyan-500" : "text-gray-800"} />
                Secure Uplink
            </div>
          </div>
      </div>

      {/* --- LOCATION MODULE (Top Left) --- */}
      {locationCoords && (
        <div className="absolute top-6 left-6 z-40 animate-fade-in">
           <div className="flex flex-col gap-1">
               <div className="flex items-center gap-2 text-cyan-500">
                    <MapPin size={16} />
                    <span className="text-[10px] tracking-[0.2em] font-bold uppercase">GPS: LOCKED</span>
               </div>
               <div className="text-[9px] text-cyan-700/80 font-mono">
                    LAT: {locationCoords.lat.toFixed(4)} <br/>
                    LNG: {locationCoords.lng.toFixed(4)}
               </div>
           </div>
        </div>
      )}

      {/* --- HEADER --- */}
      <div className="absolute top-0 left-0 w-full p-8 z-20 flex justify-center pointer-events-none">
        <div className="flex items-center gap-4 pointer-events-auto">
            <div className={`relative w-10 h-10 flex items-center justify-center border border-cyan-800 rounded-full transition-all duration-500 ${systemState !== SystemState.OFFLINE ? 'shadow-[0_0_20px_rgba(34,211,238,0.4)] border-cyan-400' : 'opacity-50'}`}>
                 <div className={`absolute inset-0 rounded-full border border-cyan-500/20 scale-125`}></div>
                 <div className={`w-4 h-4 rotate-45 border transition-colors duration-300 ${systemState !== SystemState.OFFLINE ? 'bg-cyan-400 animate-spin-slow' : 'bg-transparent border-cyan-800'}`}></div>
            </div>
            <div>
                 <h1 className="text-3xl font-bold tracking-[0.15em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-cyan-600 font-sans shadow-cyan-500 drop-shadow-sm">J.A.R.V.I.S.</h1>
                 <div className="flex items-center gap-2 text-[9px] text-cyan-700 tracking-[0.4em] uppercase font-bold">
                    <span>Rusho Ind.</span>
                    <span className={`w-1 h-1 rounded-full ${systemState !== SystemState.OFFLINE ? 'bg-cyan-400' : 'bg-red-500'}`}></span>
                    <span>{systemState}</span>
                 </div>
            </div>
        </div>
      </div>

      {/* --- CORE VISUALIZER --- */}
      <div className="z-20 relative transform transition-all duration-700 hover:scale-105 filter drop-shadow-[0_0_30px_rgba(34,211,238,0.15)]">
         <Orb state={systemState} volume={audioVolume} />
      </div>

      {/* --- BOTTOM CONSOLE --- */}
      <div className="absolute bottom-12 z-30 flex flex-col items-center w-full px-6 pointer-events-none">
        
        {/* Log Window */}
        <div className="w-full max-w-lg mb-8 relative group">
            <div className="absolute -top-2 left-0 w-4 h-4 border-t border-l border-cyan-500/30"></div>
            <div className="absolute -top-2 right-0 w-4 h-4 border-t border-r border-cyan-500/30"></div>
            
            {/* Clear Logs Button */}
            <button 
                onClick={clearLogs}
                className="absolute top-2 right-2 z-20 pointer-events-auto p-1.5 rounded-sm bg-cyan-950/50 border border-cyan-800/50 text-cyan-700 hover:text-cyan-400 hover:border-cyan-400 opacity-0 group-hover:opacity-100 transition-all duration-300"
                title="Purge Logs"
            >
                <Trash2 size={12} />
            </button>

            <div className="h-28 overflow-hidden relative backdrop-blur-sm bg-gradient-to-t from-cyan-950/40 to-transparent border-x border-cyan-500/10 p-4">
                <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(6,182,212,0.05)_50%,transparent_100%)] bg-[size:100%_4px]"></div>
                <div className="flex flex-col justify-end h-full space-y-2">
                    {logs.map((log, i) => (
                        <div key={i} className="text-[10px] font-mono tracking-wide animate-fade-in-up flex items-center gap-2">
                            <span className="text-cyan-800 text-[8px]">{log.timestamp}</span>
                            <span className={`h-px w-3 ${log.source === 'SYSTEM' ? 'bg-amber-500/50' : 'bg-cyan-500/50'}`}></span>
                            <span className={`font-bold ${log.source === 'SYSTEM' ? 'text-amber-400' : 'text-cyan-300'}`}>{log.source}</span>
                            <span className="text-cyan-100/70 truncate">{log.message}</span>
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="absolute -bottom-2 left-0 w-4 h-4 border-b border-l border-cyan-500/30"></div>
            <div className="absolute -bottom-2 right-0 w-4 h-4 border-b border-r border-cyan-500/30"></div>
        </div>

        {/* Control Deck */}
        <div className="flex gap-12 items-center pointer-events-auto pb-4">
            
             <button 
                onClick={() => setIsMicEnabled(!isMicEnabled)}
                disabled={systemState === SystemState.OFFLINE}
                className={`relative group p-4 rounded-full border transition-all duration-300 ${isMicEnabled ? 'border-cyan-400/60 bg-cyan-950/40 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : 'border-gray-800 bg-black/60'} hover:scale-105`}
             >
                <div className={`absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.3)_0%,transparent_70%)]`}></div>
                {isMicEnabled ? <Mic size={22} className="text-cyan-200" /> : <MicOff size={22} className="text-gray-600" />}
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] tracking-widest text-cyan-800 font-bold opacity-0 group-hover:opacity-100 transition-opacity">AUDIO</span>
            </button>

            <button 
                onClick={systemState === SystemState.OFFLINE ? connectToGemini : disconnect}
                className={`group relative w-28 h-28 flex items-center justify-center transition-all duration-700 transform hover:scale-105 active:scale-95`}
            >
                <div className={`absolute inset-0 rounded-full blur-xl transition-all duration-1000 ${systemState !== SystemState.OFFLINE ? 'bg-cyan-500/20' : 'bg-red-500/5'}`}></div>
                
                <div className={`relative w-full h-full rounded-full border flex items-center justify-center bg-black/80 backdrop-blur-xl transition-all duration-300 ${systemState !== SystemState.OFFLINE ? 'border-cyan-400 shadow-[0_0_40px_rgba(34,211,238,0.3)]' : 'border-red-900/50 border-dashed'}`}>
                    <div className={`absolute inset-1 border border-dashed rounded-full transition-all duration-1000 ${systemState !== SystemState.OFFLINE ? 'border-cyan-300/50 animate-spin-slow' : 'border-red-900/30'}`}></div>
                    <Power className={`w-10 h-10 transition-all duration-500 ${systemState === SystemState.OFFLINE ? 'text-red-900' : 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,1)]'}`} />
                </div>
                
                <span className="absolute -bottom-8 text-[9px] tracking-[0.3em] text-cyan-500/60 font-bold group-hover:text-cyan-400 transition-colors">
                    {systemState === SystemState.OFFLINE ? 'INITIALIZE' : 'TERMINATE'}
                </span>
            </button>

             <button 
                onClick={() => setIsVideoEnabled(!isVideoEnabled)}
                disabled={systemState === SystemState.OFFLINE}
                className={`relative group p-4 rounded-full border transition-all duration-300 ${isVideoEnabled ? 'border-cyan-400/60 bg-cyan-950/40 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : 'border-gray-800 bg-black/60'} hover:scale-105`}
            >
                <div className={`absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.3)_0%,transparent_70%)]`}></div>
                {isVideoEnabled ? <Eye size={22} className="text-cyan-200" /> : <VideoOff size={22} className="text-gray-600" />}
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] tracking-widest text-cyan-800 font-bold opacity-0 group-hover:opacity-100 transition-opacity">VISUAL</span>
            </button>

        </div>
        
        <div className="text-cyan-900/50 text-[10px] tracking-[0.5em] mt-6 uppercase font-bold font-sans">
            Rusho Industries // Mark X
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
      
    </div>
  );
};

export default App;