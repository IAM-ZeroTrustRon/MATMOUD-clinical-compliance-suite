/**
 * Tests for upload content validation.
 *
 * Why these exist (audit finding MOUD-04):
 *   Upload validation previously inspected only multer's file.mimetype, which
 *   is populated from the client-asserted Content-Type header. A client could
 *   declare any type it liked, so arbitrary content could be stored in the PHI
 *   document bucket under an approved type and later served as that type.
 *
 *   The disguised-payload test below is the one that would have caught it.
 *
 * Also covers the extension derivation used by MOUD-05 — the S3 key extension
 * must come from the detected type, never from the uploaded filename.
 */

import {
  detectFileType,
  validateUpload,
  validateMimeType,
  MAX_FILE_SIZE_BYTES,
} from '../validator';

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe('detectFileType', () => {
  it('identifies a PDF from its signature', () => {
    expect(detectFileType(PDF)).toBe('application/pdf');
  });

  it('identifies a PNG from its signature', () => {
    expect(detectFileType(PNG)).toBe('image/png');
  });

  it('identifies a JPEG from its signature', () => {
    expect(detectFileType(JPEG)).toBe('image/jpeg');
  });

  it('returns null for content matching no permitted signature', () => {
    expect(detectFileType(Buffer.from('MZ\x90\x00', 'binary'))).toBeNull(); // Windows PE
    expect(detectFileType(Buffer.from('#!/bin/sh\necho hi'))).toBeNull();
    expect(detectFileType(Buffer.from('<?php system($_GET[0]); ?>'))).toBeNull();
  });

  it('fails closed on an empty buffer', () => {
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
  });

  it('fails closed on a buffer shorter than any signature', () => {
    expect(detectFileType(Buffer.from([0x89]))).toBeNull();
  });

  it('does not match a signature appearing later in the file', () => {
    const buried = Buffer.concat([Buffer.from('junk'), PDF]);
    expect(detectFileType(buried)).toBeNull();
  });
});

describe('validateUpload (regression: MOUD-04)', () => {
  it('rejects a payload disguised with an approved Content-Type', () => {
    const shellScript = Buffer.from('#!/bin/sh\nrm -rf /\n');
    const result = validateUpload('application/pdf', shellScript);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_file_type');
  });

  it('rejects real content whose declared type does not match its bytes', () => {
    const result = validateUpload('application/pdf', PNG);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('content_type_mismatch');
  });

  it('rejects a disallowed declared type even when the bytes are valid', () => {
    const result = validateUpload('application/x-msdownload', PDF);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unsupported_file_type');
  });

  it('rejects an empty upload', () => {
    const result = validateUpload('application/pdf', Buffer.alloc(0));
    expect(result.ok).toBe(false);
  });

  it.each([
    ['application/pdf', PDF, 'pdf'],
    ['image/png', PNG, 'png'],
    ['image/jpeg', JPEG, 'jpg'],
  ])('accepts a genuine %s and derives extension .%s', (declared, buffer, extension) => {
    const result = validateUpload(declared as string, buffer as Buffer);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mimeType).toBe(declared);
      expect(result.extension).toBe(extension);
    }
  });

  it('derives the extension from detected content, never from a filename (MOUD-05)', () => {
    // The caller has no way to influence the extension — validateUpload never
    // receives a filename. This test pins that contract.
    const result = validateUpload('image/png', PNG);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.extension).toBe('png');
    expect(validateUpload.length).toBe(2); // (declaredMimeType, buffer) only
  });
});

describe('validateMimeType', () => {
  it('accepts the three permitted types', () => {
    expect(validateMimeType('application/pdf')).toBe(true);
    expect(validateMimeType('image/png')).toBe(true);
    expect(validateMimeType('image/jpeg')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(validateMimeType('text/html')).toBe(false);
    expect(validateMimeType('application/octet-stream')).toBe(false);
    expect(validateMimeType('')).toBe(false);
  });
});

describe('upload limits', () => {
  it('caps uploads at 10 MB', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
});
