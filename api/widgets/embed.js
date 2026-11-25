import { handleWidgetEmbedLoaderJs } from '../_lib.js';

export default async function handler(req, res) {
  return handleWidgetEmbedLoaderJs(req, res);
}
