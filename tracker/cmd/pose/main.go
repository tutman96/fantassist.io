package main

import (
	"context"
	"encoding/json"
	"fmt"
	"image"
	"net/http"
	_ "net/http/pprof"
	"os"
	"os/signal"
	"time"

	"github.com/tutman96/table-camera/pkg/calib3d"
	"github.com/tutman96/table-camera/pkg/tracker"
	"gocv.io/x/gocv"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		interrupt := make(chan os.Signal, 1)
		signal.Notify(interrupt, os.Interrupt)
		<-interrupt
		fmt.Println("Shutting down...")
		cancel()
	}()

	// resolution := image.Point{X: 640, Y: 480}
	resolution := image.Point{X: 1280, Y: 720}
	// resolution := image.Point{X: 1920, Y: 1080}
	tracker, err := tracker.NewTracker(resolution, nil)
	if err != nil {
		panic(err)
	}

	tracker.StartCapture()
	time.Sleep(1 * time.Second)

	http.HandleFunc("/mjpeg", tracker.HandleMJPEG)
	go http.ListenAndServe(":8080", nil)
	fmt.Println("Server started at :8080")

	poseCalibration := &calib3d.PoseCalibration{
		CameraMatrix: gocv.Eye(3, 3, gocv.MatTypeCV64F),
		DistCoeffs:   gocv.NewMat(),
		RVecs:        gocv.NewMat(),
		TVecs:        gocv.NewMat(),
	}
	defer poseCalibration.Close()

	tracker.EstimatePose(ctx, 100*time.Millisecond, poseCalibration)

	output, err := json.Marshal(poseCalibration)
	if err != nil {
		panic(err)
	}

	// Write output to a file
	file, err := os.Create("data/pose_calibration.json")
	if err != nil {
		panic(err)
	}
	defer file.Close()
	file.Write(output)

	fmt.Println("Pose calibration saved to data/pose_calibration.json")

	time.Sleep(1 * time.Second)
	tracker.StopCapture()
	cancel()
}
