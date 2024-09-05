package ble

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/muka/go-bluetooth/api/service"
	"github.com/muka/go-bluetooth/bluez/profile/agent"
	"github.com/muka/go-bluetooth/bluez/profile/gatt"
	"github.com/muka/go-bluetooth/hw"
	"github.com/tutman96/fantassist.io/tracker/protos"
	"google.golang.org/protobuf/proto"
)

type BleChannel struct {
	app       *service.App
	readChar  *service.Char
	writeChar *service.Char

	Connected bool

	outboundPacketChannel chan *protos.Packet
	requestHandlers       []func(*protos.Request) *protos.Response
	requestChannels       map[string]chan *protos.Response
}

const (
	trackerServiceUUID             = "2233"
	channelWriteCharacteristicUUID = "3344"
	channelReadCharacteristicUUID  = "3345"
)

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

	if err := btmgmt.SetName("fantassist-tracker"); err != nil {
		return err
	}

	if err := btmgmt.SetPowered(true); err != nil {
		return err
	}

	return nil
}

func NewBleChannel() (*BleChannel, error) {
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

	service, err := a.NewService(trackerServiceUUID)
	if err != nil {
		return nil, err
	}

	writeChar, err := service.NewChar(channelWriteCharacteristicUUID)
	if err != nil {
		return nil, err
	}

	writeChar.Properties.Flags = []string{
		gatt.FlagCharacteristicWrite,
		gatt.FlagCharacteristicWriteWithoutResponse,
	}

	err = service.AddChar(writeChar)
	if err != nil {
		return nil, err
	}

	readChar, err := service.NewChar(channelReadCharacteristicUUID)
	if err != nil {
		return nil, err
	}

	readChar.Properties.Flags = []string{
		gatt.FlagCharacteristicRead,
		gatt.FlagCharacteristicNotify,
	}

	err = service.AddChar(readChar)
	if err != nil {
		return nil, err
	}

	b := &BleChannel{
		app:       a,
		readChar:  readChar,
		writeChar: writeChar,

		Connected: false,

		outboundPacketChannel: make(chan *protos.Packet),
		requestHandlers:       make([]func(*protos.Request) *protos.Response, 0),
		requestChannels:       make(map[string]chan *protos.Response),
	}

	readChar.OnNotify(b.onNotify)
	writeChar.OnWrite(b.onWrite)

	return b, nil
}

func (manager *BleChannel) Start(ctx context.Context) error {
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
		manager.app.Close()
	}()

	return nil
}

func (manager *BleChannel) AddRequestHandler(handler func(req *protos.Request) *protos.Response) {
	manager.requestHandlers = append(manager.requestHandlers, handler)
}

func (manager *BleChannel) Request(req *protos.Request) *protos.Response {
	id := uuid.New()
	packet := &protos.Packet{
		RequestId: id.String(),
		Message: &protos.Packet_Request{
			Request: req,
		},
	}

	response := make(chan *protos.Response)
	manager.requestChannels[id.String()] = response

	manager.sendPacket(packet)
	return <-response
}

func (manager *BleChannel) sendPacket(packet *protos.Packet) {
	manager.outboundPacketChannel <- packet
}

func (manager *BleChannel) onNotify(_ *service.Char, notify bool) error {
	manager.Connected = notify

	fmt.Println("Notify", notify)

	if notify {
		go func() {
			for packet := range manager.outboundPacketChannel {
				fmt.Println("-> Sending packet", packet)
				bytes, err := proto.Marshal(packet)
				if err != nil {
					fmt.Println("Error marshalling packet:", err)
					continue
				}
				manager.readChar.WriteValue(bytes, map[string]interface{}{
					"device": "server",
					"link":   "server",
				})
			}
		}()
	} else {
		close(manager.outboundPacketChannel)
		manager.outboundPacketChannel = make(chan *protos.Packet)
	}

	return nil
}

func (manager *BleChannel) onWrite(_ *service.Char, value []byte) ([]byte, error) {
	packet := &protos.Packet{}
	err := proto.Unmarshal(value, packet)
	if err != nil {
		fmt.Println("Error unmarshalling packet:", err)
		return []byte{}, nil
	}

	fmt.Println("<- Received packet", packet)

	switch packet.Message.(type) {
	case *protos.Packet_Request:
		req := packet.GetRequest()
		for _, handler := range manager.requestHandlers {
			response := handler(req)
			if response != nil {
				manager.sendPacket(&protos.Packet{
					RequestId: packet.RequestId,
					Message: &protos.Packet_Response{
						Response: response,
					},
				})
				return []byte{}, nil
			}
		}
		fmt.Println("No handler found for request", req)
	case *protos.Packet_Response:
		c, ok := manager.requestChannels[packet.RequestId]
		if ok {
			c <- packet.GetResponse()
		} else {
			fmt.Println("No channel found for request ID", packet.RequestId)
		}
	}

	return []byte{}, nil
}
