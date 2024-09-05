package tracker

import (
	"context"
	"fmt"
	"time"

	"gocv.io/x/gocv"
)

func (t *Tracker) EstimatePose(ctx context.Context, cornersReal gocv.Point3fVector, loopRate time.Duration) {
	corners := gocv.NewMat()
	defer corners.Close()

	invert := gocv.NewMat()
	defer invert.Close()
	output := gocv.NewMat()
	t.debugFrames["pose"] = output

	params := gocv.NewArucoDetectorParameters()
	params.SetAdaptiveThreshConstant(5)
	dict := gocv.GetPredefinedDictionary(gocv.ArucoDictArucoOriginal)
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
			gocv.BitwiseNot(imgs[0], &invert)
			for _, img := range imgs {
				img.Close()
			}

			corners, markerIds, _ := detector.DetectMarkers(invert)

			foundCorners := make([]int32, len(markerIds))
			for i, id := range markerIds {
				markers[id-1] = corners[i][0]
				foundCorners[i] = int32(id)
			}

			fmt.Println("foundCorners", foundCorners)
			fmt.Println("markers", markers)

			t.PoseCalibration.FoundCorners = foundCorners

			// If all corners are found
			if len(markers) == 4 && markers[0].X > 0 && markers[1].X > 0 && markers[2].X > 0 && markers[3].X > 0 {
				// Calculate the pose of the marker
				imagePoints := gocv.NewPoint2fVectorFromPoints([]gocv.Point2f{markers[0], markers[1], markers[2], markers[3]})
				t.PoseCalibration.Corners = imagePoints
				gocv.SolvePnP(cornersReal, imagePoints, t.PoseCalibration.CameraMatrix, t.PoseCalibration.DistCoeffs, &t.PoseCalibration.RVecs, &t.PoseCalibration.TVecs, false, 0)
			}

			invert.CopyTo(&output)
		}
	}
}
