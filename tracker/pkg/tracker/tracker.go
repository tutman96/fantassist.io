package tracker

import (
	"fmt"
	"image"
	"image/color"
	"net/http"
	"time"

	"github.com/tutman96/fantassist.io/tracker/pkg/calib3d"
	"github.com/tutman96/fantassist.io/tracker/pkg/libcamera"
	"gocv.io/x/gocv"
)

type Tracker struct {
	resolution      image.Point
	camera          *libcamera.Camera
	framesChan      chan libcamera.Frame
	frame           gocv.Mat
	frameListeners  []chan gocv.Mat
	frameDuration   time.Duration
	PoseCalibration *calib3d.PoseCalibration

	markerListeners []chan []*Marker
	markers         *MarkerSet

	debugFrames map[string]gocv.Mat
}

func NewTracker(resolution image.Point, poseCalibration *calib3d.PoseCalibration) (*Tracker, error) {
	if poseCalibration == nil {
		poseCalibration = &calib3d.PoseCalibration{
			CameraMatrix: gocv.Eye(3, 3, gocv.MatTypeCV64F),
			DistCoeffs:   gocv.NewMat(),
			RVecs:        gocv.NewMat(),
			TVecs:        gocv.NewMat(),
		}
	}

	t := &Tracker{
		resolution:      resolution,
		framesChan:      make(chan libcamera.Frame),
		markers:         NewMarkerSet(255),
		debugFrames:     make(map[string]gocv.Mat),
		PoseCalibration: poseCalibration,
	}

	c, err := libcamera.Open(t.resolution, t.framesChan)
	if err != nil {
		return nil, err
	}
	t.camera = c

	return t, nil
}

func (t *Tracker) StartCapture() {
	go t.camera.Start()
	go func() {
		lastDetection := time.Now()
		for frame := range t.framesChan {
			t.frameDuration = time.Since(lastDetection)
			lastDetection = time.Now()

			f := frame.Image()
			t.frame = f
			t.debugFrames["raw"] = f
			for _, listener := range t.frameListeners {
				select {
				case listener <- t.frame:
				default:
					// noop
				}
			}
		}
	}()
}

func (t *Tracker) StopCapture() {
	t.camera.Stop()
}

func (t *Tracker) SetExposure(microseconds int) {
	t.camera.SetExposure(microseconds)
}

func (t *Tracker) GetMarkers() []*Marker {
	return t.markers.GetMarkers()
}

func (t *Tracker) ConvertPixelTo3D(pixel image.Point) gocv.Point3f {
	return t.PoseCalibration.PixelTo3D(pixel, 0) // TODO: configure height offset
}

func (t *Tracker) HandleMJPEG(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "multipart/x-mixed-replace; boundary=frame")

	// TODO: read parameter to determine which stream to load
	frameName := r.URL.Query().Get("frame")
	if frameName == "" {
		frameName = "raw"
	}

	frame, ok := t.debugFrames[frameName]
	if !ok {
		http.Error(w, "Frame not found", http.StatusNotFound)
		return
	}

	for {
		now := time.Now()

		if frame.Empty() {
			time.Sleep(100 * time.Millisecond) // 10 fps
			continue
		}

		output := frame.Clone()
		gocv.PutText(&output, fmt.Sprintf("%v", t.frameDuration), image.Pt(0, 11), gocv.FontHersheySimplex, 0.5, color.RGBA{B: 255}, 2)

		markers := t.markers.GetMarkers()
		for _, marker := range markers {
			c := color.RGBA{G: 255 - uint8(255*float32(now.Sub(marker.LastSeen).Seconds())/5)}
			gocv.Circle(&output, marker.Position, 15, c, 1)
			gocv.PutText(&output, fmt.Sprintf("%d", marker.Identifier), marker.Position.Add(image.Pt(-5, 3)), gocv.FontHersheySimplex, 0.5, c, 1)
		}

		jpegFrame, _ := gocv.IMEncode(".jpg", output)

		fmt.Fprintf(w, "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\nX-Timestamp: 0.000000\r\n\r\n", jpegFrame.Len())
		w.Write(jpegFrame.GetBytes())
		fmt.Fprintf(w, "\r\n")
		jpegFrame.Close()
		output.Close()
		time.Sleep(100 * time.Millisecond) // 10 fps
	}
}

func (t *Tracker) registerFrameListener() (chan gocv.Mat, func()) {
	fmt.Println("registering frame listener")
	listener := make(chan gocv.Mat)
	t.frameListeners = append(t.frameListeners, listener)

	return listener, func() {
		fmt.Println("deregistering frame listener")
		close(listener)
		for i, l := range t.frameListeners {
			if l == listener {
				t.frameListeners = append(t.frameListeners[:i], t.frameListeners[i+1:]...)
				break
			}
		}
	}
}
