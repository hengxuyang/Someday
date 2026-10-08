import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sdkCandidates, summariseCompileError } from './ocr.js';

const REAL_ERROR = `/Library/Developer/CommandLineTools/SDKs/MacOSX27.0.sdk/usr/lib/swift/Swift.swiftmodule/arm64e-apple-macos.swiftinterface:3085:100: error: cannot suppress '~Copyable' on generic parameter 'Self.Element' defined in outer scope
 3083 | }
 3085 | extension Swift::BorrowingIteratorProtocol where Self : ~Copyable {

/Library/Developer/CommandLineTools/SDKs/MacOSX27.0.sdk/usr/lib/swift/Swift.swiftmodule/arm64e-apple-macos.swiftinterface:1:1: error: failed to build module 'Swift'; this SDK is not supported by the compiler (the SDK is built with 'Apple Swift version 6.4', while this compiler is 'Apple Swift version 6.3.3'). Please select a toolchain which matches the SDK.`;

test('SDK/compiler mismatch is summarised to the one useful line', () => {
  const msg = summariseCompileError(REAL_ERROR);
  assert.match(msg, /this SDK is not supported by the compiler/);
  assert.ok(msg.length < 400);
  assert.doesNotMatch(msg, /swiftinterface/);
});

test('other compile errors fall back to the first error lines', () => {
  assert.match(summariseCompileError('x.swift:3:5: error: cannot find foo in scope\nnote: blah'), /cannot find foo/);
});

test('SDK candidates: override first, default second, installed SDKs newest-first without duplicates', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sdks-'));
  for (const v of ['MacOSX15.4.sdk', 'MacOSX26.2.sdk', 'MacOSX27.0.sdk']) await mkdir(path.join(dir, v));
  await symlink(path.join(dir, 'MacOSX27.0.sdk'), path.join(dir, 'MacOSX.sdk'));
  const list = await sdkCandidates({ SOMEDAY_SDK: '/my/sdk' }, [dir, '/does/not/exist']);
  const real = await Promise.all(list.slice(2).map((p) => p.replace(/^\/private/, '')));
  assert.equal(list[0], '/my/sdk');
  assert.equal(list[1], null);
  assert.deepEqual(real.map((p) => path.basename(p)), ['MacOSX27.0.sdk', 'MacOSX26.2.sdk', 'MacOSX15.4.sdk']);
});
