import { BigNumber } from "ethers";

export type BN = BigNumber;

export interface StreamRaw {
  sender: string;
  recipient: string;
  token: string;
  deposit: BN;
  ratePerSecond: BN;
  remainingBalance: BN;
  startTime: BN;
  stopTime: BN;
  lastWithdrawTime: BN;
  totalWithdrawn: BN;
  isActive: boolean;
  isPaused: boolean;
  pausedTime: BN;
}

export interface StreamInfo {
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
}

export interface AppState {
  account: string;
  chainId: number | null;
  connected: boolean;
  loading: boolean;
  error: string | null;
  streams: StreamInfo[];
  activeStream: StreamInfo | null;
  tokenInfo: {
    decimals: number;
    symbol: string;
    name: string;
    balance: string;
    allowance: string;
    _rawBalance?: string;
    _rawAllowance?: string;
  };
}

export type AppAction =
  | { type: "SET_ACCOUNT"; payload: string }
  | { type: "SET_CHAIN_ID"; payload: number }
  | { type: "SET_CONNECTED"; payload: boolean }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_STREAMS"; payload: StreamInfo[] }
  | { type: "SET_ACTIVE_STREAM"; payload: StreamInfo | null }
  | { type: "SET_TOKEN_INFO"; payload: Partial<AppState["tokenInfo"]> }
  | { type: "UPDATE_STREAM"; payload: StreamInfo }
  | { type: "RESET" };