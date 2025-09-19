import { ethers } from "ethers";
import type { BN } from "./types"; // On importe notre type BN

export const isTxHash = (v: string) => /^0x[0-9a-fA-F]{64}$/.test(v);

export const fmtUnits = (bn: BN, dec = 18) => {
  try {
    return ethers.utils.formatUnits(bn, dec);
  } catch {
    return bn.toString();
  }
};

export const parseUnitsSafe = (amount: string, dec = 18) => {
  return ethers.utils.parseUnits(amount || "0", dec);
};

export const shortenAddress = (addr: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "-");

export const formatTime = (ts: number) => new Date(ts * 1000).toLocaleString();

export const calcProgress = (deposit: BN, remaining: BN) => {
  if (deposit.isZero()) return 0;
  const spent = deposit.sub(remaining);
  return Math.min(100, Math.max(0, spent.mul(10000).div(deposit).toNumber() / 100));
};