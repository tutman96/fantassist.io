package main

import (
	"context"
	"fmt"
	"image"
	"net/http"
	_ "net/http/pprof"
	"os"
	"os/signal"
	"time"

	"github.com/tutman96/table-camera/pkg/tracker"
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

	http.HandleFunc("/mjpeg", tracker.HandleMJPEG)
	go http.ListenAndServe(":8080", nil)
	fmt.Println("Server started at :8080")

	tracker.SetExposure(500)

	fmt.Println("Waiting 5s for camera to stabilize")
	time.Sleep(5 * time.Second)

	startTime := time.Now()

	pixelsPerMarker := int(0.00005 * float64(resolution.X) * float64(resolution.Y))
	exposure := tracker.CalibrateExposure(ctx, pixelsPerMarker*2, 0.01, 100*time.Millisecond)

	fmt.Println("Reached target exposure:", exposure, "in", time.Since(startTime))

	time.Sleep(1 * time.Second)
	tracker.StopCapture()
	cancel()
}
