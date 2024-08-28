import { useState } from "react";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";

const AddCampaignDialog: React.FunctionComponent<{
  onConfirm: (newName: string) => void;
  onCancel: () => void;
  open: boolean;
}> = ({ onConfirm, onCancel, open }) => {
  const [localName, setLocalName] = useState("");

  return (
    <Dialog open={open} onClose={onCancel}>
      <DialogTitle>Create new campaign</DialogTitle>
      <DialogContent>
        <DialogContentText>
          What would you like to name this campaign? This can be changed later
        </DialogContentText>
        <TextField
          autoFocus
          margin="dense"
          label="Name"
          variant="standard"
          fullWidth
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onConfirm(localName)} autoFocus>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
};
export default AddCampaignDialog;
