import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { getAddressDecoder, isAddress } from '@solana/addresses';

export function requirePayoutAddress(value: string) {
  if (!isAddress(value)) throw new Error('Payout address must be a valid Solana wallet address.');
  return value;
}
export function defaultPayoutAddress(handle: string) {
  // Same public demo seed as the original Signer.bytes implementation. Never use for real funds.
  const seed = createHash('sha256').update(`tastemaker-sandbox-seller:${handle}`).digest();
  const key = createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKey = createPublicKey(key).export({ format: 'der', type: 'spki' });
  return getAddressDecoder().decode(publicKey.subarray(-32));
}
export function payoutOverrides(): Record<string, string> {
  const values = JSON.parse(process.env.SELLER_PAYOUT_ADDRESSES || '{}');
  if (!values || typeof values !== 'object' || Array.isArray(values))
    throw new Error('SELLER_PAYOUT_ADDRESSES must be a JSON handle/address map.');
  for (const value of Object.values(values)) {
    if (typeof value !== 'string') throw new Error('Invalid seller payout address configuration.');
    requirePayoutAddress(value);
  }
  return values;
}
