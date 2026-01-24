import { useEffect, useState } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  velocity: { x: number; y: number };
}

interface TaskCompletionCelebrationProps {
  isActive: boolean;
  onComplete?: () => void;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function TaskCompletionCelebration({ isActive, onComplete }: TaskCompletionCelebrationProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isActive) {
      setVisible(true);
      const newParticles: Particle[] = [];
      for (let i = 0; i < 12; i++) {
        newParticles.push({
          id: i,
          x: 50,
          y: 50,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          size: Math.random() * 6 + 4,
          velocity: {
            x: (Math.random() - 0.5) * 8,
            y: (Math.random() - 0.5) * 8,
          },
        });
      }
      setParticles(newParticles);

      const timeout = setTimeout(() => {
        setVisible(false);
        setParticles([]);
        onComplete?.();
      }, 600);

      return () => clearTimeout(timeout);
    }
  }, [isActive, onComplete]);

  if (!visible || particles.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute rounded-full animate-out fade-out zoom-out-50"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
            transform: `translate(${particle.velocity.x * 30}px, ${particle.velocity.y * 30}px)`,
            transition: "all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            animationDuration: "0.5s",
          }}
        />
      ))}
    </div>
  );
}

export function useTaskCompletionCelebration() {
  const [celebrateTaskId, setCelebrateTaskId] = useState<string | null>(null);

  const celebrate = (taskId: string) => {
    setCelebrateTaskId(taskId);
  };

  const clearCelebration = () => {
    setCelebrateTaskId(null);
  };

  return { celebrateTaskId, celebrate, clearCelebration };
}
