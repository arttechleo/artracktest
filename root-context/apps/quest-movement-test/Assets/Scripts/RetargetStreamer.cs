#if UNITY_ANDROID || UNITY_EDITOR_OSX
using System;
using System.Collections;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Meta.XR.Movement.Retargeting;

/// <summary>
/// ROOT Theater - Retarget Streamer (Movement SDK Test Build)
///
/// Uses System.Net.WebSockets.ClientWebSocket (built into .NET).
/// Streams retargeted bone data from Quest 3 to relay server.
/// </summary>
[DefaultExecutionOrder(200)]
public class RetargetStreamer : MonoBehaviour
{
    [Header("Network")]
    [Tooltip("WebSocket URL of the relay server (use ngrok wss:// URL for phone testing)")]
    public string relayServerUrl = "wss://root-relay.onrender.com";

    [Tooltip("Auth token (must match relay server config)")]
    public string authToken = "root-theater-2026";

    [Header("Streaming")]
    [Range(10, 60)]
    public int targetFPS = 30;

    [Header("Voice Detection")]
    public bool enableVoiceDetection = true;

    [Header("Debug")]
    public bool showDebugHUD = true;
    public bool logBoneData = false;

    [Header("HUD (assign in Inspector)")]
    [Tooltip("Drag a TextMeshProUGUI here for the HUD. If empty, falls back to code-generated TextMesh.")]
    public TMPro.TextMeshProUGUI hudText;


    // Auto-discovered references
    private CharacterRetargeter _retargeter;
    private Animator _animator;
    private Transform[] _trackedBones;
    private string[] _boneNames;
    private bool _bonesCached;

    // WebSocket (System.Net.WebSockets)
    private ClientWebSocket _ws;
    private CancellationTokenSource _cts;
    private bool _connected;
    private float _sendInterval;
    private float _lastSendTime;
    private int _frameCounter;
    private int _sentCount;
    private string _connectionStatus = "Initializing...";
    private bool _reconnecting;
    private float _lastHeartbeatTime;

    // Thread-safe send queue — serializes all sends to avoid concurrent SendAsync
    private readonly Queue<string> _sendQueue = new Queue<string>();
    private bool _isSending;

    // Voice
    private AudioClip _micClip;
    private float[] _micSamples;
    private float _currentVolume;
    private const int MIC_RATE = 16000;
    private const int MIC_WINDOW = 128;

    // Phoneme-driven lip sync (Movement SDK face tracking with audio-driven visemes on Quest 3).
    // OVRFaceExpressions exposes 15 viseme weights (SIL/PP/FF/.../OU) that update each frame
    // when AreVisemesValid is true. We sample and stream them to the audience via WebSocket.
    [Header("Lip Sync (Phoneme)")]
    [Tooltip("Stream viseme weights from OVRFaceExpressions to the audience (drives mouth shapes).")]
    public bool enableLipSync = true;
    [Range(15, 60)]
    public int lipSyncTargetFPS = 30;
    private OVRFaceExpressions _faceExpressions;
    private float _lastLipSyncSent;
    // Order MUST match OVRFaceExpressions.FaceViseme enum (skipping Invalid)
    private static readonly string[] VISEME_NAMES = {
        "SIL", "PP", "FF", "TH", "DD", "KK", "CH", "SS",
        "NN", "RR", "AA", "E", "IH", "OH", "OU"
    };

    // Calibration
    private bool _calibrated;
    private float _calibrationCountdown = -1f;
    private const float CALIBRATION_DELAY = 3f;

    // VR Debug HUD
    private GameObject _hudGO;
    private TextMesh _hudTextMesh;
    private string _debugLog = "";
    private ActorVisualizer _actorVisualizer;
    private KinectVideoPanel _kinectVideoPanel;

    // Standard humanoid bone names that the WebAR app expects
    private static readonly HumanBodyBones[] TRACKED_BONES = new[]
    {
        HumanBodyBones.Hips,
        HumanBodyBones.Spine,
        HumanBodyBones.Chest,
        HumanBodyBones.UpperChest,
        HumanBodyBones.Neck,
        HumanBodyBones.Head,

        HumanBodyBones.LeftShoulder,
        HumanBodyBones.LeftUpperArm,
        HumanBodyBones.LeftLowerArm,
        HumanBodyBones.LeftHand,

        HumanBodyBones.RightShoulder,
        HumanBodyBones.RightUpperArm,
        HumanBodyBones.RightLowerArm,
        HumanBodyBones.RightHand,

        HumanBodyBones.LeftUpperLeg,
        HumanBodyBones.LeftLowerLeg,
        HumanBodyBones.LeftFoot,
        HumanBodyBones.LeftToes,

        HumanBodyBones.RightUpperLeg,
        HumanBodyBones.RightLowerLeg,
        HumanBodyBones.RightFoot,
        HumanBodyBones.RightToes,

        // Fingers - left hand
        HumanBodyBones.LeftThumbProximal,
        HumanBodyBones.LeftThumbIntermediate,
        HumanBodyBones.LeftThumbDistal,
        HumanBodyBones.LeftIndexProximal,
        HumanBodyBones.LeftIndexIntermediate,
        HumanBodyBones.LeftIndexDistal,
        HumanBodyBones.LeftMiddleProximal,
        HumanBodyBones.LeftMiddleIntermediate,
        HumanBodyBones.LeftMiddleDistal,
        HumanBodyBones.LeftRingProximal,
        HumanBodyBones.LeftRingIntermediate,
        HumanBodyBones.LeftRingDistal,
        HumanBodyBones.LeftLittleProximal,
        HumanBodyBones.LeftLittleIntermediate,
        HumanBodyBones.LeftLittleDistal,

        // Fingers - right hand
        HumanBodyBones.RightThumbProximal,
        HumanBodyBones.RightThumbIntermediate,
        HumanBodyBones.RightThumbDistal,
        HumanBodyBones.RightIndexProximal,
        HumanBodyBones.RightIndexIntermediate,
        HumanBodyBones.RightIndexDistal,
        HumanBodyBones.RightMiddleProximal,
        HumanBodyBones.RightMiddleIntermediate,
        HumanBodyBones.RightMiddleDistal,
        HumanBodyBones.RightRingProximal,
        HumanBodyBones.RightRingIntermediate,
        HumanBodyBones.RightRingDistal,
        HumanBodyBones.RightLittleProximal,
        HumanBodyBones.RightLittleIntermediate,
        HumanBodyBones.RightLittleDistal,
    };

    // HumanBodyBones -> WebAR bone name mapping (Mixamo/RPM standard names)
    private static readonly Dictionary<HumanBodyBones, string> BONE_TO_NAME = new()
    {
        { HumanBodyBones.Hips, "Hips" },
        { HumanBodyBones.Spine, "Spine" },
        { HumanBodyBones.Chest, "Spine1" },
        { HumanBodyBones.UpperChest, "Spine2" },
        { HumanBodyBones.Neck, "Neck" },
        { HumanBodyBones.Head, "Head" },

        { HumanBodyBones.LeftShoulder, "LeftShoulder" },
        { HumanBodyBones.LeftUpperArm, "LeftArm" },
        { HumanBodyBones.LeftLowerArm, "LeftForeArm" },
        { HumanBodyBones.LeftHand, "LeftHand" },

        { HumanBodyBones.RightShoulder, "RightShoulder" },
        { HumanBodyBones.RightUpperArm, "RightArm" },
        { HumanBodyBones.RightLowerArm, "RightForeArm" },
        { HumanBodyBones.RightHand, "RightHand" },

        { HumanBodyBones.LeftUpperLeg, "LeftUpLeg" },
        { HumanBodyBones.LeftLowerLeg, "LeftLeg" },
        { HumanBodyBones.LeftFoot, "LeftFoot" },
        { HumanBodyBones.LeftToes, "LeftToeBase" },

        { HumanBodyBones.RightUpperLeg, "RightUpLeg" },
        { HumanBodyBones.RightLowerLeg, "RightLeg" },
        { HumanBodyBones.RightFoot, "RightFoot" },
        { HumanBodyBones.RightToes, "RightToeBase" },

        { HumanBodyBones.LeftThumbProximal, "LeftHandThumb1" },
        { HumanBodyBones.LeftThumbIntermediate, "LeftHandThumb2" },
        { HumanBodyBones.LeftThumbDistal, "LeftHandThumb3" },
        { HumanBodyBones.LeftIndexProximal, "LeftHandIndex1" },
        { HumanBodyBones.LeftIndexIntermediate, "LeftHandIndex2" },
        { HumanBodyBones.LeftIndexDistal, "LeftHandIndex3" },
        { HumanBodyBones.LeftMiddleProximal, "LeftHandMiddle1" },
        { HumanBodyBones.LeftMiddleIntermediate, "LeftHandMiddle2" },
        { HumanBodyBones.LeftMiddleDistal, "LeftHandMiddle3" },
        { HumanBodyBones.LeftRingProximal, "LeftHandRing1" },
        { HumanBodyBones.LeftRingIntermediate, "LeftHandRing2" },
        { HumanBodyBones.LeftRingDistal, "LeftHandRing3" },
        { HumanBodyBones.LeftLittleProximal, "LeftHandPinky1" },
        { HumanBodyBones.LeftLittleIntermediate, "LeftHandPinky2" },
        { HumanBodyBones.LeftLittleDistal, "LeftHandPinky3" },

        { HumanBodyBones.RightThumbProximal, "RightHandThumb1" },
        { HumanBodyBones.RightThumbIntermediate, "RightHandThumb2" },
        { HumanBodyBones.RightThumbDistal, "RightHandThumb3" },
        { HumanBodyBones.RightIndexProximal, "RightHandIndex1" },
        { HumanBodyBones.RightIndexIntermediate, "RightHandIndex2" },
        { HumanBodyBones.RightIndexDistal, "RightHandIndex3" },
        { HumanBodyBones.RightMiddleProximal, "RightHandMiddle1" },
        { HumanBodyBones.RightMiddleIntermediate, "RightHandMiddle2" },
        { HumanBodyBones.RightMiddleDistal, "RightHandMiddle3" },
        { HumanBodyBones.RightRingProximal, "RightHandRing1" },
        { HumanBodyBones.RightRingIntermediate, "RightHandRing2" },
        { HumanBodyBones.RightRingDistal, "RightHandRing3" },
        { HumanBodyBones.RightLittleProximal, "RightHandPinky1" },
        { HumanBodyBones.RightLittleIntermediate, "RightHandPinky2" },
        { HumanBodyBones.RightLittleDistal, "RightHandPinky3" },
    };

    void Start()
    {
        _sendInterval = 1f / targetFPS;
        _cts = new CancellationTokenSource();

        Log("RetargetStreamer starting...");

        // Create VR-compatible debug HUD
        if (showDebugHUD)
            CreateVRHUD();

        // Find CharacterRetargeter and Animator
        FindComponents();

        // Try caching bones (may need to retry later if avatar not ready)
        CacheBones();

        // Connect WebSocket
        ConnectWebSocketAsync();

        // Start microphone for voice detection
        if (enableVoiceDetection && Microphone.devices.Length > 0)
        {
            _micClip = Microphone.Start(null, true, 1, MIC_RATE);
            _micSamples = new float[MIC_WINDOW];
            Log($"Mic: {Microphone.devices[0]}");
        }
        else if (enableVoiceDetection)
        {
            Log("No microphone found");
        }

        // Lip sync setup: find or auto-add OVRFaceExpressions.
        // On Quest 3, this uses audio-driven visemes (mic audio → phoneme weights)
        // even without face cameras.
        if (enableLipSync)
        {
            _faceExpressions = FindObjectOfType<OVRFaceExpressions>();
            if (_faceExpressions == null)
            {
                // Add it on this GameObject as a fallback so lip sync still works
                _faceExpressions = gameObject.AddComponent<OVRFaceExpressions>();
                Log("Auto-added OVRFaceExpressions (consider adding it on an OVRCameraRig in scene)");
            }
            else
            {
                Log($"Found OVRFaceExpressions on '{_faceExpressions.gameObject.name}'");
            }
        }
    }

    void FindComponents()
    {
        _retargeter = GetComponent<CharacterRetargeter>()
                      ?? GetComponentInParent<CharacterRetargeter>()
                      ?? GetComponentInChildren<CharacterRetargeter>()
                      ?? FindObjectOfType<CharacterRetargeter>();

        _animator = GetComponent<Animator>()
                    ?? GetComponentInParent<Animator>()
                    ?? GetComponentInChildren<Animator>();

        if (_retargeter != null)
            Log($"Retargeter: {_retargeter.gameObject.name}");
        else
            Log("ERROR: No CharacterRetargeter!");

        if (_animator != null)
        {
            Log($"Animator: {_animator.gameObject.name}");
            Log($"IsHuman: {_animator.isHuman}, Avatar: {(_animator.avatar != null ? _animator.avatar.name : "NULL")}");
        }
        else
            Log("ERROR: No Animator!");
    }

    void CacheBones()
    {
        if (_animator == null) return;

        if (!_animator.isHuman)
        {
            Log($"Avatar NOT humanoid!");
            return;
        }

        var boneList = new List<Transform>();
        var nameList = new List<string>();

        foreach (var humanBone in TRACKED_BONES)
        {
            Transform t = _animator.GetBoneTransform(humanBone);
            if (t != null && BONE_TO_NAME.TryGetValue(humanBone, out string name))
            {
                boneList.Add(t);
                nameList.Add(name);
            }
        }

        _trackedBones = boneList.ToArray();
        _boneNames = nameList.ToArray();
        _bonesCached = _trackedBones.Length > 0;

        Log($"Bones cached: {_trackedBones.Length}");
    }

    /// <summary>
    /// TextMesh-based HUD for VR (OnGUI doesn't work in XR mode).
    /// </summary>
    void CreateVRHUD()
    {
        _hudGO = new GameObject("ROOT_DebugHUD");
        DontDestroyOnLoad(_hudGO);

        _hudTextMesh = _hudGO.AddComponent<TextMesh>();
        _hudTextMesh.fontSize = 100;
        _hudTextMesh.characterSize = 0.006f;
        _hudTextMesh.anchor = TextAnchor.UpperLeft;
        _hudTextMesh.alignment = TextAlignment.Left;
        _hudTextMesh.color = Color.white;
        _hudTextMesh.fontStyle = FontStyle.Bold;
        _hudTextMesh.text = "ROOT: Starting...";

        var renderer = _hudGO.GetComponent<MeshRenderer>();
        renderer.material = new Material(Shader.Find("GUI/Text Shader"));

        Log("HUD ready");
    }

    void UpdateVRHUD()
    {
        string statusText = _connected ? "CONNECTED" : _connectionStatus;
        string boneInfo = _bonesCached ? $"{_trackedBones.Length}" : "0";
        string calibStatus = _calibrated ? "YES" :
            (_calibrationCountdown > 0 ? $"in {_calibrationCountdown:F1}s" : "NO");
        string actorStatus = _actorVisualizer != null
            ? _actorVisualizer.GetStatusText()
            : "Kinect actors: no visualizer";
        string videoStatus = _kinectVideoPanel != null
            ? _kinectVideoPanel.GetStatusText()
            : "Kinect video: no panel";

        string text =
            $"ROOT Movement Test\n" +
            $"WS: {statusText}\n" +
            $"Calibrated: {calibStatus}\n" +
            $"Bones: {boneInfo} | Sent: {_sentCount}\n" +
            $"{actorStatus}\n" +
            $"{videoStatus}\n" +
            $"Frame: {_frameCounter} | FPS: {(1f / Time.deltaTime):F0}\n" +
            $"\n{_debugLog}";

        // Use TMP field if assigned, otherwise fall back to code-generated TextMesh
        if (hudText != null)
        {
            hudText.text = text;
            hudText.color = _connected ? Color.green : Color.red;
            return;
        }

        if (_hudTextMesh == null) return;

        Camera cam = Camera.main;
        if (cam != null)
        {
            Transform hudT = _hudGO.transform;
            hudT.position = cam.transform.position
                + cam.transform.forward * 1.8f
                + cam.transform.up * 0.2f
                + cam.transform.right * -0.45f;
            hudT.rotation = cam.transform.rotation;
        }

        _hudTextMesh.color = _connected ? Color.green : Color.red;
        _hudTextMesh.text = text;
    }

    void Log(string msg)
    {
        Debug.Log($"[RetargetStreamer] {msg}");
        var lines = _debugLog.Split('\n');
        if (lines.Length > 5)
            _debugLog = string.Join("\n", lines, 1, lines.Length - 1);
        _debugLog += (string.IsNullOrEmpty(_debugLog) ? "" : "\n") + msg;
    }

    async void ConnectWebSocketAsync()
    {
        try
        {
            _connectionStatus = "Connecting...";
            Log($"Connecting...");

            _ws = new ClientWebSocket();
            await _ws.ConnectAsync(new Uri(relayServerUrl), _cts.Token);

            _connected = true;
            _connectionStatus = "CONNECTED";
            _lastHeartbeatTime = Time.time;
            Log("Connected!");

            // Send handshake directly (not through queue)
            var handshake = JsonConvert.SerializeObject(new
            {
                type = "handshake",
                role = "puppeteer",
                token = authToken,
            });

            var bytes = Encoding.UTF8.GetBytes(handshake);
            await _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, _cts.Token);
            Log("Handshake sent");

            // Start receive loop
            _ = ReceiveLoopAsync();

            // Start the send pump (serializes all sends)
            _ = SendPumpAsync();
        }
        catch (Exception ex)
        {
            _connectionStatus = $"Failed: {ex.Message}";
            Log($"Connect failed: {ex.Message}");
        }
    }

    /// <summary>
    /// Single-threaded send pump that processes the queue one message at a time.
    /// ClientWebSocket does NOT support concurrent SendAsync calls.
    /// </summary>
    async Task SendPumpAsync()
    {
        Log("Send pump started");
        while (_connected && _ws != null && _ws.State == WebSocketState.Open && !_cts.IsCancellationRequested)
        {
            string msg = null;

            // Dequeue on main thread via lock-free check
            lock (_sendQueue)
            {
                if (_sendQueue.Count > 0)
                    msg = _sendQueue.Dequeue();
            }

            if (msg != null)
            {
                _isSending = true;
                try
                {
                    var bytes = Encoding.UTF8.GetBytes(msg);
                    await _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, _cts.Token);
                    _sentCount++;

                    if (_sentCount == 1)
                        Log($"First frame sent! ({bytes.Length} bytes)");
                }
                catch (Exception ex)
                {
                    if (!_cts.IsCancellationRequested)
                    {
                        Log($"Send error: {ex.Message}");
                        _connected = false;
                    }
                    break;
                }
                _isSending = false;
            }
            else
            {
                // No messages — yield briefly to avoid busy spin
                await Task.Delay(1, _cts.Token);
            }
        }
        Log($"Send pump stopped (sent {_sentCount} total)");
    }

    async Task ReceiveLoopAsync()
    {
        var buffer = new byte[32768];
        try
        {
            while (_ws != null && _ws.State == WebSocketState.Open && !_cts.IsCancellationRequested)
            {
                var builder = new StringBuilder();
                WebSocketReceiveResult result;
                do
                {
                    result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), _cts.Token);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        _connected = false;
                        _connectionStatus = "Server closed";
                        Log("Server closed connection");
                        return;
                    }

                    if (result.MessageType == WebSocketMessageType.Text && result.Count > 0)
                    {
                        builder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                    }
                }
                while (!result.EndOfMessage);

                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var msg = builder.ToString();
                    if (msg.Contains("\"welcome\""))
                        Log("Welcome received!");
                    if (logBoneData)
                        Debug.Log($"[RetargetStreamer] Recv: {msg}");

                    // Forward actor tracking data to ActorVisualizer
                    if (TryExtractDataJson(msg, "actor_tracking", out string actorDataJson))
                    {
                        if (_actorVisualizer == null)
                        {
                            _actorVisualizer = FindObjectOfType<ActorVisualizer>();
                        }
                        if (_actorVisualizer == null)
                        {
                            _actorVisualizer = new GameObject("ActorVisualizer").AddComponent<ActorVisualizer>();
                            Log("Created Kinect actor visualizer");
                        }
                        if (_actorVisualizer != null)
                        {
                            _actorVisualizer.UpdateActorPositions(actorDataJson);
                        }
                    }

                    if (TryExtractDataJson(msg, "kinect_video", out string videoDataJson))
                    {
                        if (_kinectVideoPanel == null)
                        {
                            _kinectVideoPanel = FindObjectOfType<KinectVideoPanel>();
                        }
                        if (_kinectVideoPanel == null)
                        {
                            _kinectVideoPanel = new GameObject("KinectVideoPanelReceiver").AddComponent<KinectVideoPanel>();
                            Log("Created Kinect video panel");
                        }
                        if (_kinectVideoPanel != null)
                        {
                            _kinectVideoPanel.UpdateVideoFrame(videoDataJson);
                        }
                    }
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            if (!_cts.IsCancellationRequested)
            {
                _connected = false;
                _connectionStatus = $"Recv error";
                Log($"Recv error: {ex.Message}");
            }
        }
    }

    bool TryExtractDataJson(string message, string expectedType, out string dataJson)
    {
        dataJson = null;
        try
        {
            var root = JObject.Parse(message);
            if ((string)root["type"] != expectedType) return false;
            JToken data = root["data"];
            if (data == null) return false;
            dataJson = data.ToString(Formatting.None);
            return true;
        }
        catch
        {
            return false;
        }
    }

    void Update()
    {
        // Send heartbeat every 20 seconds
        if (_connected && Time.time - _lastHeartbeatTime > 20f)
        {
            _lastHeartbeatTime = Time.time;
            lock (_sendQueue)
            {
                _sendQueue.Enqueue("{\"type\":\"heartbeat\"}");
            }
        }

        // Retry bone caching if not done yet
        if (!_bonesCached)
        {
            FindComponents();
            CacheBones();
        }

        // Auto-calibrate after countdown
        if (_connected && _bonesCached && !_calibrated && _calibrationCountdown < 0)
        {
            _calibrationCountdown = CALIBRATION_DELAY;
            Log($"CALIBRATE in {CALIBRATION_DELAY}s");
        }

        if (_calibrationCountdown > 0)
        {
            _calibrationCountdown -= Time.deltaTime;
            if (_calibrationCountdown <= 0)
            {
                SendCalibration();
            }
        }

        // Reconnect if disconnected
        if (!_connected && !_reconnecting && _ws != null &&
            (_ws.State == WebSocketState.Closed || _ws.State == WebSocketState.Aborted))
        {
            StartCoroutine(Reconnect());
        }

        // Update VR HUD
        if (showDebugHUD)
            UpdateVRHUD();
    }

    IEnumerator Reconnect()
    {
        _reconnecting = true;
        Log("Reconnecting in 3s...");
        yield return new WaitForSeconds(3f);
        if (!_connected)
        {
            try { _ws?.Dispose(); } catch { }
            _cts?.Dispose();
            _cts = new CancellationTokenSource();
            _sentCount = 0;
            ConnectWebSocketAsync();
        }
        _reconnecting = false;
    }

    /// <summary>
    /// LateUpdate runs AFTER CharacterRetargeter has applied body tracking.
    /// [DefaultExecutionOrder(200)] guarantees this.
    /// </summary>
    void LateUpdate()
    {
        if (!_connected || !_bonesCached) return;
        if (_ws == null || _ws.State != WebSocketState.Open) return;
        if (Time.time - _lastSendTime < _sendInterval) return;

        _lastSendTime = Time.time;
        _frameCounter++;

        SendRetargetedFrame();

        if (enableVoiceDetection && _frameCounter % 5 == 0)
            SendVoiceLevel();

        if (enableLipSync)
            SendLipSync();
    }

    void SendRetargetedFrame()
    {
        var bones = new List<object>(_trackedBones.Length);

        for (int i = 0; i < _trackedBones.Length; i++)
        {
            Transform t = _trackedBones[i];
            if (t == null) continue;

            bones.Add(new
            {
                name = _boneNames[i],
                position = new { x = t.localPosition.x, y = t.localPosition.y, z = t.localPosition.z },
                rotation = new { x = t.localRotation.x, y = t.localRotation.y, z = t.localRotation.z, w = t.localRotation.w },
                // World transforms for direct retargeting
                worldPos = new { x = t.position.x, y = t.position.y, z = t.position.z },
                worldRot = new { x = t.rotation.x, y = t.rotation.y, z = t.rotation.z, w = t.rotation.w },
            });
        }

        Transform hips = _animator.GetBoneTransform(HumanBodyBones.Hips);
        Vector3 rootPos = hips != null ? hips.position : transform.position;
        Quaternion rootRot = hips != null ? hips.rotation : transform.rotation;

        var frame = new
        {
            type = "skeleton",
            data = new
            {
                frame = _frameCounter,
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                rootPosition = new { x = rootPos.x, y = rootPos.y, z = rootPos.z },
                rootRotation = new { x = rootRot.x, y = rootRot.y, z = rootRot.z, w = rootRot.w },
                bones,
            },
        };

        lock (_sendQueue)
        {
            // Drop frames if queue is backing up (keep only latest)
            if (_sendQueue.Count > 3)
                _sendQueue.Clear();
            _sendQueue.Enqueue(JsonConvert.SerializeObject(frame));
        }
    }

    /// <summary>
    /// Send calibration data: all bone rest rotations + performer's forward direction.
    /// Call this when performer is in T-pose facing the desired forward direction.
    /// </summary>
    void SendCalibration()
    {
        if (!_connected || !_bonesCached) return;

        var bones = new List<object>(_trackedBones.Length);
        for (int i = 0; i < _trackedBones.Length; i++)
        {
            Transform t = _trackedBones[i];
            if (t == null) continue;
            bones.Add(new
            {
                name = _boneNames[i],
                rotation = new { x = t.localRotation.x, y = t.localRotation.y, z = t.localRotation.z, w = t.localRotation.w },
                position = new { x = t.localPosition.x, y = t.localPosition.y, z = t.localPosition.z },
                worldPos = new { x = t.position.x, y = t.position.y, z = t.position.z },
                worldRot = new { x = t.rotation.x, y = t.rotation.y, z = t.rotation.z, w = t.rotation.w },
            });
        }

        // Performer's forward direction and position in world space
        Transform hips = _animator.GetBoneTransform(HumanBodyBones.Hips);
        Vector3 fwd = hips != null ? hips.forward : transform.forward;
        Vector3 pos = hips != null ? hips.position : transform.position;

        var calibration = new
        {
            type = "calibrate",
            data = new
            {
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                forwardDir = new { x = fwd.x, y = fwd.y, z = fwd.z },
                rootPosition = new { x = pos.x, y = pos.y, z = pos.z },
                bones,
            },
        };

        lock (_sendQueue)
        {
            _sendQueue.Enqueue(JsonConvert.SerializeObject(calibration));
        }

        _calibrated = true;
        Log("Calibration sent!");
    }


    void SendVoiceLevel()
    {
        if (_micClip == null) return;

        int pos = Microphone.GetPosition(null);
        if (pos < MIC_WINDOW) return;

        _micClip.GetData(_micSamples, pos - MIC_WINDOW);
        float sum = 0f;
        foreach (float s in _micSamples) sum += s * s;
        _currentVolume = Mathf.Clamp01(Mathf.Sqrt(sum / MIC_WINDOW) * 10f);

        lock (_sendQueue)
        {
            _sendQueue.Enqueue(JsonConvert.SerializeObject(new
            {
                type = "voice_level",
                data = new { volume = _currentVolume, speaking = _currentVolume > 0.08f },
            }));
        }
    }

    /// <summary>
    /// Stream phoneme viseme weights from OVRFaceExpressions to the audience.
    /// On Quest 3, OVRFaceExpressions provides audio-driven visemes (the Quest
    /// analyzes the mic audio to predict which phoneme is being spoken).
    /// 15 visemes match Meta's standard set: SIL/PP/FF/TH/DD/KK/CH/SS/NN/RR/AA/E/IH/OH/OU.
    /// </summary>
    void SendLipSync()
    {
        if (!_connected || _faceExpressions == null) return;
        if (!_faceExpressions.AreVisemesValid) return;

        // Throttle to lipSyncTargetFPS so we don't flood the WebSocket
        float interval = 1f / Mathf.Max(1, lipSyncTargetFPS);
        if (Time.time - _lastLipSyncSent < interval) return;
        _lastLipSyncSent = Time.time;

        // Read all 15 viseme weights into a name → weight dict
        var visemes = new Dictionary<string, float>(VISEME_NAMES.Length);
        // FaceViseme enum: Invalid = -1, then SIL=0, PP=1, ..., OU=14, Count=15
        for (int i = 0; i < VISEME_NAMES.Length; i++)
        {
            var v = (OVRFaceExpressions.FaceViseme)i;
            if (_faceExpressions.TryGetFaceViseme(v, out float weight))
            {
                visemes[VISEME_NAMES[i]] = weight;
            }
        }

        if (visemes.Count == 0) return;

        lock (_sendQueue)
        {
            _sendQueue.Enqueue(JsonConvert.SerializeObject(new
            {
                type = "lip_sync",
                data = new { visemes },
            }));
        }
    }

    void OnDestroy()
    {
        _connected = false;
        try
        {
            _cts?.Cancel();
            if (_ws != null && _ws.State == WebSocketState.Open)
                _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Goodbye", CancellationToken.None);
            _ws?.Dispose();
        }
        catch { }
        _cts?.Dispose();
        if (enableVoiceDetection) Microphone.End(null);
        if (_hudGO != null) Destroy(_hudGO);
    }
}
#endif
