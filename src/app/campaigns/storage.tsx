import globalStorage from "@/storage";

export interface Campaign {
  id: string;
  name: string;
}

const campaignDatabase = globalStorage<Campaign, Campaign>("campaign");

export default campaignDatabase;
