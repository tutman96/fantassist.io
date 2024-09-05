package ble

import (
	"context"
	"fmt"
	"time"

	"github.com/muka/go-bluetooth/api/service"
	"github.com/muka/go-bluetooth/bluez/profile/gatt"
	"github.com/tutman96/fantassist.io/tracker/pkg/tracker"
)

type TrackerService struct {
	*service.Service
	manager *BleChannel
	tracker *tracker.Tracker

	markerCharacteristic *service.Char

	listeners      int
	updateInterval time.Duration
	notifyCancel   context.CancelFunc
}

func NewTrackerService(manager *BleChannel, tracker *tracker.Tracker, updateInterval time.Duration) (*TrackerService, error) {
	service, err := manager.app.NewService(trackerServiceUUID)
	if err != nil {
		return nil, err
	}

	markerCharacteristic, err := service.NewChar(channelWriteCharacteristicUUID)
	if err != nil {
		return nil, err
	}

	markerCharacteristic.Properties.Flags = []string{
		gatt.FlagCharacteristicRead,
		gatt.FlagCharacteristicNotify,
	}

	err = service.AddChar(markerCharacteristic)
	if err != nil {
		return nil, err
	}

	s := &TrackerService{
		Service: service,
		manager: manager,
		tracker: tracker,

		markerCharacteristic: markerCharacteristic,

		updateInterval: updateInterval,
	}

	markerCharacteristic.OnRead(s.onRead)
	markerCharacteristic.OnNotify(s.onNotify)

	return s, nil
}

func (tracker *TrackerService) onNotify(_ *service.Char, notify bool) error {
	fmt.Println("Notify", notify)
	if notify {
		if tracker.listeners == 0 {
			tracker.startNotify()
		}
		tracker.listeners++
	} else {
		tracker.listeners--
		if tracker.listeners <= 0 {
			tracker.listeners = 0
			tracker.notifyCancel()
		}
	}
	return nil
}

func (s *TrackerService) onRead(_ *service.Char, options map[string]interface{}) ([]byte, error) {
	markers := s.tracker.GetMarkers()

	// Return a list of markers. One byte for id, one byte for x and one byte for y
	out := []byte{}
	for _, marker := range markers {
		if marker.LastSeen.Sub(marker.FirstSeen) < 100*time.Millisecond {
			fmt.Println("Marker", marker.Identifier, "is too young")
			continue
		}
		// Calculate absolute position
		location := s.tracker.ConvertPixelTo3D(marker.Position)

		if (location.X < 0 || location.X > 1) || (location.Y < 0 || location.Y > 1) {
			fmt.Println("Marker", marker.Identifier, "out of bounds at", location)
			continue
		}

		fmt.Println("Marker", marker.Identifier, "at", location)

		out = append(out, []byte{
			marker.Identifier,
			byte(255 * location.X),
			byte(255 * location.Y),
		}...)
	}

	return out, nil
}

func (s *TrackerService) startNotify() {
	ctx, cancel := context.WithCancel(context.Background())
	s.notifyCancel = cancel

	ticker := time.NewTicker(s.updateInterval)
	fmt.Println("Starting notify")
	go func() {
		for {
			select {
			case <-ctx.Done():
				fmt.Println("Stopping notify")
				return
			case <-ticker.C:
				v, err := s.onRead(nil, nil)
				if err != nil {
					fmt.Println("Error reading markers", err)
					continue
				}
				// fmt.Println("Writing", v)
				s.markerCharacteristic.WriteValue(v, map[string]interface{}{
					"device": "server",
					"link":   "server",
				})
			}
		}
	}()
}
