package tracker

import (
	"context"
	"fmt"
	"image"
	"time"

	"gocv.io/x/gocv"
)

func (t *Tracker) DetectMarkers(ctx context.Context) {
	frameListener, deregister := t.registerFrameListener()

	fmt.Println("Detecting markers")
	red := gocv.NewMat()
	t.debugFrames["markers"] = red

	t.SetExposure(1000)

	for {
		select {
		case <-ctx.Done():
			fmt.Println("Done detecting markers")
			deregister()
			return
		case f := <-frameListener:
			frameTime := time.Now()
			gocv.ExtractChannel(f, &red, 2)
			gocv.Threshold(red, &red, thresholdMinimum, 255, gocv.ThresholdBinary)

			// Detect markers in frame
			contours := gocv.FindContours(red, gocv.RetrievalExternal, gocv.ChainApproxSimple)

			for _, marker := range t.markers.GetMarkers() {
				if (marker.LastSeen.Add(500 * time.Millisecond)).Before(frameTime) {
					t.markers.RemoveMarker(marker.Identifier)
				}
			}

			// For each marker, find the closes existing marker in the marker set, otherwise create one
			for i := 0; i < contours.Size(); i++ {
				contour := contours.At(i)

				area := gocv.ContourArea(contour)
				if area < 10 {
					continue
				}

				rect := gocv.BoundingRect(contour)
				center := image.Point{X: rect.Min.X + rect.Dx()/2, Y: rect.Min.Y + rect.Dy()/2}

				// Find the closest marker in the marker set
				closestMarker := t.markers.FindClosestMarker(center, 20000) // TODO: this number is made up

				// If the closest marker is within a threshold, update the position
				if closestMarker != nil {
					// fmt.Println("Updating marker", closestMarker.Identifier, "from", closestMarker.Position, "to", center)
					closestMarker.Position = center
					closestMarker.LastSeen = frameTime
				} else {
					fmt.Println("Found new marker:", center, t.ConvertPixelTo3D(center), area)
					// Otherwise, add a new marker
					marker := Marker{
						Position:  center,
						FirstSeen: frameTime,
						LastSeen:  frameTime,
					}
					t.markers.AddMarker(marker)
				}
			}

			contours.Close()

			for _, listener := range t.markerListeners {
				listener <- t.markers.GetMarkers()
			}
		}
	}
}
