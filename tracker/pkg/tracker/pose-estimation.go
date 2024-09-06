package tracker

import (
	"context"
	"fmt"
	"time"

	"gocv.io/x/gocv"
)

func (t *Tracker) EstimatePose(ctx context.Context, cornersReal []gocv.Point3f, loopRate time.Duration) {
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

	markers := make(map[int]gocv.Point2f)
	ticker := time.NewTicker(loopRate)

	for {
		select {
		case <-ctx.Done():
			ticker.Stop()

			if len(t.PoseCalibration.FoundCorners) < 4 {
				fmt.Println("Not enough corners found", t.PoseCalibration.FoundCorners)
				return
			}

			imagePoints := []gocv.Point2f{markers[0], markers[1], markers[2], markers[3]}
			imageMat := gocv.NewMatWithSize(len(imagePoints), 1, gocv.MatTypeCV32FC2)
			defer imageMat.Close()

			for i, pt := range imagePoints {
				imageMat.SetFloatAt(i, 0, pt.X)
				imageMat.SetFloatAt(i, 1, pt.Y)
			}

			cornersMat := gocv.NewMatWithSize(4, 1, gocv.MatTypeCV32FC2)
			defer cornersMat.Close()

			for i, pt := range cornersReal {
				cornersMat.SetFloatAt(i, 0, pt.X)
				cornersMat.SetFloatAt(i, 1, pt.Y)
			}

			mask := gocv.NewMat()
			homography := gocv.FindHomography(imageMat, &cornersMat, gocv.HomograpyMethodRANSAC, 3.0, &mask, 2000, 0.995)
			t.PoseCalibration.HomographyMat = homography
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
			invert.CopyTo(&output)
		}
	}
}
