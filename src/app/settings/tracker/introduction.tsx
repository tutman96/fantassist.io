import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";

type Props = {
  onNext: () => void;
};
const IntroductionStep: React.FC<Props> = ({ onNext }) => {
  return (
    <>
      <Typography gutterBottom>
        Welcome to the Fantassist Tracker! This tool allows you to track the
        movement of markers on the table display using a camera and computer
        vision.
      </Typography>
      <br />
      <Typography gutterBottom>
        To get started, you will need to calibrate the tracker. This process
        will help the tracker understand the position of the camera relative to
        the table display.
      </Typography>
      <br />
      <Typography gutterBottom>
        First, make sure your camera is positioned above the table display and
        that the display is clear of all tokens.
      </Typography>
      <br />
      <Typography gutterBottom>
        Once you click the "Next" button, the display will show a series of
        patterns that the camera will use to calibrate itself.
      </Typography>
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Button variant="contained" onClick={onNext}>
          Next
        </Button>
      </Box>
    </>
  );
};
export default IntroductionStep;
