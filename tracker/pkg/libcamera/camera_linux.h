#ifndef CAMERA_LINUX_H
#define CAMERA_LINUX_H

#include <stdint.h>

typedef struct {
  int fd;
  unsigned int offset;
  unsigned int length;
} buffer;

extern int open_camera(unsigned int width, unsigned int height, uintptr_t handle);
extern int start_camera();
extern void set_exposure(unsigned int exposure_microseconds);
extern unsigned int get_exposure();
extern void close_camera();
extern int queue_request();
extern buffer buffer_at();

#endif