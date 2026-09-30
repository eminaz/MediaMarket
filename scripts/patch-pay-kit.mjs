import { readFile, writeFile } from 'node:fs/promises';

// pay-kit 0.12.0 obtains/simulates at "confirmed", but its MPP broadcaster
// omits preflightCommitment (RPC defaults to "finalized"). Surfpool then
// rejects a fresh confirmed blockhash. Match the existing simulation level;
// keep preflight, proof verification, and on-chain confirmation enabled.
const entry = new URL(import.meta.resolve('@solana/pay-kit'));
const metadata = JSON.parse(await readFile(new URL('../package.json', entry), 'utf8'));
if (metadata.version !== '0.12.0')
  throw new Error('Review the pay-kit compatibility patch before changing its pinned version.');
const source = await readFile(entry, 'utf8');
const start = source.indexOf('async function broadcastTransaction(rpcUrl, base64Tx) {');
const end = source.indexOf('function interpretPostTimeoutStatus', start);
if (start < 0 || end < 0)
  throw new Error('Unexpected pay-kit broadcaster; compatibility patch was not applied.');
const section = source.slice(start, end);
const before = 'skipPreflight: false';
const after = 'skipPreflight: false, preflightCommitment: "confirmed"';
if (!section.includes(after)) {
  if (!section.includes(before)) throw new Error('Unexpected pay-kit preflight options.');
  await writeFile(
    entry,
    source.slice(0, start) + section.replace(before, after) + source.slice(end),
  );
}
