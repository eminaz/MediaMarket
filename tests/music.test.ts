import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cleanWav, renderMockMusic } from '../src/lib/audio';
import { localMusicConfig, generateLocalMusic } from '../scripts/local-music';

const directory = mkdtempSync(path.join(tmpdir(), 'tastemaker-music-'));
process.env.DATA_DIR = directory;
process.env.EXECUTION_MODE = 'worker';
process.env.PAYMENT_MODE = 'simulated';
process.env.SELLER_WORKER_TOKENS = JSON.stringify({ 'studio.aure': 'music-test-token-1234' });
const { db, getStyle, getStyles, saveJob } = await import('../src/lib/db');
const { createJob } = await import('../src/lib/jobs');
const { pickStyle } = await import('../src/lib/agent');
const { createAgentOrder, agentOrderView } = await import('../src/lib/agent-orders');
const { claimNextJob } = await import('../src/lib/workers');
const { POST: complete } = await import('../src/app/api/worker/jobs/[id]/complete/route');
const { GET: media } = await import('../src/app/api/media/[name]/route');
const { GET: discover } = await import('../src/app/api/agent/styles/route');
const { listingSchema } = await import('../src/lib/validation');
after(() => {
  db().close();
  rmSync(directory, { recursive: true, force: true });
});

test('music selection respects media type and budget; explicit mismatches never create image orders', async () => {
  const styles = getStyles();
  assert.equal(pickStyle(styles, 5, ['luxury'])!.style.type, 'image');
  assert.equal(pickStyle(styles, 5, ['luxury'], 'music')!.style.id, 'luxury-ambient-music');
  assert.equal(pickStyle(styles, 1, [], 'music'), null);
  const result = await (
    await discover(new Request('http://localhost/api/agent/styles?type=music'))
  ).json();
  assert.deepEqual(
    result.styles.map((s: { type: string }) => s.type),
    ['music'],
  );
  const input = {
    prompt: 'Gentle piano and ambient textures',
    budget: 5,
    payment: 'simulated',
    type: 'music',
  };
  assert.throws(
    () => createAgentOrder({ ...input, styleListingId: 'luxury-product-ad' }, 'music-mismatch'),
    /No orderable style/,
  );
  const first = createAgentOrder(input, 'music-agent-order');
  assert.equal(first.job.styleListingId, 'luxury-ambient-music');
  assert.equal(createAgentOrder(input, 'music-agent-order').job.id, first.job.id);
  saveJob({ ...first.job, status: 'failed' }); // Keep the subsequent claim test isolated.
  const listing = {
    ...getStyle('luxury-ambient-music')!,
    handle: 'studio.aure',
    hiddenWorkflowPrompt: 'A restrained ambient soundtrack.',
  };
  for (const durationSeconds of [0, 4, 31, 10.5])
    assert.equal(listingSchema.safeParse({ ...listing, durationSeconds }).success, false);
});

test('music cannot be claimed before payment; completion validates duration, serves WAV ranges, and is idempotent', async () => {
  const job = createJob({
    styleListingId: 'luxury-ambient-music',
    buyerBrief: 'Warm piano for a perfume ad',
    budget: 5,
  });
  assert.equal(claimNextJob('studio.aure', 'Music worker'), null);
  saveJob({ ...job, paymentStatus: 'confirmed' });
  const assignment = claimNextJob('studio.aure', 'Music worker')!;
  assert.equal(assignment.job.id, job.id);
  async function deliver(buffer: Buffer, type = 'audio/wav') {
    const form = new FormData();
    form.set('audio', new Blob([new Uint8Array(buffer)], { type }), 'track.wav');
    form.set('generationMode', 'local');
    return complete(
      new Request('http://localhost', {
        method: 'POST',
        body: form,
        headers: {
          Authorization: 'Bearer music-test-token-1234',
          'x-seller-handle': 'studio.aure',
          'x-claim-token': assignment.claimToken,
        },
      }),
      { params: Promise.resolve({ id: job.id }) },
    );
  }
  assert.equal((await deliver(Buffer.from('not audio'))).status, 400);
  assert.equal((await deliver(renderMockMusic(5, 'test'))).status, 400);
  const result = await deliver(renderMockMusic(10, 'test'));
  assert.equal(result.status, 200);
  const { job: delivered } = await result.json();
  assert.equal(delivered.outputImageUrl, null);
  assert.match(delivered.outputAudioUrl, /\.wav$/);
  assert.equal(agentOrderView(delivered).outputUrl, delivered.outputAudioUrl);
  assert.equal(
    (await (await deliver(Buffer.from('retry'))).json()).job.outputAudioUrl,
    delivered.outputAudioUrl,
  );
  assert.equal(claimNextJob('studio.aure', 'Music worker'), null);
  const params = { params: Promise.resolve({ name: path.basename(delivered.outputAudioUrl) }) };
  const partial = await media(
    new Request('http://localhost/file', { headers: { Range: 'bytes=0-43' } }),
    params,
  );
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('Content-Type'), 'audio/wav');
  assert.equal(Buffer.from(await partial.arrayBuffer()).toString('ascii', 0, 4), 'RIFF');
  const invalid = await media(
    new Request('http://localhost/file', { headers: { Range: 'bytes=999999999-' } }),
    params,
  );
  assert.equal(invalid.status, 416);
});

test('local music receives literal arguments, strips WAV metadata and deletes the private sidecar', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'local-music-'));
  try {
    const wav = renderMockMusic(10, 'fixture');
    const extra = Buffer.from('LIST\x08\x00\x00\x00PRIVATE!');
    const annotated = Buffer.concat([wav, extra]);
    annotated.writeUInt32LE(annotated.length - 8, 4);
    await writeFile(path.join(dir, 'fixture.wav'), annotated);
    const script = path.join(dir, 'music.sh');
    await writeFile(
      script,
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const out = args[args.indexOf('--output') + 1];
fs.writeFileSync('args.json', JSON.stringify(args));
fs.copyFileSync('fixture.wav', out);
fs.writeFileSync(out.replace('.wav', '.metadata.json'), 'PRIVATE WORKFLOW');
`,
      { mode: 0o755 },
    );
    const config = (await localMusicConfig({ LOCAL_MUSIC_SCRIPT: script }))!;
    const prompt = 'Warm piano; $(touch injected) `touch injected`';
    const output = path.join(dir, 'out.wav');
    const audio = await generateLocalMusic(config, prompt, 10, output);
    assert.deepEqual(audio, wav);
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'args.json'), 'utf8')), [
      '--prompt',
      prompt,
      '--duration',
      '10',
      '--output',
      output,
    ]);
    for (const name of ['out.wav', 'out.metadata.json', 'injected'])
      await assert.rejects(access(path.join(dir, name)));
    assert.throws(() => cleanWav(audio, 5), /duration/);
    await writeFile(script, '#!/bin/sh\nexit 7\n', { mode: 0o755 });
    await assert.rejects(generateLocalMusic(config, prompt, 10, output), /code 7/);
    await writeFile(script, '#!/bin/sh\nsleep 30\n', { mode: 0o755 });
    await assert.rejects(
      generateLocalMusic({ ...config, timeoutMs: 100 }, prompt, 10, output),
      /timed out/,
    );
    assert.equal(await localMusicConfig({ SELLER_GENERATOR: 'mock' }), null);
    await assert.rejects(localMusicConfig({ LOCAL_MUSIC_SCRIPT: '/missing/music.sh' }), /missing/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
