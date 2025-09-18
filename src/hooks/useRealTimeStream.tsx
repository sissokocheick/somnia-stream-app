// hooks/useRealTimeStream.ts
import { useEffect, useRef, useState } from 'react';
import type { StreamInfo } from '../lib/types';

export const useRealTimeStream = (stream: StreamInfo | null, isActive: boolean = false) => {
  const [liveStream, setLiveStream] = useState<StreamInfo | null>(stream);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!stream || !isActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const updateStreamProgress = () => {
      const now = Math.floor(Date.now() / 1000);
      const startTime = stream.startTime;
      const stopTime = stream.stopTime;

      if (stream.paused || now < startTime || now >= stopTime) return;

      // Calcul en temps réel de la progression
      const elapsedTime = now - startTime;
      const totalDuration = stopTime - startTime;
      const progress = Math.min(100, (elapsedTime / totalDuration) * 100);

      // Calcul du montant retirable mis à jour
      const ratePerSecond = parseFloat(stream.ratePerSecond);
      const elapsedTokens = ratePerSecond * elapsedTime;
      const withdrawable = Math.max(0, elapsedTokens - parseFloat(stream.totalWithdrawn));

      setLiveStream(prev => prev ? {
        ...prev,
        progress,
        withdrawable: withdrawable.toFixed(6)
      } : null);
    };

    // Mise à jour toutes les secondes pour les streams actifs
    intervalRef.current = setInterval(updateStreamProgress, 1000);
    updateStreamProgress(); // Première mise à jour immédiate

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [stream, isActive]);

  useEffect(() => {
    setLiveStream(stream);
  }, [stream]);

  return liveStream;
};

// Composant barre de progression animée
export const AnimatedProgressBar: React.FC<{
  progress: number;
  isActive: boolean;
  isPaused: boolean;
}> = ({ progress, isActive, isPaused }) => {
  return (
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
      <div 
        className={`h-full rounded-full transition-all duration-1000 ${
          isPaused ? 'bg-yellow-500' : 
          isActive ? 'bg-gradient-to-r from-blue-500 to-green-500' : 
          'bg-gray-400'
        }`}
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
};

// Compteur temps réel
export const RealTimeCounter: React.FC<{
  startTime: number;
  stopTime: number;
  isPaused: boolean;
}> = ({ startTime, stopTime, isPaused }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (isPaused) return;

    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      
      if (now < startTime) {
        const diff = startTime - now;
        setTimeLeft(`Démarre dans ${formatDuration(diff)}`);
      } else if (now >= stopTime) {
        setTimeLeft('Terminé');
      } else {
        const remaining = stopTime - now;
        setTimeLeft(`${formatDuration(remaining)} restant`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [startTime, stopTime, isPaused]);

  return (
    <div className="text-sm text-gray-600 dark:text-gray-400">
      {isPaused ? 'En pause' : timeLeft}
    </div>
  );
};

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};