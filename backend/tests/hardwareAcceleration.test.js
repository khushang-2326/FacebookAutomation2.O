'use strict';

const { hardwareEncoderService, HardwareEncoderService } = require('../services/hardwareEncoderService');

describe('Central GPU Hardware Acceleration Manager', () => {
  let initialMode;

  beforeAll(() => {
    initialMode = hardwareEncoderService.getMode();
  });

  afterAll(() => {
    hardwareEncoderService.setMode(initialMode);
  });

  test('detectAdapters returns an array of detected GPU adapters with required metadata', () => {
    const adapters = hardwareEncoderService.detectAdapters();
    expect(Array.isArray(adapters)).toBe(true);
    expect(adapters.length).toBeGreaterThan(0);
    const primary = adapters[0];
    expect(primary).toHaveProperty('name');
    expect(primary).toHaveProperty('vendor');
    expect(primary).toHaveProperty('driverVersion');
    expect(primary).toHaveProperty('status');
  });

  test('setMode correctly switches between AUTO, HARDWARE_REQUIRED, and SOFTWARE modes', () => {
    expect(hardwareEncoderService.setMode('AUTO')).toBe('AUTO');
    expect(hardwareEncoderService.getMode()).toBe('AUTO');

    expect(hardwareEncoderService.setMode('HARDWARE_REQUIRED')).toBe('HARDWARE_REQUIRED');
    expect(hardwareEncoderService.getMode()).toBe('HARDWARE_REQUIRED');

    expect(hardwareEncoderService.setMode('INTEL_QSV')).toBe('INTEL_QSV');
    expect(hardwareEncoderService.getMode()).toBe('INTEL_QSV');

    expect(hardwareEncoderService.setMode('NVIDIA_NVENC')).toBe('NVIDIA_NVENC');
    expect(hardwareEncoderService.getMode()).toBe('NVIDIA_NVENC');

    expect(hardwareEncoderService.setMode('AMD_AMF')).toBe('AMD_AMF');
    expect(hardwareEncoderService.getMode()).toBe('AMD_AMF');

    expect(hardwareEncoderService.setMode('SOFTWARE')).toBe('SOFTWARE');
    expect(hardwareEncoderService.getMode()).toBe('SOFTWARE');

    expect(() => hardwareEncoderService.setMode('INVALID_MODE')).toThrow(/Invalid hardware acceleration mode/);
  });

  test('Intel candidate order strictly uses h264_qsv with zero silent CPU or MF fallback', () => {
    const testService = new HardwareEncoderService();
    testService._adapters = [{ index: 0, name: 'Intel(R) UHD Graphics 770', vendor: 'INTEL' }];
    testService._primaryVendor = 'INTEL';
    expect(testService._getCandidateEncoders('AUTO')).toEqual(['h264_qsv']);
    expect(testService._getCandidateEncoders('INTEL_QSV')).toEqual(['h264_qsv']);
    expect(testService._getCandidateEncoders('HARDWARE_REQUIRED')).toEqual(['h264_qsv']);
  });

  test('Intel pipeline enforces CPU software decoding (no -hwaccel flags) and h264_qsv GPU encoding telemetry', () => {
    const testService = new HardwareEncoderService();
    testService._adapters = [{ index: 0, name: 'Intel(R) UHD Graphics', vendor: 'INTEL' }];
    testService._adapterName = 'Intel(R) UHD Graphics';
    testService._primaryVendor = 'INTEL';
    testService._activeEncoder = 'h264_qsv';
    testService._validatedEncoders.set('h264_qsv_30', { available: true, encoder: 'h264_qsv', isHardware: true });

    // Decoder args must be empty ([]) for CPU software decoding
    expect(testService.getDecoderArgs({ mode: 'AUTO' })).toEqual([]);
    expect(testService.getDecoderArgs({ mode: 'INTEL_QSV' })).toEqual([]);

    const telemetry = testService.getTelemetry('INTEL_QSV');
    expect(telemetry.activeEncoder).toBe('h264_qsv');
    expect(telemetry.isHardware).toBe(true);
    expect(telemetry.verifiedEncoderStatus).toBe('INTEL QSV ENCODING ACTIVE');
    expect(telemetry.activeDecoder).toBe('cpu_software');
    expect(telemetry.isHardwareDecoding).toBe(false);
    expect(telemetry.verifiedDecoderStatus).toBe('CPU SOFTWARE DECODING');
  });

  test('Hybrid GPU host selects discrete NVIDIA in AUTO and switches to Intel in INTEL_QSV mode', () => {
    const testService = new HardwareEncoderService();
    testService._adapters = [
      { index: 0, name: 'Intel(R) UHD Graphics', vendor: 'INTEL' },
      { index: 1, name: 'NVIDIA GeForce RTX 3060', vendor: 'NVIDIA' }
    ];

    expect(testService._resolvePrimaryVendor('AUTO')).toBe('NVIDIA');
    expect(testService._getCandidateEncoders('AUTO')[0]).toBe('h264_nvenc');

    expect(testService._resolvePrimaryVendor('INTEL_QSV')).toBe('INTEL');
    expect(testService._getCandidateEncoders('INTEL_QSV')).toEqual(['h264_qsv']);
    expect(testService.getDecoderArgs({ mode: 'INTEL_QSV' })).toEqual([]);
  });

  test('QSV and MediaFoundation encoders use NV12 pixel format and appropriate hardware flags', () => {
    const testService = new HardwareEncoderService();
    testService._adapters = [{ index: 0, name: 'Intel(R) UHD Graphics', vendor: 'INTEL' }];
    testService._primaryVendor = 'INTEL';
    testService._activeEncoder = 'h264_qsv';
    const qsvArgs = testService.getEncoderArgs({ targetFps: 60 });
    expect(qsvArgs.pixFmt).toBe('nv12');
    expect(qsvArgs.args).toContain('-c:v');
    expect(qsvArgs.args).toContain('h264_qsv');
    expect(qsvArgs.args).toContain('-pix_fmt');
    expect(qsvArgs.args).toContain('nv12');
    expect(qsvArgs.args).toContain('-async_depth');
    expect(qsvArgs.args).not.toContain('-sc_threshold');

    const mfService = new HardwareEncoderService();
    mfService._adapters = [{ index: 0, name: 'Generic Display Adapter', vendor: 'OTHER' }];
    mfService._primaryVendor = 'OTHER';
    mfService._activeEncoder = 'h264_mf';
    const mfArgs = mfService.getEncoderArgs({ mode: 'WINDOWS_MF', targetFps: 30 });
    expect(mfArgs.pixFmt).toBe('nv12');
    expect(mfArgs.args).toContain('-c:v');
    expect(mfArgs.args).toContain('h264_mf');
    expect(mfArgs.args).toContain('-hw_encoding');
    expect(mfArgs.args).toContain('1');
    expect(mfArgs.args).not.toContain('-sc_threshold');
  });

  test('SOFTWARE mode strictly forces libx264 software CPU encoder and disables hardware decoding', () => {
    hardwareEncoderService.setMode('SOFTWARE');
    const enc = hardwareEncoderService.resolveActiveEncoderSync('SOFTWARE');
    expect(enc).toBe('libx264');

    const decArgs = hardwareEncoderService.getDecoderArgs({ mode: 'SOFTWARE' });
    expect(decArgs).toEqual([]);

    const encArgs = hardwareEncoderService.getEncoderArgs({ mode: 'SOFTWARE', targetFps: 30 });
    expect(encArgs.encoder).toBe('libx264');
    expect(encArgs.isHardware).toBe(false);
    expect(encArgs.args).toContain('libx264');
  });

  test('AUTO mode prefers hardware video encoding and D3D11VA hardware decoding on compatible systems', () => {
    hardwareEncoderService.setMode('AUTO');
    const enc = hardwareEncoderService.resolveActiveEncoderSync('AUTO');
    const telemetry = hardwareEncoderService.getTelemetry();

    // The host should select an encoder (either GPU hardware or fallback libx264 if no GPU)
    expect(typeof enc).toBe('string');
    expect(enc.length).toBeGreaterThan(0);

    const decArgs = hardwareEncoderService.getDecoderArgs({ mode: 'AUTO' });
    if (telemetry.isHardwareDecoding) {
      expect(decArgs).toContain('-hwaccel');
      expect(decArgs).toContain('d3d11va');
    }
  });

  test('HARDWARE_REQUIRED mode fails with clean error if no hardware encoder is functional', () => {
    const testService = new HardwareEncoderService();
    // Simulate host with no hardware encoders available
    testService._activeEncoder = 'libx264';

    expect(() => {
      testService.resolveActiveEncoderSync('HARDWARE_REQUIRED');
    }).toThrow(/HARDWARE_ACCELERATION_REQUIRED/);
  });

  test('getEncoderArgs tunes GOP, CBR bitrates, and keyframe intervals for 30 FPS and 60 FPS', () => {
    const args30 = hardwareEncoderService.getEncoderArgs({ targetFps: 30 });
    expect(args30.targetFps).toBe(30);
    expect(args30.args).toContain('-r');
    expect(args30.args[args30.args.indexOf('-r') + 1]).toBe('30');
    expect(args30.args).toContain('-g');
    expect(args30.args[args30.args.indexOf('-g') + 1]).toBe('60'); // 2s GOP at 30 FPS

    const args60 = hardwareEncoderService.getEncoderArgs({ targetFps: 60 });
    expect(args60.targetFps).toBe(60);
    expect(args60.args).toContain('-r');
    expect(args60.args[args60.args.indexOf('-r') + 1]).toBe('60');
    expect(args60.args).toContain('-g');
    expect(args60.args[args60.args.indexOf('-g') + 1]).toBe('120'); // 2s GOP at 60 FPS
  });

  test('generateSanitizedDiagnosticReport creates sanitized report without exposing credentials', () => {
    const mdReport = hardwareEncoderService.generateSanitizedDiagnosticReport('markdown');
    expect(typeof mdReport).toBe('string');
    expect(mdReport).toContain('# Hardware Acceleration & GPU Diagnostic Report');
    expect(mdReport).toContain('GPU Display Adapters Detected');
    expect(mdReport).toContain('Active Acceleration Configuration');
    expect(mdReport).toContain('Data Privacy & Security Sanitization Guarantee');

    // Verify sanitization: Ensure no sensitive patterns appear
    expect(mdReport).not.toMatch(/EAAB[a-zA-Z0-9]+/); // Facebook User Token pattern
    expect(mdReport).not.toMatch(/EAA[a-zA-Z0-9]{20,}/); // Facebook Page Token pattern
    expect(mdReport).not.toMatch(/rtsp:\/\/[a-zA-Z0-9]+:[a-zA-Z0-9]+@/); // Plain credentials in RTSP

    const jsonReportStr = hardwareEncoderService.generateSanitizedDiagnosticReport('json');
    const parsed = JSON.parse(jsonReportStr);
    expect(parsed).toHaveProperty('timestamp');
    expect(parsed).toHaveProperty('system');
    expect(parsed).toHaveProperty('gpu');
    expect(parsed).toHaveProperty('acceleration');
    expect(parsed).toHaveProperty('fpsCapabilities');
  });

  test('Intel QSV failure throws INTEL_QSV_UNAVAILABLE instead of silently falling back to CPU libx264', () => {
    const testService = new HardwareEncoderService();
    testService._adapters = [{ index: 0, name: 'Intel(R) Iris(R) Xe Graphics', vendor: 'INTEL' }];
    testService._adapterName = 'Intel(R) Iris(R) Xe Graphics';
    testService._primaryVendor = 'INTEL';
    testService._activeEncoder = 'h264_qsv';
    testService._validatedEncoders.set('h264_qsv_30', { available: true, encoder: 'h264_qsv' });

    expect(testService.resolveActiveEncoderSync('INTEL_QSV', 30)).toBe('h264_qsv');

    // Simulate runtime failure of h264_qsv
    testService.markEncoderFailed('h264_qsv');

    // Mock FFmpeg probe failure if re-probed
    jest.spyOn(testService, 'probeEncoder').mockReturnValue({ available: false, encoder: 'h264_qsv', isHardware: true });

    expect(() => testService.resolveActiveEncoderSync('INTEL_QSV', 30)).toThrow(/INTEL_QSV_UNAVAILABLE/);
    expect(() => testService.resolveActiveEncoderSync('AUTO', 30)).toThrow(/INTEL_QSV_UNAVAILABLE/);

    const telemetry = testService.getTelemetry('INTEL_QSV');
    expect(telemetry.activeEncoder).toBeNull();
    expect(telemetry.encoderError).toMatch(/INTEL_QSV_UNAVAILABLE/);
    expect(telemetry.activeDecoder).toBe('cpu_software');
  });

  test('markEncoderFailed preserves seamless hardware -> MF -> libx264 fallback for NVIDIA and AMD modes', () => {
    const testService = new HardwareEncoderService();
    testService._adapters = [{ index: 0, name: 'NVIDIA GeForce GTX 1660', vendor: 'NVIDIA' }];
    testService._primaryVendor = 'NVIDIA';
    testService._activeEncoder = 'h264_nvenc';
    testService._validatedEncoders.set('h264_nvenc_30', { available: true, encoder: 'h264_nvenc', isHardware: true });
    testService._validatedEncoders.set('h264_mf_30', { available: true, encoder: 'h264_mf', isHardware: true });
    testService._validatedEncoders.set('libx264_30', { available: true, encoder: 'libx264', isHardware: false });

    expect(testService.resolveActiveEncoderSync('NVIDIA_NVENC', 30)).toBe('h264_nvenc');

    testService.markEncoderFailed('h264_nvenc');
    expect(testService.resolveActiveEncoderSync('NVIDIA_NVENC', 30)).toBe('h264_mf');

    testService.markEncoderFailed('h264_mf');
    expect(testService.resolveActiveEncoderSync('NVIDIA_NVENC', 30)).toBe('libx264');
  });
});
