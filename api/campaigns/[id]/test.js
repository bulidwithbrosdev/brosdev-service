import { handleCampaignTestSend } from '../../_campaigns.js';

export default async function handler(req, res) {
  const campaignId = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
  return handleCampaignTestSend(req, res, String(campaignId || ''));
}
