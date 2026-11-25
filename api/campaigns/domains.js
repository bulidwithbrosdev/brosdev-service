import { handleCampaignDomains } from '../_campaigns.js';

export default async function handler(req, res) {
  return handleCampaignDomains(req, res);
}
