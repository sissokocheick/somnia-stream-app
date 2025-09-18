import React from 'react';
import { ethers } from 'ethers'; // StreamInfo utilise BigNumber (BN)

// Dépendances nécessaires pour StreamCard
type BN = ethers.BigNumber;

type StreamInfo = {
  streamId: string;
  sender: string;
  recipient: string;
  token: string;
  deposit: string;
  ratePerSecond: string;
  remaining: string;
  paused: boolean;
  startTime: number;
  stopTime: number;
  lastWithdrawTime: number;
  progress: number;
  withdrawable: string;
  totalWithdrawn: string;
  isActive: boolean;
  _raw: {
    deposit: BN;
    remaining: BN;
    ratePerSecond: BN;
  };
};

const shortenAddress = (addr: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "-");

// Props du composant
type StreamCardProps = {
  stream: StreamInfo;
  onSelect: (s: StreamInfo) => void;
  isActive: boolean;
};

// Le composant lui-même
export const StreamCard = ({ stream, onSelect, isActive }: StreamCardProps) => {
  // ... (collez tout le code de la fonction StreamCard ici)
  const now = Math.floor(Date.now() / 1000);
  const startTime = stream.startTime;
  const rate = parseFloat(stream.ratePerSecond);
  const deposit = parseFloat(stream.deposit);

  const streamDuration = rate > 0 ? Math.floor(deposit / rate) : 0;
  const calculatedEndTime = startTime + streamDuration;

  const timeExpired = now >= calculatedEndTime;
  const noTokensLeft = parseFloat(stream.remaining) <= 0;
  const notActive = !stream.isActive;
  const elapsedTime = now - startTime;
  const durationExceeded = streamDuration > 0 && elapsedTime >= streamDuration;

  const isStreamFinished = timeExpired || noTokensLeft || notActive || durationExceeded;

  let displayStatus = "Active";
  let statusClass = "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300";

  if (stream.paused) {
    displayStatus = "Paused";
    statusClass = "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300";
  } else if (isStreamFinished) {
    displayStatus = "Completed";
    statusClass = "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300";
  }

  return (
    <div
      className={`p-4 rounded-lg border cursor-pointer transition-all ${isActive
          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
          : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
        }`}
      onClick={() => onSelect(stream)}
    >
      {/* ... (le reste du JSX du composant) */}
      <div className="flex justify-between items-start mb-2">
        <div className="text-sm font-medium">Stream #{stream.streamId}</div>
        <div className={`px-2 py-1 rounded text-xs ${statusClass}`}>
          {displayStatus}
        </div>
      </div>
      {/* ... etc. */}
    </div>
  );
};