import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { renderMockMusic } from '../src/lib/audio';
import { mp4Duration, renderMockVideo, validateMp4 } from '../src/lib/video';
import { localGeneratorConfig } from '../scripts/local-generator';
import { localMusicConfig } from '../scripts/local-music';
import {
  localVideoConfig,
  generateLocalVideo,
  splitVideoRecipe,
  videoCopy,
} from '../scripts/local-video';

const directory = mkdtempSync(path.join(tmpdir(), 'tastemaker-video-'));
process.env.DATA_DIR = directory;
process.env.EXECUTION_MODE = 'worker';
process.env.PAYMENT_MODE = 'simulated';
process.env.SELLER_WORKER_TOKENS = JSON.stringify({ 'studio.aure': 'video-test-token-1234' });
const { db, getStyle, getStyles, saveJob } = await import('../src/lib/db');
const { createJob } = await import('../src/lib/jobs');
const { pickStyle } = await import('../src/lib/agent');
const { createAgentOrder, agentOrderView } = await import('../src/lib/agent-orders');
const { claimNextJob } = await import('../src/lib/workers');
const { POST: complete } = await import('../src/app/api/worker/jobs/[id]/complete/route');
const { GET: media } = await import('../src/app/api/media/[name]/route');
const { GET: discover } = await import('../src/app/api/agent/styles/route');
const { listingSchema } = await import('../src/lib/validation');
const style = getStyle('luxury-product-film')!;
const clip = (durationSeconds: number) =>
  renderMockVideo({
    durationSeconds,
    buyerBrief: 'Serum launch',
    brandName: 'AURA',
    styleListing: style,
  });
after(() => {
  db().close();
  rmSync(directory, { recursive: true, force: true });
});

test('video selection respects media type and budget; listings validate duration', async () => {
  const styles = getStyles();
  assert.equal(pickStyle(styles, 5, ['luxury'], 'video')!.style.id, 'luxury-product-film');
  assert.equal(pickStyle(styles, 4, [], 'video'), null);
  const result = await (
    await discover(new Request('http://localhost/api/agent/styles?type=video'))
  ).json();
  assert.deepEqual(
    result.styles.map((s: { type: string }) => s.type),
    ['video'],
  );
  const input = { prompt: 'A serum launch film', budget: 5, payment: 'simulated', type: 'video' };
  assert.throws(
    () => createAgentOrder({ ...input, styleListingId: 'luxury-ambient-music' }, 'video-mismatch'),
    /No orderable style/,
  );
  const order = createAgentOrder(input, 'video-agent-order');
  assert.equal(order.job.styleListingId, 'luxury-product-film');
  saveJob({ ...order.job, status: 'failed' }); // Keep the claim test isolated.
  const listing = { ...style, handle: 'studio.aure', hiddenWorkflowPrompt: 'Quiet product film.' };
  assert.equal(listingSchema.parse({ ...listing, durationSeconds: 15 }).type, 'video');
  for (const durationSeconds of [4, 31, 7.5])
    assert.equal(listingSchema.safeParse({ ...listing, durationSeconds }).success, false);
});

test('MP4 validation rejects non-video, wrong durations and truncated files', async () => {
  const video = await clip(5);
  assert.ok(Math.abs(mp4Duration(video) - 5) < 0.1);
  assert.equal(validateMp4(video, 5), video);
  assert.throws(() => validateMp4(video, 15), /duration/);
  assert.throws(() => validateMp4(video.subarray(0, video.length - 100)), /MP4/);
  assert.throws(() => validateMp4(renderMockMusic(5, 'x')), /MP4/);
});

test('video cannot be claimed before payment; completion validates MP4, serves ranges, and is idempotent', async () => {
  const job = createJob({
    styleListingId: 'luxury-product-film',
    buyerBrief: 'A serum launch film',
    brandName: 'AURA',
    budget: 5,
  });
  assert.equal(claimNextJob('studio.aure', 'Video worker'), null);
  saveJob({ ...job, paymentStatus: 'confirmed' });
  const assignment = claimNextJob('studio.aure', 'Video worker')!;
  assert.equal(assignment.job.id, job.id);
  async function deliver(buffer: Buffer, type = 'video/mp4') {
    const form = new FormData();
    form.set('video', new Blob([new Uint8Array(buffer)], { type }), 'film.mp4');
    form.set('generationMode', 'local');
    return complete(
      new Request('http://localhost', {
        method: 'POST',
        body: form,
        headers: {
          Authorization: 'Bearer video-test-token-1234',
          'x-seller-handle': 'studio.aure',
          'x-claim-token': assignment.claimToken,
        },
      }),
      { params: Promise.resolve({ id: job.id }) },
    );
  }
  const film = await clip(15);
  assert.equal((await deliver(Buffer.from('not a video'))).status, 400);
  assert.equal((await deliver(await clip(5))).status, 400);
  assert.equal((await deliver(film, 'video/quicktime')).status, 400);
  const result = await deliver(film);
  assert.equal(result.status, 200);
  const { job: delivered } = await result.json();
  assert.equal(delivered.outputImageUrl, null);
  assert.match(delivered.outputVideoUrl, /\.mp4$/);
  assert.equal(agentOrderView(delivered).outputUrl, delivered.outputVideoUrl);
  assert.equal(
    (await (await deliver(Buffer.from('retry'))).json()).job.outputVideoUrl,
    delivered.outputVideoUrl,
  );
  const params = { params: Promise.resolve({ name: path.basename(delivered.outputVideoUrl) }) };
  const partial = await media(
    new Request('http://localhost/file', { headers: { Range: 'bytes=4-11' } }),
    params,
  );
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('Content-Type'), 'video/mp4');
  assert.equal(Buffer.from(await partial.arrayBuffer()).toString('latin1', 0, 4), 'ftyp');
  const download = await media(new Request('http://localhost/file?download=1'), params);
  assert.match(download.headers.get('Content-Disposition')!, /tastemaker-creation\.mp4/);
});

test('recipes split the soundtrack; headlines use only the buyer brief and brand', () => {
  assert.deepEqual(splitVideoRecipe('Warm light, glass. Soundtrack: soft piano, no vocals.'), {
    visual: 'Warm light, glass.',
    soundtrack: 'soft piano, no vocals.',
  });
  assert.match(splitVideoRecipe('Warm light only.').soundtrack, /no vocals/);
  const copy = videoCopy('A launch film for a botanical skincare serum. Morning light.', 'Aura', 4);
  assert.equal(copy.brand, 'AURA');
  assert.equal(copy.cta, 'DISCOVER AURA');
  assert.deepEqual(
    copy.slides.map((s) => s.title),
    ['Meet Aura.', 'Every detail matters.', 'Made for your day.', 'Discover Aura.'],
  );
  assert.equal(copy.slides[0].subtitle, 'A launch film for a botanical skincare serum');
  assert.equal(videoCopy('Short', '', 1).slides[0].title, 'A quiet statement.');
});

test('local video generates scenes and music, renders with literal arguments and deletes all intermediates', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'local-video-'));
  try {
    await writeFile(
      path.join(dir, 'fixture.png'),
      await sharp({ create: { width: 32, height: 32, channels: 3, background: '#ccaaff' } })
        .png()
        .toBuffer(),
    );
    await writeFile(path.join(dir, 'fixture.wav'), renderMockMusic(5, 'fixture'));
    await writeFile(path.join(dir, 'fixture.mp4'), await clip(5));
    const script = async (name: string, body: string) => {
      const file = path.join(dir, name);
      await writeFile(
        file,
        `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const out = args[args.indexOf('--output') + 1];
fs.appendFileSync('calls.jsonl', JSON.stringify({ script: '${name}', args }) + '\\n');
${body}
`,
        { mode: 0o755 },
      );
      return file;
    };
    const env = {
      LOCAL_GENERATOR_SCRIPT: await script('generate.sh', "fs.copyFileSync('fixture.png', out);"),
      LOCAL_MUSIC_SCRIPT: await script('music.sh', "fs.copyFileSync('fixture.wav', out);"),
      LOCAL_VIDEO_SCRIPT: await script(
        'demo-video.sh',
        `const config = args[args.indexOf('--config') + 1];
fs.writeFileSync('props.json', fs.readFileSync(config));
const props = JSON.parse(fs.readFileSync(config, 'utf8'));
const base = require('node:path').dirname(config);
for (const s of props.slides) fs.accessSync(require('node:path').join(base, s.image));
fs.accessSync(require('node:path').join(base, props.music));
fs.copyFileSync('fixture.mp4', out);
fs.writeFileSync(out + '.metadata.json', 'PRIVATE');`,
      ),
      LOCAL_VIDEO_SLIDES: '8',
    };
    const imageGenerator = (await localGeneratorConfig(env))!;
    const config = (await localVideoConfig(imageGenerator, env))!;
    const brief = 'A serum; $(touch injected) `touch injected`';
    const phases: string[] = [];
    const work = path.join(dir, 'work');
    await rm(work, { force: true, recursive: true });
    await import('node:fs/promises').then((fs) => fs.mkdir(work));
    const video = await generateLocalVideo({
      config,
      imageGenerator,
      musicGenerator: await localMusicConfig(env),
      workflowPrompt: 'Private visual recipe. Soundtrack: private music recipe.',
      brief,
      brand: 'AURA',
      durationSeconds: 5,
      workDirectory: work,
      onPhase: (phase) => phases.push(phase),
    });
    assert.ok(Math.abs(mp4Duration(video) - 5) < 0.1);
    assert.deepEqual(await readdir(work), []);
    const calls = (await readFile(path.join(dir, 'calls.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    // Eight requested scenes shrink to fit five seconds with 0.6-second crossfades.
    const scenes = calls.filter((c) => c.script === 'generate.sh');
    assert.equal(scenes.length, 6);
    assert.deepEqual(
      scenes.map((c) => c.args[c.args.indexOf('--seed') + 1]),
      ['42', '43', '44', '45', '46', '47'],
    );
    const scenePrompt = scenes[0].args[scenes[0].args.indexOf('--prompt') + 1];
    assert.match(scenePrompt, /Private visual recipe/);
    assert.doesNotMatch(scenePrompt, /private music recipe/);
    assert.ok(scenePrompt.includes(brief));
    const musicCall = calls.find((c) => c.script === 'music.sh');
    assert.match(musicCall.args[musicCall.args.indexOf('--prompt') + 1], /^private music recipe/);
    assert.equal(musicCall.args[musicCall.args.indexOf('--duration') + 1], '5');
    const props = JSON.parse(await readFile(path.join(dir, 'props.json'), 'utf8'));
    assert.equal(props.slides.length, 6);
    assert.equal(props.durationSeconds, 5);
    assert.doesNotMatch(JSON.stringify(props), /recipe/);
    assert.equal(phases.at(-1), 'Rendering the video with Remotion');
    await assert.rejects(readFile(path.join(dir, 'injected')));
    assert.equal(await localVideoConfig(imageGenerator, { SELLER_GENERATOR: 'mock' }), null);
    assert.equal(await localVideoConfig(null, { LOCAL_VIDEO_SCRIPT: '' }), null);
    await assert.rejects(
      localVideoConfig(null, { ...env, SELLER_VIDEO_GENERATOR: 'local' }),
      /image generator/,
    );
    await assert.rejects(
      localVideoConfig(imageGenerator, { LOCAL_VIDEO_SCRIPT: '/missing/demo-video.sh' }),
      /missing/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
