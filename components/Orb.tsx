import React, { useEffect, useRef } from 'react';
import { SystemState } from '../types';

interface OrbProps {
  state: SystemState;
  volume: number; // 0 to 1
}

// Particle Class for Nano-Mesh effect
class Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  angle: number;
  speed: number;
  distance: number;
  
  constructor(canvasWidth: number, canvasHeight: number, radius: number) {
    this.angle = Math.random() * Math.PI * 2;
    this.distance = radius + (Math.random() * 20); // Variation in radius
    this.baseX = canvasWidth / 2 + Math.cos(this.angle) * this.distance;
    this.baseY = canvasHeight / 2 + Math.sin(this.angle) * this.distance;
    this.x = this.baseX;
    this.y = this.baseY;
    this.size = Math.random() * 1.5 + 0.5;
    this.speed = Math.random() * 0.02 + 0.01;
  }

  update(volume: number, state: SystemState, time: number, centerX: number, centerY: number) {
    // Rotation
    this.angle += this.speed;
    
    // Breathing effect based on volume
    let expansion = 0;
    if (state === SystemState.SPEAKING) {
        expansion = volume * 150; // Significant expansion when speaking
    } else if (state === SystemState.LISTENING) {
        expansion = Math.sin(time * 2) * 5; // Idle breathing
    } else if (state === SystemState.PROCESSING) {
        this.angle += 0.1; // Fast spin
    }

    const currentRadius = this.distance + expansion;
    this.x = centerX + Math.cos(this.angle) * currentRadius;
    this.y = centerY + Math.sin(this.angle) * currentRadius;
  }
}

const Orb: React.FC<OrbProps> = ({ state, volume }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize Particles
    if (particlesRef.current.length === 0) {
        for (let i = 0; i < 150; i++) {
            particlesRef.current.push(new Particle(canvas.width, canvas.height, 80));
        }
    }

    let animationFrameId: number;
    let time = 0;

    const render = () => {
      time += 0.01;
      
      // Clear with slight fade for trail effect? No, clean clear looks more techy here.
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Color Palette based on State
      let r = 34, g = 211, b = 238; // Cyan
      if (state === SystemState.OFFLINE) { r = 239; g = 68; b = 68; } // Red
      if (state === SystemState.PROCESSING) { r = 250; g = 204; b = 21; } // Yellow
      if (state === SystemState.SPEAKING) { r = 167; g = 243; b = 208; } // Lighter cyan/white

      const colorString = `rgb(${r},${g},${b})`;
      const glowString = `rgba(${r},${g},${b}, 0.5)`;

      // Draw Center Core (The Reactor)
      const coreSize = 30 + (volume * 40);
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreSize + 20);
      gradient.addColorStop(0, 'white');
      gradient.addColorStop(0.3, colorString);
      gradient.addColorStop(1, 'transparent');
      
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreSize + 30, 0, Math.PI * 2);
      ctx.fill();

      // Update and Draw Particles
      ctx.fillStyle = colorString;
      particlesRef.current.forEach(p => {
        p.update(volume, state, time, centerX, centerY);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Connections (The Mesh)
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = glowString;
      
      // Optimization: Only connect nearby particles
      for (let i = 0; i < particlesRef.current.length; i++) {
         // Connect to neighbors in array (simpler than n^2 check)
         const p1 = particlesRef.current[i];
         const p2 = particlesRef.current[(i + 1) % particlesRef.current.length];
         const p3 = particlesRef.current[(i + 5) % particlesRef.current.length];
         
         const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
         
         if (dist < 40) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
         }
         
         // Random cross connections for complexity
         if (Math.random() > 0.98) {
             ctx.beginPath();
             ctx.moveTo(p1.x, p1.y);
             ctx.lineTo(p3.x, p3.y);
             ctx.stroke();
         }
      }

      // Outer Rotating Rings (Iron Man HUD style)
      ctx.strokeStyle = `rgba(${r},${g},${b}, 0.3)`;
      ctx.lineWidth = 2;
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, 130 + (Math.sin(time) * 10), time, time + 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, 145, -time, -time + 4);
      ctx.stroke();

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [state, volume]);

  return (
    <div className="relative flex items-center justify-center">
      {/* Background Glow Container */}
      <div className={`absolute w-[400px] h-[400px] rounded-full blur-[100px] transition-colors duration-500 ${state === SystemState.OFFLINE ? 'bg-red-900/20' : 'bg-cyan-500/10'}`}></div>
      <canvas 
        ref={canvasRef} 
        width={600} 
        height={600} 
        className="z-10 w-[400px] h-[400px]"
      />
    </div>
  );
};

export default Orb;