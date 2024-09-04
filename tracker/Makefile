include .env

.ONESHELL:
.PHONY: install_build_utils install_libcamera install_opencv install_deps install_nodejs build

install_build_utils:
	sudo apt-get update
	sudo apt-get install -y pkg-config meson ninja-build cmake sudo ssh rsync

install_libcamera:
	sudo apt-get install -y libcamera-dev

install_opencv:
	go mod download
	$(MAKE) -C ${GOPATH}/pkg/mod/gocv.io/x/* install

NODE_VERSION = 22.6.0
ARCH = arm64
DISTRO = linux
NODE_TAR = node-v$(NODE_VERSION)-$(DISTRO)-$(ARCH).tar.xz
NODE_URL = https://nodejs.org/dist/v$(NODE_VERSION)/$(NODE_TAR)
INSTALL_DIR = /usr/local

install_nodejs:
	curl -o $(NODE_TAR) $(NODE_URL)
	tar -xf $(NODE_TAR)
	sudo cp -r node-v$(NODE_VERSION)-$(DISTRO)-$(ARCH)/* $(INSTALL_DIR)/
	rm -rf node-v$(NODE_VERSION)-$(DISTRO)-$(ARCH) $(NODE_TAR)

install_deps: install_build_utils install_libcamera install_opencv install_nodejs

build:
	GOOS=linux GOARCH=arm64 go build -o bin/camera cmd/tracker/main.go

push:
	rsync -avz --progress bin/camera pi@$(TRACKER_HOSTNAME):~/camera

run-remote:
	ssh pi@$(TRACKER_HOSTNAME) -t "./camera"

dev: build push run-remote
