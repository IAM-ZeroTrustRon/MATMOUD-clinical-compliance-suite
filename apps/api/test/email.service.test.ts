jest.mock('@sendgrid/mail', () => ({
  __esModule: true,
  default: { setApiKey: jest.fn(), send: jest.fn() },
}));

import sgMail from '@sendgrid/mail';
import { AlertEmailData, sendExpirationAlert } from '../src/services/email.service';

const safe = { credentialId: '00000000-0000-4000-8000-000000000001', expirationDate: '2030-01-01' };
const data = (template: unknown): AlertEmailData => ({
  to: 'synthetic-recipient@example.test', templateId: 'synthetic-template',
  dynamicTemplateData: template as AlertEmailData['dynamicTemplateData'],
});

beforeEach(() => (sgMail.send as jest.Mock).mockResolvedValue([]));

it('sends only the permitted identifier/date template fields', async () => {
  await sendExpirationAlert(data(safe));
  expect(sgMail.send).toHaveBeenCalledTimes(1);
  expect((sgMail.send as jest.Mock).mock.calls[0][0].dynamicTemplateData).toEqual(safe);
});

it.each([
  { ...safe, patientName: 'SYNTHETIC_BLOCKED_VALUE' }, // PHI — synthetic sentinel
  { ...safe, arbitrary: { ssn: 'SYNTHETIC_BLOCKED_VALUE' } }, // PHI
  { ...safe, credentialId: { nested: 'SYNTHETIC_BLOCKED_VALUE' } }, // PHI
  { ...safe, credentialId: 'not-an-opaque-uuid' },
  { ...safe, expirationDate: '2030-02-30' },
  { ...safe, expirationDate: 'SYNTHETIC_BLOCKED_VALUE' },
  { credentialId: safe.credentialId },
  null,
  [],
])('rejects unsafe or malformed template data without invoking the provider: %#', async (template) => {
  await expect(sendExpirationAlert(data(template))).rejects.toThrow('invalid_alert_template_data');
  expect(sgMail.send).not.toHaveBeenCalled();
});

it('accepts a valid leap-day date', async () => {
  await sendExpirationAlert(data({ ...safe, expirationDate: '2032-02-29' }));
  expect(sgMail.send).toHaveBeenCalledTimes(1);
});
