import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";

type Props = {
  onPrevious: () => void;
  onNext: () => void;
};
const AdjustmentStep: React.FC<Props> = ({ onPrevious, onNext }) => {
  return (
    <>
      <Typography gutterBottom>
        This step is just a placeholder for testing
      </Typography>
      <br />
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <Button
          variant="text"
          color="secondary"
          onClick={onPrevious}
        >
          Previous
        </Button>
        <Button
          variant="contained"
          onClick={onNext}
        >
          Next
        </Button>
      </Box>
    </>
  );
};
export default AdjustmentStep;
