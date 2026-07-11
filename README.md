# Home Cast 📺

A self-hosted, lightweight video casting application that allows you to instantly upload and stream videos from your phone or computer directly to your smart TV.

## Architecture

This project is divided into two main components:
- **Rust Server (`cast-server`)**: Built with `axum` and `tokio`. It serves a WebSocket connection to the TV receiver, handles video and subtitle uploads, and hosts the receiver interface.
- **React Client (`client`)**: A beautiful, modern web interface (built with React and Vite) to upload videos, upload subtitles, and trigger casting to the TV.

## Features

- **Instant Video Casting**: Cast uploaded videos to your TV receiver screen via WebSockets.
- **On-the-Fly Subtitle Conversion**: Supports both `.srt` and `.vtt` subtitle files. Uploading `.srt` files will automatically trigger on-the-fly conversion to WebVTT format for optimal browser compatibility.
- **Subtitle Management**: Check subtitle status (loaded or missing) for each video in the list, upload new tracks, or replace existing ones from the sender app.

## How it Works

1. Open the "Receiver" web interface on your TV (`http://<YOUR_LOCAL_IP>:3000/receiver`).
2. Open the React client on your phone or laptop.
3. Upload a video, which is safely stored on the server.
4. (Optional) Upload a subtitle file (`.srt` or `.vtt`) under the video file in the video list.
5. Click **Cast to TV**. The server sends a WebSocket message to the TV receiver containing both the video URL and subtitle URL.
6. The TV receiver catches the WebSocket event and instantly begins playback with captions!

## Getting Started

### Prerequisites

**1. Install Rust and Cargo (for the server)**
To install Rust, run the following command in your terminal (macOS/Linux):
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```
*For Windows, download and run `rustup-init.exe` from [rustup.rs](https://rustup.rs/).*

**2. Install Node.js (for the client)**
You can download the official installer from the [Node.js website](https://nodejs.org/).
Alternatively, if you're on macOS/Linux, using [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager) is recommended:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install node
```

### Running the Server
```bash
cd cast-server
cargo run
```
The server will start on `http://0.0.0.0:3000`. 
The TV receiver interface is available at `http://<YOUR_LOCAL_IP>:3000/receiver`.

### Running the Client
```bash
cd client
npm install
npm run dev
```

## Troubleshooting
- **Address already in use**: Make sure no other instances of the server are running. You can kill existing instances by finding the PID or using a command like `killall cast-server`.
- **Playback Blocked**: Modern browsers block autoplay videos with audio. If the TV displays "Playback Blocked", simply click or tap anywhere on the screen (or press OK on your TV remote) to allow playback.
