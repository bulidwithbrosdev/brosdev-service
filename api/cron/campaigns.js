import { handleCronCampaigns } from '../_campaigns.js';

export default async function handler(req, res) {
  return handleCronCampaigns(req, res);
}
