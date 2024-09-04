#include <iostream>
#include <libcamera/libcamera.h>

extern "C"
{

#include "_cgo_export.h"
#include "camera_linux.h"
#include <stdint.h>

  using namespace libcamera;

  static std::unique_ptr<CameraManager> cam_manager;
  static std::unique_ptr<FrameBufferAllocator> allocator;
  static std::unique_ptr<CameraConfiguration> config;
  static std::shared_ptr<Camera> camera;
  static std::unique_ptr<Request> request;
  static uintptr_t callback_handle;
  static unsigned int latest_exposure;

  auto camera_controls = std::make_unique<ControlList>();

  static void requestComplete(Request *req)
  {
    if (req->status() == Request::RequestCancelled)
      return;

    latest_exposure = req->metadata().get(controls::ExposureTime).value_or(0);

    auto handle = static_cast<uintptr_t>(callback_handle);
    requestCallback(handle);
  }

  buffer buffer_at()
  {
    StreamConfiguration &streamConfig = config->at(0);
    auto stream = streamConfig.stream();
    const auto &buf = allocator->buffers(stream)[0];
    const auto &plane = buf->planes()[0];
    buffer b = {};
    b.fd = plane.fd.get();
    b.offset = plane.offset;
    b.length = plane.offset;
    // Verify that all planes are laid out in a contiguous block
    // in one file descriptor. This is true in libcamera today, but
    // may not be in future.
    for (auto &p : buf->planes())
    {
      if (p.fd.get() != b.fd || p.offset != b.offset + b.length)
      {
        abort();
      }
      b.length += p.length;
    }
    return b;
  }

  int queue_request()
  {
    request.get()->controls() = *camera_controls.get();
    request.get()->reuse(Request::ReuseBuffers);
    return camera->queueRequest(request.get());
  }

  int open_camera(unsigned int width, unsigned int height, uintptr_t handle)
  {
    auto cm = std::make_unique<CameraManager>();
    auto ret = cm->start();
    if (ret != 0)
    {
      return ret;
    }
    if (cm->cameras().empty())
    {
      cm->stop();
      return -EINVAL;
    }
    auto cameraId = cm->cameras()[0]->id();
    auto c = cm->get(cameraId);
    ret = c->acquire();
    if (ret != 0)
    {
      cm->stop();
      return ret;
    }
    auto conf = c->generateConfiguration({StreamRole::VideoRecording});
    if (conf == nullptr)
    {
      c->release();
      cm->stop();
      return -EINVAL;
    }

    std::cout << "Default Raw configuration is: " << conf->at(0).toString() << std::endl;

    // conf->sensorConfig->bitDepth = 8;
    // conf->sensorConfig->outputSize.width = 640;
    // conf->sensorConfig->outputSize.height = 480;
    // conf->sensorConfig->binning.binX = 2;
    // conf->sensorConfig->binning.binY = 2;
    // conf->sensorConfig->skipping.xEvenInc = 1;
    // conf->sensorConfig->skipping.xOddInc = 1;
    // conf->sensorConfig->skipping.yEvenInc = 1;
    // conf->sensorConfig->skipping.yOddInc = 1;
    // conf->sensorConfig->analogCrop.x = 0;
    // conf->sensorConfig->analogCrop.y = 0;
    // conf->sensorConfig->analogCrop.width = 640;
    // conf->sensorConfig->analogCrop.height = 480;

    auto &streamConfig = conf->at(0);
    streamConfig.size.width = width;
    streamConfig.size.height = height;
    streamConfig.pixelFormat = formats::RGB888;
    streamConfig.colorSpace = ColorSpace::Srgb;
    // Minimize latency.
    streamConfig.bufferCount = 1;

    ret = conf->validate();
    if (ret != 0 || conf->at(0).pixelFormat != formats::RGB888)
    {
      c->release();
      cm->stop();
      return -EINVAL;
    }

    std::cout << "Updated configuration is: " << conf->at(0).toString() << std::endl;

    ret = c->configure(conf.get());
    if (ret != 0)
    {
      c->release();
      cm->stop();
      return ret;
    }

    std::cout << "Configured camera: (" << conf.get()->sensorConfig->analogCrop << ")" << std::endl;

    auto a = std::make_unique<FrameBufferAllocator>(c);

    auto stream = streamConfig.stream();
    ret = a->allocate(stream);
    if (ret < 0)
    {
      c->release();
      cm->stop();
      return -EINVAL;
    }

    const auto &buffers = a->buffers(stream);
    request = c->createRequest();

    if (!request)
    {
      a->free(stream);
      c->release();
      cm->stop();
      return -EINVAL;
    }

    const auto &buffer = buffers[0];
    ret = request->addBuffer(stream, buffer.get());
    if (ret < 0)
    {
      a->free(stream);
      c->release();
      cm->stop();
      return -EINVAL;
    }

    c->requestCompleted.connect(requestComplete);

    callback_handle = handle;
    cam_manager = std::move(cm);
    camera = std::move(c);
    allocator = std::move(a);
    config = std::move(conf);
    return 0;
  }

  void set_exposure(unsigned int exposureMicroseconds)
  {
    request->controls().set(controls::ExposureTime, exposureMicroseconds);
  }

  unsigned int get_exposure()
  {
    return latest_exposure;
  }

  int start_camera()
  {
    camera_controls.get()->set(controls::AwbEnable,
                               false);
    camera_controls.get()->set(controls::AeEnable,
                               false);
    camera_controls.get()->set(controls::AfMode,
                               controls::AfModeEnum::AfModeManual);
    camera_controls.get()->set(controls::LensPosition,
                               2.0f);
    camera_controls.get()->set(controls::FrameDurationLimits,
                               Span<const std::int64_t, 2>({
                                   100, // > 60 fps
                                   33333,
                               }));
    camera_controls.get()->set(controls::AnalogueGain,
                               5.0f);
    auto ret = camera->start(camera_controls.get());
    if (ret != 0)
    {
      return ret;
    }
    camera->queueRequest(request.get());
    return 0;
  }

  void close_camera()
  {
    camera->stop();
    request.release();
    request = nullptr;
    auto &streamConfig = config->at(0);
    auto stream = streamConfig.stream();
    allocator->free(stream);
    allocator = nullptr;
    camera->release();
    camera = nullptr;
    cam_manager->stop();
    cam_manager = nullptr;
  }
}