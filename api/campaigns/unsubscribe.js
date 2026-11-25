import { handleCampaignUnsubscribe } from '../_campaigns.js';

export default async function handler(req, res) {
  return handleCampaignUnsubscribe(req, res);
}
