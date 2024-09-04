// package libcamera implements an interface to the libcamera2
// camera driver.
package libcamera

/*

#cgo CFLAGS: -Werror
#cgo CXXFLAGS: -I/usr/include/libcamera
#cgo LDFLAGS: -lcamera -lcamera-base -L$/usr/include/libcamera -static-libstdc++ -static-libgcc

#include <stdint.h>
#include "camera_linux.h"

*/
import "C"

import (
	"errors"
	"fmt"
	"image"
	"runtime/cgo"
	"sync"
	"syscall"

	"gocv.io/x/gocv"
)

type Camera struct {
	frames     chan Frame
	bufs       chan interface{}
	destroyed  chan struct{}
	closed     chan struct{}
	resolution image.Point
	handle     cgo.Handle
}

type Frame struct {
	image gocv.Mat
}

func (f Frame) Image() gocv.Mat {
	return f.image
}

func (c *Camera) Stop() {
	close(c.closed)
	for {
		select {
		case <-c.frames:
		case <-c.destroyed:
			lock.Unlock()
			return
		}
	}
}

// To simplify C++ reference management, there is only support for
// a single camera at a time.
var lock = &sync.Mutex{}

//export requestCallback
func requestCallback(handle C.uintptr_t) {
	c := cgo.Handle(handle).Value().(*Camera)
	select {
	case <-c.closed:
	case c.bufs <- nil:
	}
}

func Open(resolution image.Point, frames chan Frame) (*Camera, error) {
	c := &Camera{
		frames:     frames,
		resolution: resolution,
		destroyed:  make(chan struct{}),
		closed:     make(chan struct{}),
		bufs:       make(chan interface{}),
	}
	inUse := lock.TryLock()
	if !inUse {
		return nil, errors.New("camera: only a single camera can be open simultaneously")
	}

	c.handle = cgo.NewHandle(c)
	if res := C.open_camera(C.uint(resolution.X), C.uint(resolution.Y), C.uintptr_t(c.handle)); res != 0 {
		c.handle.Delete()
		return nil, fmt.Errorf("open_camera: %d", res)
	}

	return c, nil
}

func (c *Camera) SetExposure(microseconds int) {
	// TODO: error handling when camera not started
	C.set_exposure(C.uint(microseconds))
}

func (c *Camera) GetExposure() int {
	return int(C.get_exposure())
}

func (c *Camera) Start() error {
	defer close(c.destroyed)
	defer c.handle.Delete()
	defer C.close_camera()

	if res := C.start_camera(); res != 0 {
		return fmt.Errorf("camera: start_camera: %d", res)
	}

	desc := C.buffer_at()
	buf, err := syscall.Mmap(int(desc.fd), int64(desc.offset), int(desc.length), syscall.PROT_READ, syscall.MAP_SHARED)
	if err != nil {
		return err
	}
	defer syscall.Munmap(buf)

	mat, err := gocv.NewMatFromBytes(c.resolution.Y, c.resolution.X, gocv.MatTypeCV8UC3, buf)
	if err != nil {
		return err
	}

	f := Frame{
		image: mat,
	}
	for {
		select {
		case <-c.closed:
			return nil
		case <-c.bufs:
			c.frames <- f
			if res := C.queue_request(); res != 0 {
				return fmt.Errorf("queue_request: %d", res)
			}
		}
	}
}
