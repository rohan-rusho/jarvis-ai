import React from 'react';

const TechOverlay: React.FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none z-10 w-full h-full overflow-hidden text-cyan-500/80 font-mono select-none">
      
      {/* --- SVG HUD LAYER --- */}
      <svg className="absolute inset-0 w-full h-full opacity-40">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Center Reticle Group */}
        <g transform={`translate(${window.innerWidth/2}, ${window.innerHeight/2})`} filter="url(#glow)">
           {/* Static large ring */}
           <circle r="320" fill="none" stroke="#22d3ee" strokeWidth="0.5" opacity="0.15" />
           <circle r="280" fill="none" stroke="#22d3ee" strokeWidth="0.2" opacity="0.1" strokeDasharray="5 5"/>
           
           {/* Rotating Elements (CSS Animation) */}
           <g className="animate-spin-slow" style={{ animationDuration: '60s' }}>
               <circle r="260" fill="none" stroke="#22d3ee" strokeWidth="1" strokeDasharray="10 60" opacity="0.4" />
               <path d="M 0 -270 L 0 -255" stroke="#22d3ee" strokeWidth="2" />
               <path d="M 0 270 L 0 255" stroke="#22d3ee" strokeWidth="2" />
               <path d="M -270 0 L -255 0" stroke="#22d3ee" strokeWidth="2" />
               <path d="M 270 0 L 255 0" stroke="#22d3ee" strokeWidth="2" />
           </g>

           <g className="animate-spin-slow" style={{ animationDuration: '30s', animationDirection: 'reverse' }}>
                <circle r="220" fill="none" stroke="#22d3ee" strokeWidth="0.5" strokeDasharray="2 10" opacity="0.5" />
           </g>
           
           {/* Brackets */}
           <path d="M -100 -50 L -120 -50 L -120 50 L -100 50" fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.6" />
           <path d="M 100 -50 L 120 -50 L 120 50 L 100 50" fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.6" />
           
           {/* Center Cross */}
           <line x1="-10" y1="0" x2="10" y2="0" stroke="#22d3ee" strokeWidth="1" opacity="0.5"/>
           <line x1="0" y1="-10" x2="0" y2="10" stroke="#22d3ee" strokeWidth="1" opacity="0.5"/>
        </g>

        {/* Decorative Lines */}
        <line x1="100" y1={window.innerHeight - 100} x2="300" y2={window.innerHeight - 100} stroke="#22d3ee" strokeWidth="1" opacity="0.3"/>
        <line x1={window.innerWidth - 300} y1={window.innerHeight - 100} x2={window.innerWidth - 100} y2={window.innerHeight - 100} stroke="#22d3ee" strokeWidth="1" opacity="0.3"/>
      </svg>

      {/* --- DATA COLUMNS --- */}
      
      {/* Left Data Column */}
      <div className="absolute top-1/2 left-10 -translate-y-1/2 w-56 hidden lg:block space-y-6">
         <div>
            <div className="flex justify-between border-b border-cyan-800/50 pb-1 mb-2">
                <span className="text-[9px] tracking-[0.2em] text-cyan-400 font-bold">RUSHO_IND_SYS</span>
                <span className="text-[9px] text-cyan-200">ONLINE</span>
            </div>
            {/* Fake Code Block */}
            <div className="space-y-1 opacity-70">
                <div className="h-1 w-full bg-cyan-900/30 overflow-hidden">
                    <div className="h-full bg-cyan-500/50 animate-pulse w-3/4"></div>
                </div>
                <div className="h-1 w-full bg-cyan-900/30 overflow-hidden">
                    <div className="h-full bg-cyan-500/50 animate-pulse w-1/2" style={{animationDelay: '0.2s'}}></div>
                </div>
                <div className="h-1 w-full bg-cyan-900/30 overflow-hidden">
                    <div className="h-full bg-cyan-500/50 animate-pulse w-5/6" style={{animationDelay: '0.4s'}}></div>
                </div>
            </div>
         </div>

         <div>
             <div className="text-[9px] tracking-widest text-cyan-400 mb-2 font-bold">CORE_STABILITY</div>
             <div className="grid grid-cols-5 gap-1 h-12 opacity-60">
                 {[...Array(15)].map((_, i) => (
                     <div key={i} className="bg-cyan-900/20 border border-cyan-500/30" style={{ opacity: Math.random() > 0.5 ? 1 : 0.2 }} />
                 ))}
             </div>
         </div>
      </div>

      {/* Right Data Column */}
      <div className="absolute top-1/2 right-10 -translate-y-1/2 w-56 hidden lg:block text-right space-y-6">
         <div>
            <div className="flex justify-between border-b border-cyan-800/50 pb-1 mb-2">
                <span className="text-[9px] text-cyan-200">V.8.0.2</span>
                <span className="text-[9px] tracking-[0.2em] text-cyan-400 font-bold">NET_STATUS</span>
            </div>
            <div className="flex justify-end gap-1 h-2">
                {[...Array(20)].map((_, i) => (
                    <div key={i} className={`flex-1 rounded-sm ${i > 2 ? 'bg-cyan-400/80' : 'bg-white animate-pulse'}`} />
                ))}
            </div>
            <div className="mt-2 text-[8px] text-cyan-600 tracking-wider">
                UL: 450 TB/s <br/>
                DL: 980 TB/s
            </div>
         </div>
      </div>
      
      {/* Bottom Center Label */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[8px] text-cyan-800 tracking-[0.5em] font-bold opacity-50">
          PROJECT: RUSHO
      </div>

    </div>
  );
};

export default TechOverlay;