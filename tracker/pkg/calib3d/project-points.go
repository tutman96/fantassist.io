package calib3d

import (
	"image"

	"gocv.io/x/gocv"
)

// TODO: support 3d points based on other calibration data
// TODO: Undistort based on cameraMatrix and distCoeffs
func (calibration *PoseCalibration) PixelTo3D(pixel image.Point, heightOffset float64) gocv.Point3f {
	srcMat := gocv.NewMatWithSize(1, 1, gocv.MatTypeCV32FC2)
	defer srcMat.Close()
	srcMat.SetFloatAt(0, 0, float32(pixel.X))
	srcMat.SetFloatAt(0, 1, float32(pixel.Y))

	dstMat := gocv.NewMat()
	defer dstMat.Close()
	gocv.PerspectiveTransform(srcMat, &dstMat, calibration.homographyMat)

	return gocv.Point3f{
		X: dstMat.GetFloatAt(0, 0),
		Y: dstMat.GetFloatAt(0, 1),
		Z: 0,
	}
}
