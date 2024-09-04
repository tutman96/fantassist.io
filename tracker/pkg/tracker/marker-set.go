package tracker

import (
	"image"
	"time"
)

// Marker set represents a sparse list of markers, each with their own identifier and position
type Marker struct {
	Identifier byte
	Position   image.Point
	FirstSeen  time.Time
	LastSeen   time.Time
}

type MarkerSet struct {
	availableIdentifiers []byte
	markers              map[byte]*Marker
}

// NewMarkerSet creates a new marker set with no markers
func NewMarkerSet(maxSize int) *MarkerSet {
	ids := make([]byte, maxSize)
	for i := 0; i < maxSize; i++ {
		ids[i] = byte(i + 1)
	}

	return &MarkerSet{
		availableIdentifiers: ids,
		markers:              make(map[byte]*Marker),
	}
}

func (m *MarkerSet) AddMarker(marker Marker) byte {
	// Pop the first available identifier
	marker.Identifier = m.availableIdentifiers[0]
	m.availableIdentifiers = m.availableIdentifiers[1:]

	m.markers[marker.Identifier] = &marker
	return marker.Identifier
}

func (m *MarkerSet) RemoveMarker(identifier byte) {
	m.availableIdentifiers = append(m.availableIdentifiers, identifier)
	delete(m.markers, identifier)
}

func (m *MarkerSet) GetMarker(identifier int) *Marker {
	marker, ok := m.markers[byte(identifier)]
	if !ok {
		return nil
	}

	return marker
}

func (m *MarkerSet) GetMarkers() []*Marker {
	markers := make([]*Marker, len(m.markers))
	i := 0
	for _, marker := range m.markers {
		markers[i] = marker
		i++
	}

	return markers
}

// TODO: optimize this using a quadtree or similar if needed
func (m *MarkerSet) FindClosestMarker(point image.Point, threshold float64) *Marker {
	var closestMarker *Marker
	var closestDistance float64
	for _, marker := range m.markers {
		distanceVector := marker.Position.Sub(point)
		displacement := float64(distanceVector.X*distanceVector.X + distanceVector.Y*distanceVector.Y)
		if displacement < threshold && (closestMarker == nil || displacement < closestDistance) {
			closestMarker = marker
			closestDistance = displacement
		}
	}
	return closestMarker
}
