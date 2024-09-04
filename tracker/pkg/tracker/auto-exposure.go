package tracker

import (
	"context"
	"fmt"
	"math"
	"time"

	"go.einride.tech/pid"
	"gocv.io/x/gocv"
)

const (
	thresholdMinimum = 175
)

func (t *Tracker) CalibrateExposure(ctx context.Context, pixelCountTarget int, deadzonePercent float64, loopRate time.Duration) int {
	// Auto-exposure based on marker size
	controller := pid.Controller{
		Config: pid.ControllerConfig{
			ProportionalGain: 5,
			IntegralGain:     0,
			DerivativeGain:   0.01,
		},
	}
	exposure := 15000
	ticker := time.NewTicker(loopRate)
	red := gocv.NewMat()
	for {
		select {
		case <-ctx.Done():
			ticker.Stop()
			return -1
		case <-ticker.C:
			imgs := gocv.Split(t.frame)
			gocv.Threshold(imgs[2], &red, thresholdMinimum, 255, gocv.ThresholdBinary)
			for _, img := range imgs {
				img.Close()
			}
			nonZeros := gocv.CountNonZero(red)

			controller.Update(pid.ControllerInput{
				ReferenceSignal:  float64(pixelCountTarget),
				ActualSignal:     float64(nonZeros),
				SamplingInterval: loopRate,
			})

			exposure = t.camera.GetExposure() + int(controller.State.ControlSignal)

			// Within 1% of target
			if math.Abs(controller.State.ControlSignal) < (deadzonePercent * float64(pixelCountTarget)) {
				return exposure
			}

			// Clamp exposure between 500 and 20000
			if exposure < 100 {
				exposure = 100
			} else if exposure > 30000 {
				exposure = 30000
			}

			fmt.Printf("%v/%v (%v percent) -> Setting exposure to %v (%v). Previous: %v\n",
				nonZeros,
				pixelCountTarget,
				100*nonZeros/pixelCountTarget,
				exposure,
				controller.State.ControlSignal,
				t.camera.GetExposure(),
			)
			t.camera.SetExposure(exposure)
		}
	}
}
