import { handleResendWebhook } from '../_campaigns.js';

export default async function handler(req, res) {
  return handleResendWebhook(req, res);
}
