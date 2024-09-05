package ble

import (
	"context"
	"time"

	"github.com/muka/go-bluetooth/api/service"
	"github.com/muka/go-bluetooth/bluez/profile/agent"
	"github.com/muka/go-bluetooth/hw"
	"github.com/tutman96/fantassist.io/tracker/pkg/tracker"
)

type BleManager struct {
	app *service.App

	trackerService *TrackerService
	// TODO: add system-type services for battery, cpu usage, etc
}

func setupAdapter() error {
	btmgmt := hw.NewBtMgmt("hci0")

	if err := btmgmt.SetPowered(false); err != nil {
		return err
	}

	if err := btmgmt.SetLe(true); err != nil {
		return err
	}

	if err := btmgmt.SetBredr(false); err != nil {
		return err
	}

	if err := btmgmt.SetPowered(true); err != nil {
		return err
	}
	return nil
}

func NewBleManager(tracker *tracker.Tracker) (*BleManager, error) {
	err := setupAdapter()
	if err != nil {
		return nil, err
	}

	options := service.AppOptions{
		AdapterID:  "hci0",
		AgentCaps:  agent.CapNoInputNoOutput,
		UUIDSuffix: "-0000-1000-8000-00805f9b34fb", // TODO: change
		UUID:       "1234",                         // TODO: change
	}

	a, err := service.NewApp(options)
	if err != nil {
		return nil, err
	}

	a.SetName("table-camera")

	b := &BleManager{
		app: a,
	}

	service, err := NewTrackerService(b, tracker, 100*time.Millisecond)
	if err != nil {
		return nil, err
	}
	if err = b.app.AddService(service.Service); err != nil {
		return nil, err
	}
	b.trackerService = service

	return b, nil
}

func (manager *BleManager) Start(ctx context.Context) error {
	err := manager.app.Run()
	if err != nil {
		return err
	}

	cancel, err := manager.app.Advertise(4294967295)
	if err != nil {
		return err
	}

	go func() {
		<-ctx.Done()
		cancel()
	}()

	return nil
}
