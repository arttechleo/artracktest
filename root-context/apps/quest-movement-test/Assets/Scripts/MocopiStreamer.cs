using System;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using Newtonsoft.Json;
using Mocopi.Receiver;

/// <summary>
/// ROOT Theater - Mocopi Body Streamer
///
/// Reads Mocopi skeleton data from MocopiAvatar components in the scene
/// and streams actor positions to the relay server.
/// Works on Mac AND Windows.
///
/// Setup:
/// 1. Import Mocopi Receiver Plugin into Unity
/// 2. Add MocopiSimpleReceiver prefab to scene
/// 3. Add a humanoid avatar with MocopiAvatar component
/// 4. Add this MocopiStreamer to any GameObject
/// 5. In the Mocopi iPhone app: set destination IP to this PC's IP, port 12351
/// 6. Hit Play, start streaming from Mocopi app
/// </summary>
public class MocopiStreamer : MonoBehaviour
{
    [Header("Network")]
    public string relayServerUrl = "wss://root-relay.onrender.com";
    public string authToken = "root-theater-2026";

    [Header("Streaming")]
    [Range(10, 30)]
    public int targetFPS = 15;

    [Header("Actor Identity")]
    [Tooltip("Name shown on Quest for this actor")]
    public string actorName = "Actor_Mocopi";
    public int actorId = 0;

    [Header("Debug")]
    public bool showDebugLog = true;

    // WebSocket
    private ClientWebSocket _ws;
    private CancellationTokenSource _cts;
    private bool _connected;
    private float _sendInterval;
    private float _lastSendTime;
    private int _frameCounter;
    private readonly Queue<string> _sendQueue = new Queue<string>();
    private string _connectionStatus = "Initializing...";

    // Mocopi avatar reference
    private MocopiAvatar[] _mocopiAvatars;

    // Mocopi bone names mapped to standard names
    private static readonly Dictionary<HumanBodyBones, string> BONE_NAMES = new Dictionary<HumanBodyBones, string>
    {
        { HumanBodyBones.Hips, "Hips" },
        { HumanBodyBones.Spine, "Spine" },
        { HumanBodyBones.Chest, "Chest" },
        { HumanBodyBones.Neck, "Neck" },
        { HumanBodyBones.Head, "Head" },
        { HumanBodyBones.LeftShoulder, "LeftShoulder" },
        { HumanBodyBones.LeftUpperArm, "LeftUpperArm" },
        { HumanBodyBones.LeftLowerArm, "LeftLowerArm" },
        { HumanBodyBones.LeftHand, "LeftHand" },
        { HumanBodyBones.RightShoulder, "RightShoulder" },
        { HumanBodyBones.RightUpperArm, "RightUpperArm" },
        { HumanBodyBones.RightLowerArm, "RightLowerArm" },
        { HumanBodyBones.RightHand, "RightHand" },
        { HumanBodyBones.LeftUpperLeg, "LeftUpperLeg" },
        { HumanBodyBones.LeftLowerLeg, "LeftLowerLeg" },
        { HumanBodyBones.LeftFoot, "LeftFoot" },
        { HumanBodyBones.RightUpperLeg, "RightUpperLeg" },
        { HumanBodyBones.RightLowerLeg, "RightLowerLeg" },
        { HumanBodyBones.RightFoot, "RightFoot" },
    };

    void Start()
    {
        _sendInterval = 1f / targetFPS;
        _cts = new CancellationTokenSource();

        // Find all MocopiAvatar components (one per tracked person)
        _mocopiAvatars = FindObjectsOfType<MocopiAvatar>();
        if (_mocopiAvatars.Length == 0)
        {
            Debug.LogWarning("[MocopiStreamer] No MocopiAvatar found in scene!");
        }
        else
        {
            Debug.Log($"[MocopiStreamer] Found {_mocopiAvatars.Length} MocopiAvatar(s)");
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

            if (showDebugLog) Debug.Log("[MocopiStreamer] Connected to relay as stage_tracker!");

            _ = SendPumpAsync();
        }
        catch (Exception ex)
        {
            _connectionStatus = $"Failed: {ex.Message}";
            Debug.LogError($"[MocopiStreamer] Connect failed: {ex.Message}");
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
                    Debug.LogError($"[MocopiStreamer] Send error: {ex.Message}");
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

    void Update()
    {
        if (!_connected) return;
        if (Time.time - _lastSendTime < _sendInterval) return;
        _lastSendTime = Time.time;
        _frameCounter++;

        // Re-find avatars periodically in case they're added at runtime
        if (_frameCounter % 300 == 0)
        {
            _mocopiAvatars = FindObjectsOfType<MocopiAvatar>();
        }

        SendMocopiBodies();
    }

    void SendMocopiBodies()
    {
        if (_mocopiAvatars == null || _mocopiAvatars.Length == 0) return;

        var actors = new List<object>();

        for (int i = 0; i < _mocopiAvatars.Length; i++)
        {
            var avatar = _mocopiAvatars[i];
            if (avatar == null) continue;

            // Get the Animator from MocopiAvatar (it has a built-in Animator property)
            var animator = avatar.Animator ?? avatar.GetComponent<Animator>();
            if (animator == null || !animator.isHuman) continue;

            var joints = new List<object>();

            foreach (var kvp in BONE_NAMES)
            {
                Transform bone = animator.GetBoneTransform(kvp.Key);
                if (bone == null) continue;

                joints.Add(new
                {
                    name = kvp.Value,
                    position = new
                    {
                        x = bone.position.x,
                        y = bone.position.y,
                        z = bone.position.z
                    },
                });
            }

            if (joints.Count == 0) continue;

            // Get hips as root position
            Transform hips = animator.GetBoneTransform(HumanBodyBones.Hips);
            Vector3 rootPos = hips != null ? hips.position : avatar.transform.position;

            actors.Add(new
            {
                id = actorId + i,
                name = _mocopiAvatars.Length == 1 ? actorName : $"{actorName}_{i}",
                position = new
                {
                    x = rootPos.x,
                    y = rootPos.y,
                    z = rootPos.z
                },
                joints,
            });
        }

        if (actors.Count == 0) return;

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
            Debug.Log($"[MocopiStreamer] Streaming {actors.Count} mocopi actor(s), frame {_frameCounter}");
        }
    }

    void OnGUI()
    {
        if (!showDebugLog) return;
        int avatarCount = _mocopiAvatars?.Length ?? 0;
        GUI.Label(new Rect(10, 35, 500, 25),
            $"[MocopiStreamer] WS: {_connectionStatus} | Avatars: {avatarCount} | Frames: {_frameCounter}");
    }

    void OnDestroy()
    {
        _connected = false;
        _cts?.Cancel();
        if (_ws != null && _ws.State == WebSocketState.Open)
            _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Goodbye", CancellationToken.None);
        _ws?.Dispose();
        _cts?.Dispose();
    }
}
