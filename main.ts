import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

function run(prog: Uint8Array, input: Uint8Array): { out: number[]; code: number } {
  const st: number[] = [];
  const cs: number[] = [];
  const mem = new Int32Array(256);
  const out: number[] = [];
  let pc = 0;
  let steps = 0;
  let ip = 0;
  const trap = (code: number) => ({ out, code });
  while (true) {
    if (steps >= 1000000) return trap(10);
    if (pc < 0 || pc >= prog.length) return trap(9);
    const op = prog[pc];
    const il = op === 1 ? 1 : op === 2 ? 4 : op >= 48 && op <= 51 ? 2 : 0;
    if (pc + 1 + il > prog.length) return trap(9);
    let pops = 0;
    let pushes = 0;
    if (op === 1 || op === 2 || op === 82) pushes = 1;
    else if (op === 3 || op === 49 || op === 50 || op === 80 || op === 81 || op === 83) pops = 1;
    else if (op === 23 || op === 27 || op === 64) { pops = 1; pushes = 1; }
    else if (op === 4 || op === 6) { pops = 1; pushes = 2; }
    else if (op === 5) { pops = 2; pushes = 2; }
    else if (op === 7) { pops = 3; pushes = 3; }
    else if (op === 65) pops = 2;
    else if ((op >= 16 && op <= 30) || (op >= 32 && op <= 34)) { pops = 2; pushes = 1; }
    if (st.length < pops) return trap(2);
    if (st.length - pops + pushes > 256) return trap(3);
    steps++;
    const next = pc + 1 + il;
    const b1 = il >= 1 ? prog[pc + 1] : 0;
    const b2 = il >= 2 ? prog[pc + 2] : 0;
    const b3 = il >= 3 ? prog[pc + 3] : 0;
    const b4 = il >= 4 ? prog[pc + 4] : 0;
    const u16 = b1 | (b2 << 8);
    const s16 = (u16 << 16) >> 16;
    pc = next;
    const pop = () => st.pop() as number;
    switch (op) {
      case 0: return { out, code: 0 };
      case 1: st.push((b1 << 24) >> 24); break;
      case 2: st.push(b1 | (b2 << 8) | (b3 << 16) | (b4 << 24)); break;
      case 3: pop(); break;
      case 4: st.push(st[st.length - 1]); break;
      case 5: {
        const t = st[st.length - 1];
        st[st.length - 1] = st[st.length - 2];
        st[st.length - 2] = t;
        break;
      }
      case 6: st.push(st[st.length - 2]); break;
      case 7: {
        const a = st[st.length - 3];
        st[st.length - 3] = st[st.length - 2];
        st[st.length - 2] = st[st.length - 1];
        st[st.length - 1] = a;
        break;
      }
      case 16: { const b = pop(), a = pop(); st.push((a + b) | 0); break; }
      case 17: { const b = pop(), a = pop(); st.push((a - b) | 0); break; }
      case 18: { const b = pop(), a = pop(); st.push(Math.imul(a, b)); break; }
      case 19: { const b = pop(), a = pop(); if (b === 0) return trap(4); st.push(Math.trunc(a / b) | 0); break; }
      case 20: { const b = pop(), a = pop(); if (b === 0) return trap(4); st.push((a % b) | 0); break; }
      case 21: { const b = pop(), a = pop(); if (b === 0) return trap(4); st.push(Math.trunc((a >>> 0) / (b >>> 0)) | 0); break; }
      case 22: { const b = pop(), a = pop(); if (b === 0) return trap(4); st.push(((a >>> 0) % (b >>> 0)) | 0); break; }
      case 23: st.push((-pop()) | 0); break;
      case 24: { const b = pop(), a = pop(); st.push(a & b); break; }
      case 25: { const b = pop(), a = pop(); st.push(a | b); break; }
      case 26: { const b = pop(), a = pop(); st.push(a ^ b); break; }
      case 27: st.push(~pop()); break;
      case 28: { const b = pop(), a = pop(); st.push(a << (b & 31)); break; }
      case 29: { const b = pop(), a = pop(); st.push(a >> (b & 31)); break; }
      case 30: { const b = pop(), a = pop(); st.push((a >>> (b & 31)) | 0); break; }
      case 32: { const b = pop(), a = pop(); st.push(a === b ? 1 : 0); break; }
      case 33: { const b = pop(), a = pop(); st.push(a < b ? 1 : 0); break; }
      case 34: { const b = pop(), a = pop(); st.push((a >>> 0) < (b >>> 0) ? 1 : 0); break; }
      case 48: pc = next + s16; break;
      case 49: { const v = pop(); if (v === 0) pc = next + s16; break; }
      case 50: { const v = pop(); if (v !== 0) pc = next + s16; break; }
      case 51: if (cs.length >= 64) return trap(7); cs.push(next); pc = u16; break;
      case 52: if (cs.length === 0) return trap(8); pc = cs.pop() as number; break;
      case 64: { const a = pop(); if (a < 0 || a > 255) return trap(6); st.push(mem[a]); break; }
      case 65: { const a = pop(), v = pop(); if (a < 0 || a > 255) return trap(6); mem[a] = v; break; }
      case 80: {
        const v = pop();
        const s = String(v);
        if (out.length + s.length > 65536) return trap(11);
        for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
        break;
      }
      case 81: { const v = pop(); if (out.length + 1 > 65536) return trap(11); out.push(v & 255); break; }
      case 82: st.push(ip < input.length ? input[ip++] : -1); break;
      case 83: return { out, code: pop() & 255 };
      default: return trap(5);
    }
  }
}

for (const id of readdirSync(inputDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  const prog = new Uint8Array(readFileSync(join(inputDir, id, "program.bin")));
  let input = new Uint8Array(0);
  try { input = new Uint8Array(readFileSync(join(inputDir, id, "input.bin"))); } catch { /* no input file */ }
  const { out, code } = run(prog, input);
  mkdirSync(join(outputDir, id), { recursive: true });
  writeFileSync(join(outputDir, id, "stdout.bin"), Buffer.from(out));
  writeFileSync(join(outputDir, id, "exit.txt"), code + "\n");
}
