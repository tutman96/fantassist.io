import campaignDatabase from "./storage";

import Divider from "@mui/material/Divider";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

import Add from "@mui/icons-material/Add";
import { minWidth } from "@mui/system";

type Props = {
  selectedCampaignId: string;
  onSelectCampaign: (id: string) => void;
};
const CampaignSelector: React.FC<Props> = ({
  selectedCampaignId,
  onSelectCampaign,
}) => {
  const allCampaigns = campaignDatabase.useAllValues();

  if (!allCampaigns) {
    return (
      <Select
        disabled={true}
        value="loading"
        size="small"
        sx={{
          minWidth: 200,
        }}
      >
        <MenuItem value="loading">Loading...</MenuItem>
      </Select>
    );
  }

  return (
    <Select
      value={selectedCampaignId}
      onChange={(e) => onSelectCampaign(e.target.value as string)}
      size="small"
      sx={{
        minWidth: 200,
      }}
    >
      {Array.from(allCampaigns.values()).map((campaign) => (
        <MenuItem key={campaign.id} value={campaign.id}>
          {campaign.name}
        </MenuItem>
      ))}
      <Divider />
      <MenuItem key="new" value="new">
        <Add sx={{ marginRight: "0.5rem" }} fontSize="small" />
        Create New
      </MenuItem>
    </Select>
  );
};
export default CampaignSelector;
