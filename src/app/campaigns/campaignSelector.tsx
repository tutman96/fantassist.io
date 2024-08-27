import campaignDatabase from "./storage";

import Divider from "@mui/material/Divider";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

import Add from "@mui/icons-material/Add";
import CollectionsBookmarkOutlinedIcon from "@mui/icons-material/CollectionsBookmarkOutlined";

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
        startAdornment={<CollectionsBookmarkOutlinedIcon />}
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
      MenuProps={{
        elevation: 5,
      }}
      startAdornment={
        <CollectionsBookmarkOutlinedIcon
          fontSize="small"
          color="secondary"
          sx={{ marginRight: 1 }}
        />
      }
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