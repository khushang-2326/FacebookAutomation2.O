'use strict';

const { gstreamerRuntimeDetector } = require('./gstreamerRuntimeDetector');
const { Logger } = require('../utils/logger');

const logger = new Logger('GStreamerPipelineBuilder');

class GStreamerPipelineBuilder {
  /**
   * Constructs a zero-copy GStreamer pipeline string for RTSP cameras,
   * input-selector pad switching, D3D11 hardware acceleration, and
   * isolated branch delivery to Facebook Live, YouTube Live, and HDMI out.
   *
   * @param {Object} options
   * @param {Array<Object>} options.cameras - Array of camera source configs [{ rtspUrl, videoCodec, audioCodec, fps, width, height }]
   * @param {Object} [options.facebook] - Facebook output { rtmpUrl, width: 1920, height: 1080, fps: 60, bitrate: 6000 }
   * @param {Object} [options.youtube] - YouTube output { rtmpUrl, width: 2560, height: 1440, fps: 60, bitrate: 14000, codec: 'h264'|'h265' }
   * @param {Object} [options.hdmi] - HDMI output { enabled: false, adapter: -1, fullscreen: true }
   * @param {Object} [options.audio] - Audio config { source: 'wasapi'|'silence', device: null, bitrate: 128 }
   * @param {Object} [options.runtimeInfo] - Optional GStreamer detector info
   * @returns {string} Fully validated GStreamer launch string
   */
  buildPipeline(options) {
    const {
      cameras = [],
      facebook = null,
      youtube = null,
      hdmi = null,
      audio = {},
      runtimeInfo = null
    } = options;

    if (!Array.isArray(cameras) || cameras.length === 0) {
      throw new Error('GStreamerPipelineBuilder requires at least one camera input source.');
    }

    const detected = runtimeInfo || gstreamerRuntimeDetector.detectRuntime();
    const hasD3d11 = Boolean(detected.plugins?.d3d11);
    const d3d11ZeroCopy = Boolean(detected.hwAcceleration?.d3d11ZeroCopy);
    const bestH264Enc = detected.encoders?.h264 || 'x264enc';
    const bestH265Enc = detected.encoders?.h265 || 'x265enc';
    const bestH264Dec = detected.decoders?.h264 || (detected.plugins?.d3d11h264dec ? 'd3d11h264dec' : 'avdec_h264');
    const bestH265Dec = detected.decoders?.h265 || (detected.plugins?.d3d11h265dec ? 'd3d11h265dec' : 'avdec_h265');
    const pipelineUsesD3D11 = Boolean(d3d11ZeroCopy && detected.plugins?.d3d11scale);

    const pipelineParts = [];

    // 1. Build camera input sources and decoding branches
    cameras.forEach((cam, idx) => {
      const isWebcam = Boolean(
        cam.isLocalCamera ||
        cam.cameraType === 'WEBCAM' ||
        cam.sourceType === 'WEBCAM' ||
        cam.sourceType === 'LOCAL_CAMERA' ||
        cam.deviceName ||
        (cam.rtspUrl && (cam.rtspUrl.startsWith('webcam:') || cam.rtspUrl.startsWith('device:')))
      );

      if (isWebcam) {
        let webcamSrc = 'autovideosrc';
        const devIdx = (typeof cam.deviceIndex === 'number' && cam.deviceIndex >= 0) ? `device-index=${cam.deviceIndex}` : '';
        if (detected.plugins?.mfvideosrc) {
          webcamSrc = devIdx ? `mfvideosrc ${devIdx}` : 'mfvideosrc';
        } else if (detected.plugins?.ksvideosrc) {
          webcamSrc = devIdx ? `ksvideosrc ${devIdx}` : 'ksvideosrc';
        }

        let camPostDecode = '';
        if (pipelineUsesD3D11 && detected.plugins?.d3d11upload) {
          camPostDecode = 'videoconvert ! d3d11upload ! video/x-raw(memory:D3D11Memory)';
        } else {
          camPostDecode = 'videoconvert ! video/x-raw';
        }

        const camBranch = [
          webcamSrc,
          camPostDecode,
          `queue name=cam_q_${idx} max-size-buffers=3 max-size-time=0 max-size-bytes=0 leaky=downstream`,
          `cam_selector.sink_${idx}`
        ].join(' ! ');

        pipelineParts.push(camBranch);
        return;
      }

      const rtspUrl = cam.rtspUrl || cam.url;
      if (!rtspUrl) {
        throw new Error(`Camera at index ${idx} is missing RTSP URL.`);
      }

      const codec = String(cam.videoCodec || 'h264').toLowerCase();
      const isH265 = codec.includes('265') || codec.includes('hevc');
      const depay = isH265 ? 'rtph265depay' : 'rtph264depay';
      const parse = isH265 ? 'h265parse' : 'h264parse';
      const decoder = isH265 ? bestH265Dec : bestH264Dec;
      const isD3D11Dec = decoder.startsWith('d3d11');

      let memCaps = '';
      if (isD3D11Dec) {
        memCaps = 'video/x-raw(memory:D3D11Memory)';
      } else if (pipelineUsesD3D11 && detected.plugins?.d3d11upload) {
        memCaps = 'video/x-raw ! videoconvert ! d3d11upload ! video/x-raw(memory:D3D11Memory)';
      } else {
        memCaps = 'video/x-raw';
      }

      // Queue parameters for camera inputs: minimal latency, leaky downstream
      const camBranch = [
        `rtspsrc location="${rtspUrl}" protocols=tcp latency=200 drop-on-latency=true`,
        depay,
        parse,
        decoder,
        memCaps,
        `queue name=cam_q_${idx} max-size-buffers=3 max-size-time=0 max-size-bytes=0 leaky=downstream`,
        `cam_selector.sink_${idx}`
      ].join(' ! ');

      pipelineParts.push(camBranch);
    });

    // 2. Input-Selector and Program Tee
    const selectorConfig = 'input-selector name=cam_selector sync-mode=active-edit sync-streams=true cache-buffers=true';
    pipelineParts.push(`${selectorConfig} ! tee name=program_tee`);

    // 3. Audio Source & Distribution Branch
    const hasAudioMuxTarget = Boolean((facebook && facebook.rtmpUrl) || (youtube && youtube.rtmpUrl));
    if (hasAudioMuxTarget) {
      const audioSourceType = audio.source || 'silence';
      let audioSrc = 'audiotestsrc wave=silence is-live=true';
      if (audioSourceType === 'wasapi' && detected.plugins?.wasapisrc) {
        audioSrc = audio.device ? `wasapisrc device="${audio.device}"` : 'wasapisrc';
      }

      const audioBitrate = (audio.bitrate || 128) * 1000;
      const audioPipeline = [
        audioSrc,
        'audioconvert',
        'audioresample',
        'audio/x-raw,rate=48000,channels=2',
        `voaacenc bitrate=${audioBitrate}`,
        'aacparse',
        'tee name=audio_tee'
      ].join(' ! ');

      pipelineParts.push(audioPipeline);
    }

    // 4. Facebook Live Branch (Target: 1080p60 H.264 CBR, GOP=120 or GOP=60 for 30fps)
    if (facebook && facebook.rtmpUrl) {
      const fbWidth = facebook.width || 1920;
      const fbHeight = facebook.height || 1080;
      const fbFps = facebook.fps || 60;
      const fbGop = Math.round(fbFps * 2); // 2-second keyframe interval
      const fbBitrate = facebook.bitrate || 6000; // kbps

      const fbEncStr = this._buildEncoderString({
        codec: 'h264',
        encoderName: bestH264Enc,
        bitrateKbps: fbBitrate,
        gopSize: fbGop,
        fps: fbFps
      });

      let scaleElement = '';
      if (pipelineUsesD3D11) {
        if (bestH264Enc.startsWith('amf') || bestH264Enc.startsWith('d3d11')) {
          scaleElement = `d3d11scale ! video/x-raw(memory:D3D11Memory),width=${fbWidth},height=${fbHeight},framerate=${fbFps}/1`;
        } else {
          scaleElement = `d3d11scale ! video/x-raw(memory:D3D11Memory),width=${fbWidth},height=${fbHeight},framerate=${fbFps}/1 ! d3d11download ! video/x-raw,width=${fbWidth},height=${fbHeight},framerate=${fbFps}/1 ! videoconvert`;
        }
      } else {
        scaleElement = `videoscale ! videoconvert ! video/x-raw,width=${fbWidth},height=${fbHeight},framerate=${fbFps}/1`;
      }

      const fbVideoBranch = [
        'program_tee.',
        'queue name=fb_q max-size-buffers=60 max-size-time=2000000000 max-size-bytes=0 leaky=downstream',
        scaleElement,
        fbEncStr,
        'h264parse config-interval=1',
        'fb_mux.video'
      ].join(' ! ');

      const fbAudioBranch = [
        'audio_tee.',
        'queue name=fb_audio_q max-size-buffers=100 max-size-time=2000000000 max-size-bytes=0 leaky=downstream',
        'fb_mux.audio'
      ].join(' ! ');

      const fbSinkBranch = `flvmux name=fb_mux streamable=true enforce-increasing-timestamps=true ! rtmp2sink location="${facebook.rtmpUrl}"`;

      pipelineParts.push(fbVideoBranch);
      pipelineParts.push(fbAudioBranch);
      pipelineParts.push(fbSinkBranch);
    }

    // 5. YouTube Live Branch (Target: 1440p60 H.265/H.264 CBR, GOP=120)
    if (youtube && youtube.rtmpUrl) {
      const ytWidth = youtube.width || 2560;
      const ytHeight = youtube.height || 1440;
      const ytFps = youtube.fps || 60;
      const ytGop = Math.round(ytFps * 2);
      const ytBitrate = youtube.bitrate || 14000;
      const requestedCodec = String(youtube.codec || 'h265').toLowerCase();
      const useH265 = (requestedCodec.includes('265') || requestedCodec.includes('hevc')) && bestH265Enc !== 'x265enc';

      const encCodec = useH265 ? 'h265' : 'h264';
      const encName = useH265 ? bestH265Enc : bestH264Enc;

      const ytEncStr = this._buildEncoderString({
        codec: encCodec,
        encoderName: encName,
        bitrateKbps: ytBitrate,
        gopSize: ytGop,
        fps: ytFps
      });

      const parseStr = encCodec === 'h265' ? 'h265parse config-interval=1' : 'h264parse config-interval=1';

      let scaleElement = '';
      if (pipelineUsesD3D11) {
        if (encName.startsWith('amf') || encName.startsWith('d3d11')) {
          scaleElement = `d3d11scale ! video/x-raw(memory:D3D11Memory),width=${ytWidth},height=${ytHeight},framerate=${ytFps}/1`;
        } else {
          scaleElement = `d3d11scale ! video/x-raw(memory:D3D11Memory),width=${ytWidth},height=${ytHeight},framerate=${ytFps}/1 ! d3d11download ! video/x-raw,width=${ytWidth},height=${ytHeight},framerate=${ytFps}/1 ! videoconvert`;
        }
      } else {
        scaleElement = `videoscale ! videoconvert ! video/x-raw,width=${ytWidth},height=${ytHeight},framerate=${ytFps}/1`;
      }

      const ytVideoBranch = [
        'program_tee.',
        'queue name=yt_q max-size-buffers=60 max-size-time=2000000000 max-size-bytes=0 leaky=downstream',
        scaleElement,
        ytEncStr,
        parseStr,
        'yt_mux.video'
      ].join(' ! ');

      const ytAudioBranch = [
        'audio_tee.',
        'queue name=yt_audio_q max-size-buffers=100 max-size-time=2000000000 max-size-bytes=0 leaky=downstream',
        'yt_mux.audio'
      ].join(' ! ');

      const ytSinkBranch = `flvmux name=yt_mux streamable=true enforce-increasing-timestamps=true ! rtmp2sink location="${youtube.rtmpUrl}"`;

      pipelineParts.push(ytVideoBranch);
      pipelineParts.push(ytAudioBranch);
      pipelineParts.push(ytSinkBranch);
    }

    // 6. HDMI Output Branch (Zero-copy GPU sink to local display)
    if (hdmi && hdmi.enabled) {
      const adapterIdx = (typeof hdmi.adapter === 'number' && hdmi.adapter >= 0) ? `adapter=${hdmi.adapter}` : '';
      const fullscreenProp = hdmi.fullscreen ? 'fullscreen=true' : '';
      const sinkProps = [adapterIdx, fullscreenProp, 'sync=false'].filter(Boolean).join(' ');

      let hdmiSink = 'autovideosink sync=false';
      if (pipelineUsesD3D11 && detected.plugins?.d3d11videosink) {
        hdmiSink = `d3d11videosink ${sinkProps}`.trim();
      } else if (detected.plugins?.d3d11videosink && detected.plugins?.d3d11upload) {
        hdmiSink = `videoconvert ! d3d11upload ! d3d11videosink ${sinkProps}`.trim();
      }

      const hdmiBranch = [
        'program_tee.',
        'queue name=hdmi_q max-size-buffers=5 max-size-time=100000000 max-size-bytes=0 leaky=downstream',
        hdmiSink
      ].join(' ! ');

      pipelineParts.push(hdmiBranch);
    }

    // Fallback: If no sinks were attached (e.g. preview mode or testing), attach fakesink
    if (!facebook && !youtube && (!hdmi || !hdmi.enabled)) {
      pipelineParts.push('program_tee. ! queue name=test_q ! fakesink');
    }

    const fullPipeline = pipelineParts.join(' ');
    logger.debug(`Constructed GStreamer Pipeline: ${fullPipeline}`);
    return fullPipeline;
  }

  /**
   * Builds encoder string with exact hardware vendor parameter tuning.
   * Intel QSV (low-power, CBR)
   * AMD AMF (usage=ultralow-latency, rate-control=cbr)
   * NVIDIA NVENC (rc-mode=cbr)
   * x264/x265 (tune=zerolatency, CBR)
   */
  _buildEncoderString({ codec, encoderName, bitrateKbps, gopSize, fps }) {
    if (encoderName === 'qsvh264enc') {
      return `qsvh264enc bitrate=${bitrateKbps} gop-size=${gopSize} rate-control=cbr low-power=true`;
    }
    if (encoderName === 'qsvh265enc') {
      return `qsvh265enc bitrate=${bitrateKbps} gop-size=${gopSize} rate-control=cbr low-power=true`;
    }
    if (encoderName === 'amfh264enc') {
      return `amfh264enc bitrate=${bitrateKbps} max-bitrate=${bitrateKbps} gop-size=${gopSize} rate-control=cbr usage=ultralow-latency`;
    }
    if (encoderName === 'amfh265enc') {
      return `amfh265enc bitrate=${bitrateKbps} max-bitrate=${bitrateKbps} gop-size=${gopSize} rate-control=cbr usage=ultralow-latency`;
    }
    if (encoderName === 'nvh264enc') {
      return `nvh264enc bitrate=${bitrateKbps} gop-size=${gopSize} rc-mode=cbr`;
    }
    if (encoderName === 'nvh265enc') {
      return `nvh265enc bitrate=${bitrateKbps} gop-size=${gopSize} rc-mode=cbr`;
    }
    if (encoderName === 'd3d11h264enc') {
      return `d3d11h264enc bitrate=${bitrateKbps} gop-size=${gopSize}`;
    }
    if (encoderName === 'd3d11h265enc') {
      return `d3d11h265enc bitrate=${bitrateKbps} gop-size=${gopSize}`;
    }
    if (codec === 'h265' || encoderName === 'x265enc') {
      return `x265enc bitrate=${bitrateKbps} key-int-max=${gopSize} tune=zerolatency speed-preset=ultrafast`;
    }
    // Default x264enc
    return `x264enc bitrate=${bitrateKbps} key-int-max=${gopSize} tune=zerolatency speed-preset=veryfast pass=cbr`;
  }
}

const gstreamerPipelineBuilder = new GStreamerPipelineBuilder();
module.exports = { GStreamerPipelineBuilder, gstreamerPipelineBuilder };
