package calib3d

import (
	"fmt"
	"image"

	"gocv.io/x/gocv"
)

// TODO: support 3d points based on other calibration data
// TODO: Undistort based on cameraMatrix and distCoeffs
func (calibration *PoseCalibration) PixelTo3D(pixel image.Point, heightOffset float64) gocv.Point3f {
	if calibration.HomographyMat.Empty() {
		fmt.Println("Warning: Homography matrix is empty")
		return gocv.Point3f{}
	}

	// Define the 5th point in image coordinates
	imagePoint := gocv.NewMatWithSize(1, 1, gocv.MatTypeCV32FC2)
	defer imagePoint.Close()
	imagePoint.SetFloatAt(0, 0, float32(pixel.X)) // X coordinate in image
	imagePoint.SetFloatAt(0, 1, float32(pixel.Y)) // Y coordinate in image

	// Perform perspective transformation using the homography matrix
	transformedPoints := gocv.NewMat()
	defer transformedPoints.Close()
	gocv.PerspectiveTransform(imagePoint, &transformedPoints, calibration.HomographyMat)

	// Retrieve and print the transformed real-world coordinates
	realX := transformedPoints.GetFloatAt(0, 0)
	realY := transformedPoints.GetFloatAt(0, 1)

	return gocv.Point3f{
		X: realX,
		Y: realY,
		Z: 0,
	}
}
