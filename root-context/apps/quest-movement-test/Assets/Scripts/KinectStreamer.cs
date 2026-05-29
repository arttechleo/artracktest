#if UNITY_STANDALONE_WIN
using System;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using Newtonsoft.Json;
using Microsoft.Azure.Kinect.BodyTracking;

/// <summary>
/// ROOT Theater - Kinect Body Streamer
///
/// Reads Azure Kinect body tracking data from BackgroundDataProvider
/// and streams ALL tracked actor positions to the relay server.
/// The Quest 3 performer sees where actors are on stage.
///
/// Attach this to the same GameObject as TrackerHandler, or any
/// GameObject in the Kinect scene. It auto-finds the data provider.
/// </summary>
public class KinectStreamer : MonoBehaviour
{
    [Header("Network")]
    public string relayServerUrl = "wss://root-relay.onrender.com";
    public string authToken = "root-theater-2026";

    [Header("Streaming")]
    [Range(10, 30)]
    public int targetFPS = 15;

    [Header("Kinect Video")]
    public bool streamColorVideo = true;

    // The Kinect itself captures color at FPS30 (see SkeletalTrackingProvider's
    // ColorResolution.R720p + CameraFPS.FPS30). The cap here is bandwidth + JPEG
    // encoding cost on the sender, not a hardware limit. Default stays at 5 fps
    // to keep relay bandwidth sane; dial up via the inspector if your network
    // and CPU can handle it.
    [Range(1, 30)]
    public int videoFPS = 5;

    [Range(20, 90)]
    public int jpegQuality = 45;

    [Header("Debug")]
    public bool showDebugLog = true;

    // Auto-discovered. We piggyback on the Microsoft sample's `main` MonoBehaviour,
    // which owns the SkeletalTrackingProvider and refreshes m_lastFrameData every Update.
    // BackgroundDataProvider itself is a plain C# class (not a UnityEngine.Object),
    // so FindObjectOfType<BackgroundDataProvider>() doesn't compile.
    private main _mainController;
    private float _lastSentTimestamp = -1f;

    // WebSocket
    private ClientWebSocket _ws;
    private CancellationTokenSource _cts;
    private bool _connected;
    private float _sendInterval;
    private float _videoInterval;
    private float _lastSendTime;
    private float _lastVideoSendTime;
    private int _frameCounter;
    private int _videoFrameCounter;
    private readonly Queue<string> _sendQueue = new Queue<string>();
    private string _connectionStatus = "Initializing...";
    private Texture2D _colorTexture;
    private byte[] _rgbBuffer;
    private float _lastVideoTimestamp = -1f;

    // Joint names for the 32 Azure Kinect joints
    private static readonly string[] JOINT_NAMES = {
        "Pelvis", "SpineNavel", "SpineChest", "Neck",
        "ClavicleLeft", "ShoulderLeft", "ElbowLeft", "WristLeft",
        "HandLeft", "HandTipLeft", "ThumbLeft",
        "ClavicleRight", "ShoulderRight", "ElbowRight", "WristRight",
        "HandRight", "HandTipRight", "ThumbRight",
        "HipLeft", "KneeLeft", "AnkleLeft", "FootLeft",
        "HipRight", "KneeRight", "AnkleRight", "FootRight",
        "Head", "Nose", "EyeLeft", "EarLeft", "EyeRight", "EarRight"
    };

    void Start()
    {
        _sendInterval = 1f / targetFPS;
        _videoInterval = 1f / videoFPS;
        _cts = new CancellationTokenSource();

        // Find the 'main' MonoBehaviour from the Microsoft sample — it owns the
        // tracking provider and exposes m_lastFrameData publicly.
        _mainController = FindObjectOfType<main>();
        if (_mainController == null)
        {
            Debug.LogError("[KinectStreamer] No 'main' MonoBehaviour found in scene. " +
                "Add the Microsoft sample's Main GameObject (with main.cs attached and " +
                "Kinect4AzureTracker assigned to its Tracker slot).");
        }
        else
        {
            Debug.Log("[KinectStreamer] Found main controller — reading frame data via its m_lastFrameData.");
        }

        ConnectAsync();
    }

    async void ConnectAsync()
    {
        try
        {
            _connectionStatus = "Connecting...";
            _ws = new ClientWebSocket();
            await _ws.ConnectAsync(new Uri(relayServerUrl), _cts.Token);
            _connected = true;
            _connectionStatus = "CONNECTED";

            var handshake = JsonConvert.SerializeObject(new
            {
                type = "handshake",
                role = "stage_tracker",
                token = authToken,
            });
            var bytes = Encoding.UTF8.GetBytes(handshake);
            await _ws.SendAsync(new ArraySegment<byte>(bytes),
                WebSocketMessageType.Text, true, _cts.Token);

            if (showDebugLog) Debug.Log("[KinectStreamer] Connected to relay as stage_tracker!");

            _ = SendPumpAsync();
            _ = ReceiveLoopAsync();
        }
        catch (Exception ex)
        {
            _connectionStatus = $"Failed: {ex.Message}";
            Debug.LogError($"[KinectStreamer] Connect failed: {ex.Message}");
        }
    }

    async Task SendPumpAsync()
    {
        while (_connected && _ws != null && _ws.State == WebSocketState.Open)
        {
            string msg = null;
            lock (_sendQueue)
            {
                if (_sendQueue.Count > 0) msg = _sendQueue.Dequeue();
            }

            if (msg != null)
            {
                try
                {
                    var bytes = Encoding.UTF8.GetBytes(msg);
                    await _ws.SendAsync(new ArraySegment<byte>(bytes),
                        WebSocketMessageType.Text, true, _cts.Token);
                }
                catch (Exception ex)
                {
                    Debug.LogError($"[KinectStreamer] Send error: {ex.Message}");
                    _connected = false;
                    break;
                }
            }
            else
            {
                await Task.Delay(1, _cts.Token);
            }
        }
    }

    async Task ReceiveLoopAsync()
    {
        var buffer = new byte[4096];
        try
        {
            while (_ws != null && _ws.State == WebSocketState.Open)
            {
                var result = await _ws.ReceiveAsync(
                    new ArraySegment<byte>(buffer), _cts.Token);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    _connected = false;
                    break;
                }
            }
        }
        catch { }
    }

    void Update()
    {
        if (!_connected || _mainController == null) return;
        if (Time.time - _lastSendTime < _sendInterval) return;
        _lastSendTime = Time.time;
        _frameCounter++;

        SendAllBodies();

        if (streamColorVideo && Time.time - _lastVideoSendTime >= _videoInterval)
        {
            _lastVideoSendTime = Time.time;
            SendColorVideoFrame();
        }
    }

    /// <summary>
    /// Read ALL tracked bodies from BackgroundDataProvider and stream them.
    /// Each body gets an actor ID so the Quest can visualize multiple actors.
    /// </summary>
    void SendAllBodies()
    {
        // main.cs updates m_lastFrameData every Update; dedupe by timestamp so we don't
        // resend the same frame on idle ticks.
        BackgroundData data = _mainController.m_lastFrameData;
        if (data == null) return;
        if (data.TimestampInMs == _lastSentTimestamp) return;
        _lastSentTimestamp = data.TimestampInMs;
        if (data.NumOfBodies == 0) return;

        var actors = new List<object>();

        for (int bodyIdx = 0; bodyIdx < (int)data.NumOfBodies; bodyIdx++)
        {
            Body body = data.Bodies[bodyIdx];
            var joints = new List<object>();
            var pelvis = body.JointPositions3D[0];

            // Send key joints (skip some minor ones to reduce bandwidth)
            int[] keyJoints = { 0, 1, 2, 3, 5, 6, 7, 8, 12, 13, 14, 15, 18, 19, 20, 21, 22, 23, 24, 25, 26 };

            foreach (int j in keyJoints)
            {
                if (j >= JOINT_NAMES.Length) continue;
                var pos = body.JointPositions3D[j];
                var rootRelative = pos - pelvis;
                var rot = body.JointRotations[j];
                var unityRot = new Quaternion(rot.X, rot.Y, rot.Z, rot.W);
                Vector3 euler = unityRot.eulerAngles;
                joints.Add(new
                {
                    name = JOINT_NAMES[j],
                    index = j,
                    confidence = (int)body.JointPrecisions[j],
                    // Body.CopyFromBodyTrackingSdk already converts Kinect millimeters to meters.
                    // Y is negated to match the sample TrackerHandler's Unity-space convention.
                    position = new
                    {
                        x = pos.X,
                        y = -pos.Y,
                        z = pos.Z
                    },
                    // Alias for tools that expect "translation" instead of "position".
                    translation = new
                    {
                        x = pos.X,
                        y = -pos.Y,
                        z = pos.Z
                    },
                    // Root-relative offset in meters, useful for retarget/debug skeletons.
                    localPosition = new
                    {
                        x = rootRelative.X,
                        y = -rootRelative.Y,
                        z = rootRelative.Z
                    },
                    // Raw Azure Kinect joint orientation quaternion.
                    rotation = new
                    {
                        x = rot.X,
                        y = rot.Y,
                        z = rot.Z,
                        w = rot.W
                    },
                    // Euler degrees for quick visual/debug consumers.
                    rotationEuler = new
                    {
                        x = euler.x,
                        y = euler.y,
                        z = euler.z
                    }
                });
            }

            // Get pelvis position as actor root position
            var pelvisRot = body.JointRotations[0];
            var pelvisUnityRot = new Quaternion(pelvisRot.X, pelvisRot.Y, pelvisRot.Z, pelvisRot.W);
            Vector3 pelvisEuler = pelvisUnityRot.eulerAngles;
            actors.Add(new
            {
                id = bodyIdx,
                bodyId = (int)body.Id,
                name = $"Actor_{bodyIdx}",
                position = new
                {
                    x = pelvis.X,
                    y = -pelvis.Y,
                    z = pelvis.Z
                },
                translation = new
                {
                    x = pelvis.X,
                    y = -pelvis.Y,
                    z = pelvis.Z
                },
                rotation = new
                {
                    x = pelvisRot.X,
                    y = pelvisRot.Y,
                    z = pelvisRot.Z,
                    w = pelvisRot.W
                },
                rotationEuler = new
                {
                    x = pelvisEuler.x,
                    y = pelvisEuler.y,
                    z = pelvisEuler.z
                },
                joints,
            });
        }

        var frame = new
        {
            type = "actor_tracking",
            data = new
            {
                frame = _frameCounter,
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                actorCount = actors.Count,
                actors,
            },
        };

        lock (_sendQueue)
        {
            if (_sendQueue.Count > 2) _sendQueue.Clear();
            _sendQueue.Enqueue(JsonConvert.SerializeObject(frame));
        }

        if (showDebugLog && _frameCounter % 60 == 0)
        {
            Debug.Log($"[KinectStreamer] Streaming {actors.Count} actors, frame {_frameCounter}");
        }
    }

    void SendColorVideoFrame()
    {
        BackgroundData data = _mainController.m_lastFrameData;
        if (data == null) return;
        if (data.ColorImageSize <= 0 || data.ColorImageWidth <= 0 || data.ColorImageHeight <= 0) return;
        if (data.TimestampInMs == _lastVideoTimestamp) return;
        _lastVideoTimestamp = data.TimestampInMs;

        try
        {
            if (_colorTexture == null ||
                _colorTexture.width != data.ColorImageWidth ||
                _colorTexture.height != data.ColorImageHeight)
            {
                _colorTexture = new Texture2D(data.ColorImageWidth, data.ColorImageHeight, TextureFormat.RGB24, false);
                _rgbBuffer = new byte[data.ColorImageWidth * data.ColorImageHeight * 3];
            }

            CopyBgraToRgbFlipped(data.ColorImage, _rgbBuffer, data.ColorImageWidth, data.ColorImageHeight);
            _colorTexture.LoadRawTextureData(_rgbBuffer);
            _colorTexture.Apply(false);

            byte[] jpegBytes = _colorTexture.EncodeToJPG(jpegQuality);
            string base64 = Convert.ToBase64String(jpegBytes);
            _videoFrameCounter++;

            var frame = new
            {
                type = "kinect_video",
                data = new
                {
                    frame = _videoFrameCounter,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    width = data.ColorImageWidth,
                    height = data.ColorImageHeight,
                    mimeType = "image/jpeg",
                    imageBase64 = base64,
                },
            };

            lock (_sendQueue)
            {
                if (_sendQueue.Count > 4) _sendQueue.Clear();
                _sendQueue.Enqueue(JsonConvert.SerializeObject(frame));
            }

            if (showDebugLog && _videoFrameCounter % 30 == 0)
            {
                Debug.Log($"[KinectStreamer] Streaming color video frame {_videoFrameCounter} ({jpegBytes.Length / 1024} KB JPEG)");
            }
        }
        catch (Exception ex)
        {
            Debug.LogWarning($"[KinectStreamer] Color video encode failed: {ex.Message}");
        }
    }

    static void CopyBgraToRgbFlipped(byte[] bgra, byte[] rgb, int width, int height)
    {
        int rowBytesBgra = width * 4;
        int rowBytesRgb = width * 3;
        for (int y = 0; y < height; y++)
        {
            int sourceRow = y * rowBytesBgra;
            int destRow = (height - 1 - y) * rowBytesRgb;
            for (int x = 0; x < width; x++)
            {
                int source = sourceRow + x * 4;
                int dest = destRow + x * 3;
                rgb[dest] = bgra[source + 2];
                rgb[dest + 1] = bgra[source + 1];
                rgb[dest + 2] = bgra[source];
            }
        }
    }

    void OnGUI()
    {
        if (!showDebugLog) return;
        string status = _connected ? "CONNECTED" : _connectionStatus;
        int bodies = 0;
        if (_mainController != null && _mainController.m_lastFrameData != null)
        {
            bodies = (int)_mainController.m_lastFrameData.NumOfBodies;
        }
        GUI.Label(new Rect(10, 10, 400, 25), $"[KinectStreamer] WS: {status} | Bodies: {bodies} | Frames: {_frameCounter}");
    }

    void OnDestroy()
    {
        _connected = false;
        _cts?.Cancel();
        if (_ws != null && _ws.State == WebSocketState.Open)
            _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Goodbye", CancellationToken.None);
        _ws?.Dispose();
        _cts?.Dispose();
        if (_colorTexture != null) Destroy(_colorTexture);
    }
}
#endif
