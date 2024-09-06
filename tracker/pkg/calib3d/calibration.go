package calib3d

import (
	"gocv.io/x/gocv"
)

type PoseCalibration struct {
	FoundCorners  []int32
	Yaw           float64
	Pitch         float64
	Roll          float64
	HomographyMat gocv.Mat
}

func NewPoseCalibration() *PoseCalibration {
	return &PoseCalibration{
		HomographyMat: gocv.NewMat(),
	}
}

func (p *PoseCalibration) Close() {
	p.HomographyMat.Close()
}
