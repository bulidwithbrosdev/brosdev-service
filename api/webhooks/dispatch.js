import { handleWebhookDispatch } from '../_lib.js';

export default async function handler(req, res) {
  return handleWebhookDispatch(req, res);
}
