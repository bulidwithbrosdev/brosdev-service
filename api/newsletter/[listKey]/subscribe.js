import { handlePublicNewsletterSubscribe } from '../../_lib.js';

export default async function handler(req, res) {
  const listKey = Array.isArray(req.query?.listKey) ? req.query.listKey[0] : req.query?.listKey;
  return handlePublicNewsletterSubscribe(req, res, listKey);
}
