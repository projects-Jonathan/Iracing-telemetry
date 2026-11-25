/// <reference lib="webworker" />
import { parseIbt } from '../parsers/ibt';
import { parseSimHub } from '../parsers/simhub';
import { buildSession } from '../analysis/session';

export type WorkerIn = { file: File };
export type WorkerOut =
  | { type: 'progress'; stage: string; p: number }
  | { type: 'done'; session: import('../types').Session }
  | { type: 'error'; message: string };

const post = (m: WorkerOut, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const { file } = e.data;
  try {
    post({ type: 'progress', stage: 'Reading file', p: 0 });
    const buf = await file.arrayBuffer();
    const head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    const isSimHub = head[0] === 0x46 && head[1] === 0x46 && head[2] === 0x30 && head[3] === 0x31;
    const onProgress = (p: number) => post({ type: 'progress', stage: 'Decoding telemetry', p });
    const rec = isSimHub ? parseSimHub(buf, onProgress) : parseIbt(buf, onProgress);
    post({ type: 'progress', stage: 'Finding laps', p: 1 });
    const session = buildSession(rec, file.name, file.size);
    const transfer: Transferable[] = Object.values(session.channels).map((a) => a.buffer as ArrayBuffer);
    if (session.map) transfer.push(session.map.x.buffer as ArrayBuffer, session.map.y.buffer as ArrayBuffer);
    post({ type: 'done', session }, [...new Set(transfer)]);
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
