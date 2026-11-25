import { handleShortLinkRedirect } from '../_lib.js';

export default async function handler(req, res) {
  const slug = Array.isArray(req.query?.slug) ? req.query.slug[0] : req.query?.slug;
  return handleShortLinkRedirect(req, res, slug);
}
