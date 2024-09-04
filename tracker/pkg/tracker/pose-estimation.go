package tracker

import (
	"context"
	"time"

	"github.com/tutman96/table-camera/pkg/calib3d"
	"gocv.io/x/gocv"
)

var (
	objectPoints = gocv.NewPoint3fVectorFromPoints([]gocv.Point3f{
		gocv.NewPoint3f(0, 0, 0),
		gocv.NewPoint3f(1, 0, 0),
		gocv.NewPoint3f(0, 1, 0),
		gocv.NewPoint3f(1, 1, 0),
	})
	axisMarkers = []gocv.Point3f{
		gocv.NewPoint3f(0, 0, 0),
		gocv.NewPoint3f(1, 0, 0),
		gocv.NewPoint3f(0, 1, 0),
		gocv.NewPoint3f(0, 0, 1),
	}
)

func (t *Tracker) EstimatePose(ctx context.Context, loopRate time.Duration, poseCalibration *calib3d.PoseCalibration) {
	corners := gocv.NewMat()
	defer corners.Close()

	invert := gocv.NewMat()
	defer invert.Close()
	output := gocv.NewMat()
	t.debugFrames["pose"] = output

	params := gocv.NewArucoDetectorParameters()
	params.SetAdaptiveThreshConstant(5)
	dict := gocv.GetPredefinedDictionary(gocv.ArucoDict4x4_50)
	detector := gocv.NewArucoDetectorWithParams(dict, params)
	defer detector.Close()

	ticker := time.NewTicker(loopRate)

	markers := make(map[int]gocv.Point2f)

	for {
		select {
		case <-ctx.Done():
			ticker.Stop()
			return
		case <-ticker.C:
			t.SetExposure(15000)
			imgs := gocv.Split(t.frame)
			gocv.BitwiseNot(imgs[1], &invert)
			for _, img := range imgs {
				img.Close()
			}

			corners, markerIds, _ := detector.DetectMarkers(invert)

			for i, id := range markerIds {
				markers[id] = corners[i][0]
			}

			// If all corners are found
			if len(markers) == 4 && markers[0].X > 0 && markers[1].X > 0 && markers[2].X > 0 && markers[3].X > 0 {
				// Calculate the pose of the marker
				imagePoints := gocv.NewPoint2fVectorFromPoints([]gocv.Point2f{markers[0], markers[1], markers[2], markers[3]})
				poseCalibration.Corners = imagePoints
				gocv.SolvePnP(objectPoints, imagePoints, poseCalibration.CameraMatrix, poseCalibration.DistCoeffs, &poseCalibration.RVecs, &poseCalibration.TVecs, false, 0)
				return
			}

			invert.CopyTo(&output)
		}
	}
}
