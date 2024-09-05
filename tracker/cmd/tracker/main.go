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

	"github.com/tutman96/fantassist.io/tracker/pkg/ble"
	"github.com/tutman96/fantassist.io/tracker/pkg/calib3d"
	"github.com/tutman96/fantassist.io/tracker/pkg/tracker"
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

	// Read pose calibration from data/pose_calibration.json
	calibrationFile, err := os.Open("data/pose_calibration.json")
	if err != nil {
		panic(err)
	}
	defer calibrationFile.Close()

	var poseCalibration calib3d.PoseCalibration

	err = json.NewDecoder(calibrationFile).Decode(&poseCalibration)
	if err != nil {
		panic(err)
	}

	// resolution := image.Point{X: 640, Y: 480}
	resolution := image.Point{X: 1280, Y: 720}
	// resolution := image.Point{X: 1920, Y: 1080}
	tracker, err := tracker.NewTracker(resolution, &poseCalibration)
	if err != nil {
		panic(err)
	}

	absolute := tracker.ConvertPixelTo3D(image.Pt(529, 347))
	fmt.Println(absolute)

	bleManager, err := ble.NewBleManager(tracker)
	if err != nil {
		panic(err)
	}

	err = bleManager.Start(ctx)
	if err != nil {
		panic(err)
	}

	tracker.StartCapture()
	defer tracker.StopCapture()

	http.HandleFunc("/mjpeg", tracker.HandleMJPEG)
	go http.ListenAndServe(":8080", nil)
	fmt.Println("Server started at :8080")

	tracker.DetectMarkers(ctx)

	<-ctx.Done()
}
