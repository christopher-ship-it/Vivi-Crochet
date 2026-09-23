# FFmpeg for VIVI video transcode

The API worker looks for an ffmpeg binary at:

1. `FFmpeg:ExecutablePath` / `FFmpeg__ExecutablePath`
2. `{app}/tools/ffmpeg/ffmpeg` (Linux) or `ffmpeg.exe` (Windows)
3. PATH, `/usr/bin/ffmpeg`, `/home/ffmpeg/ffmpeg`

## Azure App Service (Linux)

Download a static build into this folder before publish, or set `FFmpeg__ExecutablePath` to a path where ffmpeg is installed.

Example (Linux x64 static):

```bash
mkdir -p tools/ffmpeg
curl -L -o /tmp/ffmpeg.tgz "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
tar -xJf /tmp/ffmpeg.tgz -C /tmp
cp /tmp/ffmpeg-*-amd64-static/ffmpeg tools/ffmpeg/ffmpeg
chmod +x tools/ffmpeg/ffmpeg
```

Ensure the published site includes `tools/ffmpeg/ffmpeg` (see VIVI.Api.csproj Content copy).
