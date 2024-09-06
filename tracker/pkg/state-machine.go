package pkg

import (
	"context"
	"encoding/json"
	"fmt"
	"image"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/tutman96/fantassist.io/tracker/pkg/ble"
	"github.com/tutman96/fantassist.io/tracker/pkg/tracker"
	"github.com/tutman96/fantassist.io/tracker/protos"
	"gocv.io/x/gocv"
)

type StateMachine struct {
	ctx                context.Context
	state              protos.TrackerGetStatusResponse_TrackerState
	currentStateCancel context.CancelFunc
	currentWaitGroup   sync.WaitGroup

	bleChannel *ble.BleChannel
	tracker    *tracker.Tracker
}

func NewStateMachine() (*StateMachine, error) {
	bleChannel, err := ble.NewBleChannel()
	if err != nil {
		return nil, err
	}

	tracker, err := tracker.NewTracker(
		image.Point{X: 1280, Y: 720},
		nil, // TODO: read this from the calibration storage
	)
	if err != nil {
		return nil, err
	}

	sm := &StateMachine{
		ctx:                context.TODO(),
		state:              protos.TrackerGetStatusResponse_IDLE,
		bleChannel:         bleChannel,
		tracker:            tracker,
		currentStateCancel: func() {},
	}

	return sm, nil
}

func (sm *StateMachine) Start(ctx context.Context) error {
	err := sm.bleChannel.Start(ctx)
	if err != nil {
		return err
	}

	sm.ctx = ctx
	sm.registerRequestHandlers()

	go func() {
		connectionChange := sm.bleChannel.OnConnectionStateChange()
		for {
			select {
			case <-ctx.Done():
				return
			case connected := <-connectionChange:
				if !connected {
					fmt.Println("Disconnected. Stopping calibration and tracking.")
					sm.stopCalibration()
					sm.stopTracking()
				}
			}
		}
	}()

	go func() {
		sm.tracker.StartCapture()
		<-ctx.Done()

		sm.currentStateCancel()
		sm.currentWaitGroup.Wait()

		sm.tracker.StopCapture()
	}()

	http.HandleFunc("/mjpeg", sm.tracker.HandleMJPEG)
	go http.ListenAndServe(":8080", nil)

	return nil
}

func (sm *StateMachine) registerRequestHandlers() {
	sm.bleChannel.AddRequestHandler(func(req *protos.Request) *protos.Response {
		switch req.Message.(type) {

		case *protos.Request_HelloRequest:
			return &protos.Response{
				Message: &protos.Response_AckResponse{},
			}

		case *protos.Request_TrackerGetStatusRequest:
			return &protos.Response{
				Message: &protos.Response_TrackerGetStatusResponse{
					TrackerGetStatusResponse: &protos.TrackerGetStatusResponse{
						Uuid:    uuid.New().String(), // TODO: read this from hardware or something
						Version: "0.0.1",             // TODO: this should come from somewhere
						State:   sm.state,
					},
				},
			}

		case *protos.Request_TrackerSetIdleRequest:
			sm.stopCalibration()
			sm.stopTracking()
			return &protos.Response{
				Message: &protos.Response_AckResponse{},
			}

		case *protos.Request_TrackerStartCalibrationRequest:
			sm.startCalibration(req.Message.(*protos.Request_TrackerStartCalibrationRequest))
			return &protos.Response{
				Message: &protos.Response_AckResponse{},
			}

		case *protos.Request_TrackerGetCalibrationRequest:
			return &protos.Response{
				Message: &protos.Response_TrackerGetCalibrationResponse{
					TrackerGetCalibrationResponse: &protos.TrackerGetCalibrationResponse{
						FoundCorners: sm.tracker.PoseCalibration.FoundCorners,
						CornerLocations: []*protos.Vector2D{ // TODO: make these the actual corners
							{X: 0, Y: 0},
							{X: 0, Y: 720},
							{X: 1280, Y: 720},
							{X: 1280, Y: 0},
						},
					},
				},
			}

		case *protos.Request_TrackerStartTrackingRequest:
			sm.startTracking(req.Message.(*protos.Request_TrackerStartTrackingRequest))
			return &protos.Response{
				Message: &protos.Response_AckResponse{},
			}

		case *protos.Request_TrackerGetMarkerLocationRequest:
			markers := sm.tracker.GetMarkers()

			vectors := make(map[int32]*protos.Vector2D)
			for _, marker := range markers {
				if marker.LastSeen.Sub(marker.FirstSeen) < 100*time.Millisecond {
					fmt.Println("Marker", marker.Identifier, "is too young")
					continue
				}

				location := sm.tracker.ConvertPixelTo3D(marker.Position)

				fmt.Println("Marker", marker.Identifier, "at", location)

				vectors[int32(marker.Identifier)] = &protos.Vector2D{
					X: float64(location.X),
					Y: float64(location.Y),
				}
			}

			return &protos.Response{
				Message: &protos.Response_TrackerGetMarkerLocationResponse{
					TrackerGetMarkerLocationResponse: &protos.TrackerGetMarkerLocationResponse{
						MarkerLocations: vectors,
					},
				},
			}

		default:
			return nil
		}
	})
}

func (sm *StateMachine) startCalibration(req *protos.Request_TrackerStartCalibrationRequest) {
	if sm.state == protos.TrackerGetStatusResponse_CALIBRATING {
		return
	} else if sm.state == protos.TrackerGetStatusResponse_TRACKING {
		sm.stopTracking()
	}

	fmt.Println("Starting calibration")
	ctx, cancel := context.WithCancel(sm.ctx)
	sm.currentStateCancel = cancel

	realCorners := make([]gocv.Point3f, len(req.TrackerStartCalibrationRequest.Corners))
	for i, corner := range req.TrackerStartCalibrationRequest.Corners {
		realCorners[i] = gocv.NewPoint3f(
			float32(corner.X),
			float32(corner.Y),
			0,
		)
	}

	sm.currentWaitGroup.Add(1)
	go func() {
		defer sm.currentWaitGroup.Done()

		sm.tracker.EstimatePose(
			ctx,
			realCorners,
			50*time.Millisecond,
		)

		output, err := json.Marshal(sm.tracker.PoseCalibration)
		if err != nil {
			fmt.Println("Error marshalling calibration data:", err)
			return
		}
		fmt.Println("Calibration data:", string(output))
	}()

	sm.state = protos.TrackerGetStatusResponse_CALIBRATING
}

func (sm *StateMachine) stopCalibration() {
	if sm.state != protos.TrackerGetStatusResponse_CALIBRATING {
		return
	}

	fmt.Println("Stopping calibration")
	sm.currentStateCancel()
	sm.currentWaitGroup.Wait()
	sm.state = protos.TrackerGetStatusResponse_IDLE
}

func (sm *StateMachine) startTracking(_ *protos.Request_TrackerStartTrackingRequest) {
	if sm.state == protos.TrackerGetStatusResponse_TRACKING {
		return
	} else if sm.state == protos.TrackerGetStatusResponse_CALIBRATING {
		sm.stopCalibration()
	}

	fmt.Println("Starting tracking")
	ctx, cancel := context.WithCancel(sm.ctx)
	sm.currentStateCancel = cancel

	sm.currentWaitGroup.Add(1)
	go func() {
		defer sm.currentWaitGroup.Done()

		sm.tracker.DetectMarkers(ctx)
	}()

	sm.state = protos.TrackerGetStatusResponse_TRACKING
}

func (sm *StateMachine) stopTracking() {
	if sm.state != protos.TrackerGetStatusResponse_TRACKING {
		return
	}

	fmt.Println("Stopping tracking")
	sm.currentStateCancel()
	sm.currentWaitGroup.Wait()
	sm.state = protos.TrackerGetStatusResponse_IDLE
}
