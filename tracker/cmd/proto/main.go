package main

import (
	"fmt"

	"github.com/tutman96/fantassist.io/tracker/protos"
	"google.golang.org/protobuf/proto"
)

func main() {

	// packet := protos.Packet{
	// 	// RequestId: "12",
	// 	Message: &protos.Packet_Response{
	// 		Response: &protos.Response{
	// 			Message: &protos.Response_TrackerGetMarkerLocationResponse{
	// 				TrackerGetMarkerLocationResponse: &protos.TrackerGetMarkerLocationResponse{
	// 					MarkerLocations: map[int32]*protos.Vector2D{
	// 						1: {
	// 							X: 1.0,
	// 							Y: 2.0,
	// 						},
	// 					},
	// 				},
	// 			},
	// 		},
	// 	},
	// }

	packet := protos.TrackerGetMarkerLocationResponse{
		MarkerLocations: map[int32]*protos.TrackerVector2D{
			1: {
				X: 1.0,
				Y: 2.0,
			},
			2: {
				X: 1.0,
				Y: 2.0,
			},
			3: {
				X: 1.0,
				Y: 2.0,
			},
		},
	}

	bytes, err := proto.Marshal(&packet)
	if err != nil {
		panic(err)
	}

	fmt.Println(len(bytes))
}
