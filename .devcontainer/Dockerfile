FROM ghcr.io/dtcooper/raspberrypi-os:bookworm

# RUN make install_deps

RUN apt-get update && apt-get install -y sudo

ARG USERNAME=pi
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Create the user
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

USER pi
CMD bash
