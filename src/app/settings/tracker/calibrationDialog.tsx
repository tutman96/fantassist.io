import { useEffect, useState } from "react";

import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";

import { useConnectionState } from "@/external/hooks";
import { ChannelState } from "@/external/abstractChannel";
import { DisplayButton } from "../DisplaySettings";

import CloseIcon from "@mui/icons-material/Close";
import IntroductionStep from "./introduction";
import AlignmentStep from "./alignment";

type Props = {
  open: boolean;
  onClose: () => void;
};
const TrackerCalibrationDialog: React.FC<Props> = ({ open, onClose }) => {
  const [closeVerify, setCloseVerify] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  const handleClose = () => {
    if (closeVerify) {
      onClose();
    } else {
      setCloseVerify(true);
    }
  };

  useEffect(() => {
    if (!open) {
      setActiveStep(0);
      setCloseVerify(false);
    }
  }, [open]);

  const displayConnectionState = useConnectionState();

  const content = (() => {
    if (displayConnectionState !== ChannelState.CONNECTED) {
      return (
        <>
          <Alert
            severity="warning"
            sx={{
              marginBottom: 2,
            }}
          >
            <AlertTitle>Display not connected</AlertTitle>
            Please connect the display before proceeding.
          </Alert>
          <DisplayButton />
        </>
      );
    }

    switch (activeStep) {
      case 0:
        return <IntroductionStep onNext={() => setActiveStep(1)} />;
      case 1:
        return (
          <AlignmentStep
            onNext={() => setActiveStep(2)}
            onPrevious={() => setActiveStep(0)}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        sx={{
          "& .MuiDialog-paper": {
            maxWidth: "100%",
            width: "100%",
            height: "100%",
          },
        }}
      >
        <DialogTitle>Fantassist Tracker Calibration</DialogTitle>
        <IconButton
          aria-label="close"
          onClick={handleClose}
          sx={(theme) => ({
            position: "absolute",
            right: 12,
            top: 12,
            color: theme.palette.grey[500],
          })}
        >
          <CloseIcon />
        </IconButton>
        <DialogContent>
          <Stepper
            activeStep={activeStep}
            sx={{
              marginBottom: 4,
            }}
          >
            <Step>
              <StepLabel>Introduction</StepLabel>
            </Step>
            <Step>
              <StepLabel>Alignment</StepLabel>
            </Step>
            <Step>
              <StepLabel>Automatic Adjustment</StepLabel>
            </Step>
            <Step>
              <StepLabel>Validation</StepLabel>
            </Step>
          </Stepper>
          {content}
        </DialogContent>
      </Dialog>
      <Dialog
        open={closeVerify}
        onClose={() => setCloseVerify(false)}
        fullWidth
      >
        <DialogTitle>Exit the calibration?</DialogTitle>
        <DialogContent>
          Leaving the calibration process will clear all progress and may have
          to be done before the Tracker can be used.
        </DialogContent>
        <DialogActions>
          <Button
            variant="text"
            color="primary"
            onClick={() => {
              setCloseVerify(false);
            }}
          >
            No
          </Button>
          <Button variant="text" color="primary" onClick={handleClose}>
            Yes
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
export default TrackerCalibrationDialog;
