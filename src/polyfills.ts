// Polyfills Node pour Vite en browser
import { Buffer } from "buffer";
import process from "process";

(window as any).Buffer = Buffer;
(window as any).process = process;
