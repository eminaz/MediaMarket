import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {
  localGeneratorConfig,
  buildGenerationPrompt,
  generateLocalImage,
} from '../scripts/local-generator';

test('local adapter passes literal arguments, combines the recipe, and strips private metadata', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'local-generator-'));
  try {
    const fixture = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#ccaaff' },
    })
      .withExif({ IFD0: { ImageDescription: 'private workflow' } })
      .png()
      .toBuffer();
    await writeFile(path.join(dir, 'fixture.png'), fixture);
    const script = path.join(dir, 'generate.sh');
    await writeFile(
      script,
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync('args.json', JSON.stringify(args));
fs.copyFileSync('fixture.png', args[args.indexOf('--output') + 1]);
`,
      { mode: 0o755 },
    );
    const config = (await localGeneratorConfig({
      SELLER_GENERATOR: 'local',
      LOCAL_GENERATOR_SCRIPT: script,
    }))!;
    const brief = 'A bottle; $(touch injected) `touch injected` "quoted"\nSecond line';
    const prompt = buildGenerationPrompt('Soft light, brushed gold.', brief, 'AURA');
    const outputPath = path.join(dir, 'result.png');
    const output = await generateLocalImage(config, prompt, outputPath);
    const args = JSON.parse(await readFile(path.join(dir, 'args.json'), 'utf8'));
    assert.equal(args[1], prompt);
    assert.ok(args[1].includes(brief));
    assert.ok(args[1].includes('Soft light, brushed gold.'));
    assert.deepEqual(args.slice(2), [
      '--steps',
      '4',
      '--seed',
      '42',
      '--width',
      '768',
      '--height',
      '768',
      '--output',
      outputPath,
    ]);
    assert.equal((await sharp(output).metadata()).exif, undefined);
    await assert.rejects(access(outputPath));
    await assert.rejects(access(path.join(dir, 'injected')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('explicit local configuration fails instead of silently producing a mock', async () => {
  assert.equal(await localGeneratorConfig({ SELLER_GENERATOR: 'mock' }), null);
  await assert.rejects(
    localGeneratorConfig({ LOCAL_GENERATOR_SCRIPT: '/missing/generate.sh' }),
    /missing or not executable/,
  );
});

test('generator failures and timeouts reject without leaving a result', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'local-generator-failure-'));
  try {
    const script = path.join(dir, 'generate.sh');
    await writeFile(script, '#!/bin/sh\nexit 7\n', { mode: 0o755 });
    const config = (await localGeneratorConfig({ LOCAL_GENERATOR_SCRIPT: script }))!;
    await assert.rejects(generateLocalImage(config, 'test', path.join(dir, 'out.png')), /code 7/);
    await writeFile(script, '#!/bin/sh\nsleep 30\n', { mode: 0o755 });
    await assert.rejects(
      generateLocalImage({ ...config, timeoutMs: 100 }, 'test', path.join(dir, 'out.png')),
      /timed out/,
    );
    const controller = new AbortController();
    const pending = generateLocalImage(
      config,
      'test',
      path.join(dir, 'out.png'),
      controller.signal,
    );
    controller.abort();
    await assert.rejects(pending, /cancelled/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
