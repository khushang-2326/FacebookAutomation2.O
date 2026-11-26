#!/usr/bin/env python3
"""
GStreamer Daemon Engine for Facebook Live Streamer 2.0
Persistent, zero-disconnect media engine managing in-process GStreamer pipelines,
D3D11 zero-copy hardware acceleration, and dynamic input-selector camera switching.
Communicates with Node.js backend via JSON-RPC over stdio.
"""

import sys
import os
import json
import time
import threading
import ctypes
import signal

# Ensure unbuffered stdout/stdin
sys.stdout.reconfigure(line_buffering=True)
sys.stdin.reconfigure(line_buffering=True)

# GStreamer enum constants
GST_STATE_VOID_PENDING = 0
GST_STATE_NULL = 1
GST_STATE_READY = 2
GST_STATE_PAUSED = 3
GST_STATE_PLAYING = 4

GST_MESSAGE_UNKNOWN = 0
GST_MESSAGE_EOS = (1 << 0)
GST_MESSAGE_ERROR = (1 << 1)
GST_MESSAGE_WARNING = (1 << 2)
GST_MESSAGE_INFO = (1 << 3)
GST_MESSAGE_TAG = (1 << 4)
GST_MESSAGE_BUFFERING = (1 << 5)
GST_MESSAGE_STATE_CHANGED = (1 << 6)
GST_MESSAGE_ANY = 0xFFFFFFFF

GST_CLOCK_TIME_NONE = 0xFFFFFFFFFFFFFFFF
GST_FORMAT_TIME = 3


class GstCtypesBindings:
    """Encapsulates GStreamer and GObject CTypes function bindings with 64-bit safety."""

    def __init__(self, bin_dir=None):
        self.bin_dir = self._resolve_bin_dir(bin_dir)
        self._load_libraries()
        self._bind_functions()

    def _resolve_bin_dir(self, explicit_dir):
        if explicit_dir and os.path.isdir(explicit_dir):
            return explicit_dir

        env_vars = ['GSTREAMER_BIN', 'GSTREAMER_1_0_ROOT_MSVC_X86_64', 'GSTREAMER_ROOT']
        for var in env_vars:
            val = os.environ.get(var)
            if val:
                candidate = val if os.path.basename(val.rstrip('\\/')) == 'bin' else os.path.join(val, 'bin')
                if os.path.isdir(candidate):
                    return candidate

        user_home = os.path.expanduser('~')
        standard_dirs = [
            os.path.join(user_home, 'AppData', 'Local', 'Programs', 'gstreamer', '1.0', 'msvc_x86_64', 'bin'),
            r'C:\gstreamer\1.0\msvc_x86_64\bin',
            r'C:\Program Files\gstreamer\1.0\msvc_x86_64\bin'
        ]
        for d in standard_dirs:
            if os.path.isdir(d):
                return d

        raise RuntimeError("GStreamer MSVC x86_64 bin directory not found.")

    def _load_libraries(self):
        os.environ['PATH'] = self.bin_dir + os.pathsep + os.environ.get('PATH', '')
        if hasattr(os, 'add_dll_directory'):
            os.add_dll_directory(self.bin_dir)

        gst_dll_path = os.path.join(self.bin_dir, 'gstreamer-1.0-0.dll')
        gobj_dll_path = os.path.join(self.bin_dir, 'gobject-2.0-0.dll')
        glib_dll_path = os.path.join(self.bin_dir, 'glib-2.0-0.dll')

        if not os.path.isfile(gst_dll_path):
            raise FileNotFoundError(f"Missing {gst_dll_path}")
        if not os.path.isfile(gobj_dll_path):
            raise FileNotFoundError(f"Missing {gobj_dll_path}")
        if not os.path.isfile(glib_dll_path):
            raise FileNotFoundError(f"Missing {glib_dll_path}")

        self.libgst = ctypes.CDLL(gst_dll_path)
        self.libgobj = ctypes.CDLL(gobj_dll_path)
        self.libglib = ctypes.CDLL(glib_dll_path)

    def _bind_functions(self):
        # gst_init
        self.libgst.gst_init.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        self.libgst.gst_init.restype = None

        # gst_parse_launch
        self.libgst.gst_parse_launch.argtypes = [ctypes.c_char_p, ctypes.POINTER(ctypes.c_void_p)]
        self.libgst.gst_parse_launch.restype = ctypes.c_void_p

        # gst_element_set_state
        self.libgst.gst_element_set_state.argtypes = [ctypes.c_void_p, ctypes.c_int]
        self.libgst.gst_element_set_state.restype = ctypes.c_int

        # gst_element_get_state
        self.libgst.gst_element_get_state.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(ctypes.c_int),
            ctypes.c_uint64
        ]
        self.libgst.gst_element_get_state.restype = ctypes.c_int

        # gst_bin_get_by_name
        self.libgst.gst_bin_get_by_name.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        self.libgst.gst_bin_get_by_name.restype = ctypes.c_void_p

        # gst_element_get_static_pad
        self.libgst.gst_element_get_static_pad.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
        self.libgst.gst_element_get_static_pad.restype = ctypes.c_void_p

        # gst_pipeline_get_bus
        self.libgst.gst_pipeline_get_bus.argtypes = [ctypes.c_void_p]
        self.libgst.gst_pipeline_get_bus.restype = ctypes.c_void_p

        # gst_bus_timed_pop_filtered
        self.libgst.gst_bus_timed_pop_filtered.argtypes = [ctypes.c_void_p, ctypes.c_uint64, ctypes.c_int]
        self.libgst.gst_bus_timed_pop_filtered.restype = ctypes.c_void_p

        # gst_message_get_type
        self.libgst.gst_message_get_type.argtypes = [ctypes.c_void_p]
        self.libgst.gst_message_get_type.restype = ctypes.c_int

        # gst_message_parse_error
        self.libgst.gst_message_parse_error.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_void_p),
            ctypes.POINTER(ctypes.c_char_p)
        ]
        self.libgst.gst_message_parse_error.restype = None

        # gst_message_parse_warning
        self.libgst.gst_message_parse_warning.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_void_p),
            ctypes.POINTER(ctypes.c_char_p)
        ]
        self.libgst.gst_message_parse_warning.restype = None

        # gst_message_parse_state_changed
        self.libgst.gst_message_parse_state_changed.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(ctypes.c_int)
        ]
        self.libgst.gst_message_parse_state_changed.restype = None

        # gst_element_query_position
        self.libgst.gst_element_query_position.argtypes = [
            ctypes.c_void_p,
            ctypes.c_int,
            ctypes.POINTER(ctypes.c_int64)
        ]
        self.libgst.gst_element_query_position.restype = ctypes.c_int

        # cleanup functions
        self.libgst.gst_message_unref.argtypes = [ctypes.c_void_p]
        self.libgst.gst_message_unref.restype = None

        self.libgst.gst_object_unref.argtypes = [ctypes.c_void_p]
        self.libgst.gst_object_unref.restype = None

        # GObject functions
        self.libgobj.g_object_set.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_void_p, ctypes.c_void_p]
        self.libgobj.g_object_set.restype = None

        self.libgobj.g_object_get.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p]
        self.libgobj.g_object_get.restype = None

        # GLib functions
        self.libglib.g_free.argtypes = [ctypes.c_void_p]
        self.libglib.g_free.restype = None


class GStreamerEngine:
    def __init__(self, bin_dir=None):
        self.bindings = GstCtypesBindings(bin_dir)
        self.bindings.libgst.gst_init(None, None)
        self.pipeline = None
        self.bus = None
        self.selector_elem = None
        self.current_slot = 0
        self.current_pad_name = "sink_0"
        self.running = False
        self.started_at = None
        self.lock = threading.Lock()
        self.bus_thread = None
        self.stop_bus_thread = threading.Event()
        self.switch_count = 0
        self.last_switch_latency_ms = 0.0

    def emit_event(self, event_name, data=None):
        payload = {"event": event_name, "data": data or {}}
        try:
            sys.stdout.write(json.dumps(payload) + "\n")
            sys.stdout.flush()
        except Exception:
            pass

    def emit_response(self, req_id, result=None, error=None):
        payload = {"id": req_id, "result": result, "error": error}
        try:
            sys.stdout.write(json.dumps(payload) + "\n")
            sys.stdout.flush()
        except Exception:
            pass

    def init_pipeline(self, pipeline_desc):
        with self.lock:
            if self.pipeline:
                self.stop_pipeline()

            err_ptr = ctypes.c_void_p()
            desc_bytes = pipeline_desc.encode('utf-8')
            pipeline = self.bindings.libgst.gst_parse_launch(desc_bytes, ctypes.byref(err_ptr))
            if not pipeline:
                raise RuntimeError("Failed to parse and construct GStreamer pipeline string")

            self.pipeline = pipeline
            self.bus = self.bindings.libgst.gst_pipeline_get_bus(self.pipeline)
            self.selector_elem = self.bindings.libgst.gst_bin_get_by_name(self.pipeline, b"cam_selector")

            # Start background bus listener
            self.stop_bus_thread.clear()
            self.bus_thread = threading.Thread(target=self._bus_monitor_loop, daemon=True)
            self.bus_thread.start()

            return {
                "initialized": True,
                "hasSelector": bool(self.selector_elem),
                "pipeline": id(self.pipeline)
            }

    def start_pipeline(self):
        with self.lock:
            if not self.pipeline:
                raise RuntimeError("No pipeline initialized")

            ret = self.bindings.libgst.gst_element_set_state(self.pipeline, GST_STATE_PLAYING)
            if ret == 0:  # GST_STATE_CHANGE_FAILURE
                raise RuntimeError("Failed to transition pipeline to GST_STATE_PLAYING")

            self.running = True
            self.started_at = time.time()
            return {"state": "PLAYING", "startedAt": self.started_at}

    def switch_camera(self, slot_index):
        with self.lock:
            if not self.pipeline or not self.running:
                raise RuntimeError("Pipeline is not running")

            if not self.selector_elem:
                # If only 1 camera without input-selector
                self.current_slot = slot_index
                return {"slot": slot_index, "uninterrupted": True, "latencyMs": 0.0}

            t_start = time.perf_counter()
            pad_name = f"sink_{slot_index}".encode('ascii')
            target_pad = self.bindings.libgst.gst_element_get_static_pad(self.selector_elem, pad_name)
            if not target_pad:
                raise ValueError(f"Input selector pad not found: {pad_name.decode('ascii')}")

            # Switch active-pad dynamically in-process
            self.bindings.libgobj.g_object_set(self.selector_elem, b"active-pad", target_pad, None)
            self.bindings.libgst.gst_object_unref(target_pad)

            t_end = time.perf_counter()
            latency_ms = (t_end - t_start) * 1000.0

            self.current_slot = slot_index
            self.current_pad_name = f"sink_{slot_index}"
            self.switch_count += 1
            self.last_switch_latency_ms = latency_ms

            event_data = {
                "slot": slot_index,
                "pad": self.current_pad_name,
                "latencyMs": round(latency_ms, 3),
                "timestamp": time.time(),
                "switchCount": self.switch_count
            }
            self.emit_event("camera_switched", event_data)

            return {
                "success": True,
                "slot": slot_index,
                "pad": self.current_pad_name,
                "latencyMs": round(latency_ms, 3),
                "uninterrupted": True
            }

    def get_telemetry(self):
        with self.lock:
            if not self.pipeline:
                return {"status": "STOPPED", "uptimeSeconds": 0}

            pos_val = ctypes.c_int64(0)
            has_pos = self.bindings.libgst.gst_element_query_position(
                self.pipeline,
                GST_FORMAT_TIME,
                ctypes.byref(pos_val)
            )
            position_sec = (pos_val.value / 1e9) if (has_pos and pos_val.value >= 0) else 0.0
            uptime = (time.time() - self.started_at) if (self.started_at and self.running) else 0.0

            return {
                "status": "PLAYING" if self.running else "READY",
                "running": self.running,
                "activeSlot": self.current_slot,
                "activePad": self.current_pad_name,
                "uptimeSeconds": round(uptime, 1),
                "streamPositionSeconds": round(position_sec, 1),
                "switchCount": self.switch_count,
                "lastSwitchLatencyMs": round(self.last_switch_latency_ms, 3)
            }

    def stop_pipeline(self):
        with self.lock:
            if not self.pipeline:
                return {"stopped": True}

            self.stop_bus_thread.set()
            self.running = False

            # Set pipeline state to NULL
            try:
                self.bindings.libgst.gst_element_set_state(self.pipeline, GST_STATE_NULL)
            except Exception:
                pass

            if self.selector_elem:
                try:
                    self.bindings.libgst.gst_object_unref(self.selector_elem)
                except Exception:
                    pass
                self.selector_elem = None

            if self.bus:
                try:
                    self.bindings.libgst.gst_object_unref(self.bus)
                except Exception:
                    pass
                self.bus = None

            try:
                self.bindings.libgst.gst_object_unref(self.pipeline)
            except Exception:
                pass
            self.pipeline = None
            self.started_at = None

            return {"stopped": True}

    def _bus_monitor_loop(self):
        """Polls pipeline bus for events, errors, warnings, and state transitions."""
        if not self.bus:
            return

        while not self.stop_bus_thread.is_set():
            # Wait up to 100ms for a message
            msg = self.bindings.libgst.gst_bus_timed_pop_filtered(
                self.bus,
                100 * 1000000,  # 100 ms in nanoseconds
                GST_MESSAGE_ERROR | GST_MESSAGE_WARNING | GST_MESSAGE_EOS | GST_MESSAGE_STATE_CHANGED
            )
            if not msg:
                continue

            msg_type = self.bindings.libgst.gst_message_get_type(msg)

            if msg_type == GST_MESSAGE_ERROR:
                err = ctypes.c_void_p()
                dbg = ctypes.c_char_p()
                self.bindings.libgst.gst_message_parse_error(msg, ctypes.byref(err), ctypes.byref(dbg))
                dbg_msg = dbg.value.decode('utf-8', errors='replace') if dbg.value else "Unknown debug"
                self.emit_event("error", {
                    "message": "GStreamer pipeline error",
                    "debug": dbg_msg
                })
                if dbg.value:
                    self.bindings.libglib.g_free(dbg)

            elif msg_type == GST_MESSAGE_WARNING:
                err = ctypes.c_void_p()
                dbg = ctypes.c_char_p()
                self.bindings.libgst.gst_message_parse_warning(msg, ctypes.byref(err), ctypes.byref(dbg))
                dbg_msg = dbg.value.decode('utf-8', errors='replace') if dbg.value else "Warning"
                self.emit_event("warning", {"message": dbg_msg})
                if dbg.value:
                    self.bindings.libglib.g_free(dbg)

            elif msg_type == GST_MESSAGE_EOS:
                self.emit_event("eos", {"message": "End of Stream reached"})

            elif msg_type == GST_MESSAGE_STATE_CHANGED:
                old_s = ctypes.c_int()
                new_s = ctypes.c_int()
                pend_s = ctypes.c_int()
                self.bindings.libgst.gst_message_parse_state_changed(
                    msg, ctypes.byref(old_s), ctypes.byref(new_s), ctypes.byref(pend_s)
                )

            self.bindings.libgst.gst_message_unref(msg)


def run_rpc_server():
    """Main JSON-RPC command processing loop reading commands from stdin."""
    engine = None

    def send_resp(req_id, result=None, error=None):
        payload = {"id": req_id, "result": result, "error": error}
        try:
            sys.stdout.write(json.dumps(payload) + "\n")
            sys.stdout.flush()
        except Exception:
            pass

    def handle_signal(sig, frame):
        nonlocal engine
        if engine:
            engine.stop_pipeline()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            send_resp(None, error=f"Invalid JSON: {str(e)}")
            continue

        req_id = req.get("id")
        method = req.get("method")
        params = req.get("params") or {}

        try:
            if method == "ping":
                send_resp(req_id, result="pong")

            elif method == "init":
                bin_dir = params.get("binDir")
                pipeline_desc = params.get("pipeline")
                if not pipeline_desc:
                    raise ValueError("Missing 'pipeline' parameter")

                if engine is None:
                    engine = GStreamerEngine(bin_dir)

                res = engine.init_pipeline(pipeline_desc)
                send_resp(req_id, result=res)

            elif method == "start":
                if not engine:
                    raise RuntimeError("Engine not initialized")
                res = engine.start_pipeline()
                send_resp(req_id, result=res)

            elif method == "switch_camera":
                if not engine:
                    raise RuntimeError("Engine not initialized")
                slot = int(params.get("slot", 0))
                res = engine.switch_camera(slot)
                send_resp(req_id, result=res)

            elif method == "get_telemetry":
                if not engine:
                    res = {"status": "UNINITIALIZED", "uptimeSeconds": 0}
                else:
                    res = engine.get_telemetry()
                send_resp(req_id, result=res)

            elif method == "stop":
                if engine:
                    res = engine.stop_pipeline()
                else:
                    res = {"stopped": True}
                send_resp(req_id, result=res)

            else:
                send_resp(req_id, error=f"Unknown method: {method}")

        except Exception as ex:
            send_resp(req_id, error=str(ex))

    # If stdin closes, gracefully cleanup
    if engine:
        engine.stop_pipeline()


if __name__ == "__main__":
    run_rpc_server()
