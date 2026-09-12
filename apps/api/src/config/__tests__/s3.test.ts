/**
 * Tests for presigned document URL generation.
 *
 * Why these exist (audit finding MOUD-03):
 *   The document endpoint previously returned the raw S3 object key, and no
 *   signed-URL implementation existed anywhere in the codebase. These tests
 *   pin the two properties that make the replacement safe: the URL is scoped
 *   to exactly the requested object, and it expires.
 *
 * The AWS signing implementation itself is not under test — that is the SDK's
 * responsibility. What is under test is that we call it with the right bucket,
 * the right key, and a bounded TTL.
 */

process.env.AWS_REGION = 'us-east-1';
process.env.S3_BUCKET = 'test-phi-bucket';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedDocumentUrl, SIGNED_URL_TTL_SECONDS } from '../s3';

const mockedGetSignedUrl = getSignedUrl as unknown as jest.Mock;

describe('getSignedDocumentUrl (regression: MOUD-03)', () => {
  beforeEach(() => {
    process.env.S3_BUCKET = 'test-phi-bucket';
    mockedGetSignedUrl.mockResolvedValue('https://signed.example.test/object');
  });

  it('returns the signed URL produced by the SDK', async () => {
    const url = await getSignedDocumentUrl('tenant/t1/cred/c1/doc.pdf');
    expect(url).toBe('https://signed.example.test/object');
  });

  it('signs a GetObjectCommand scoped to the configured bucket and requested key', async () => {
    await getSignedDocumentUrl('tenant/t1/cred/c1/doc.pdf');

    const [, command] = mockedGetSignedUrl.mock.calls[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'test-phi-bucket',
      Key: 'tenant/t1/cred/c1/doc.pdf',
    });
  });

  it('applies a bounded expiry of at most 5 minutes', async () => {
    await getSignedDocumentUrl('tenant/t1/cred/c1/doc.pdf');

    const [, , options] = mockedGetSignedUrl.mock.calls[0];
    expect(options.expiresIn).toBe(SIGNED_URL_TTL_SECONDS);
    expect(SIGNED_URL_TTL_SECONDS).toBeGreaterThan(0);
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(300);
  });

  it('never signs a key other than the one requested', async () => {
    await getSignedDocumentUrl('tenant/t2/cred/c9/other.pdf');

    const [, command] = mockedGetSignedUrl.mock.calls[0];
    expect(command.input.Key).toBe('tenant/t2/cred/c9/other.pdf');
  });

  it('fails loudly when the bucket is not configured', async () => {
    delete process.env.S3_BUCKET;

    await expect(getSignedDocumentUrl('tenant/t1/cred/c1/doc.pdf')).rejects.toThrow(
      /S3_BUCKET is not configured/
    );
    expect(mockedGetSignedUrl).not.toHaveBeenCalled();
  });
});
