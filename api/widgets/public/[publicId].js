import { handlePublicWidgetConfig } from '../../_lib.js';

export default async function handler(req, res) {
  return handlePublicWidgetConfig(req, res, req.query?.publicId);
}
