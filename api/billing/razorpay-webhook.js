import { handleRazorpayWebhook } from '../_lib.js';

export default async function handler(req, res) {
  return handleRazorpayWebhook(req, res);
}
