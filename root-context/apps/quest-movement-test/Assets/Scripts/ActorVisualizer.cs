#if UNITY_ANDROID || UNITY_EDITOR
using System.Collections.Generic;
using UnityEngine;
using Newtonsoft.Json.Linq;

/// <summary>
/// ROOT Theater - Actor Visualizer for Quest 3
///
/// Receives actor positions from the Kinect streamer (via relay)
/// and displays them as glowing markers/silhouettes in VR.
/// The performer (Deidra) can see where actors are on stage.
///
/// Attach this to a GameObject in the Quest MovementBody scene.
/// It listens for actor_tracking messages from the RetargetStreamer's
/// WebSocket connection.
/// </summary>
public class ActorVisualizer : MonoBehaviour
{
    [Header("Visualization")]
    public Color actor1Color = new Color(0.0f, 1.0f, 0.5f, 0.8f); // Green
    public Color actor2Color = new Color(1.0f, 0.5f, 0.0f, 0.8f); // Orange
    public Color actor3Color = new Color(0.4f, 0.7f, 1.0f, 0.8f); // Blue
    [Range(1, 3)]
    public int maxActors = 3;
    public bool showBodyCapsules = false;
    public bool showStickFigures = true;
    [Tooltip("Higher transparent render queue draws later. Keep above KinectVideoPanel so bones remain visible over video.")]
    public int skeletonRenderQueue = 4100;
    public int skeletonSortingOrder = 100;
    public float jointRadius = 0.075f;
    public float boneLineWidth = 0.045f;
    public float markerHeight = 2.0f;
    public float markerRadius = 0.15f;
    public float actorTimeoutSeconds = 1.5f;

    [Header("Stage Alignment")]
    [Tooltip("Use this GameObject transform as the stage/body-double anchor. Move, rotate, and scale the ActorVisualizer object in the scene.")]
    public bool useTransformAsStageAnchor = true;
    [Tooltip("If auto-created at origin, move to the fallback world position so it is visible without manual scene setup.")]
    public bool applyFallbackPlacementWhenAtOrigin = true;
    [Tooltip("Fallback placement used only when this visualizer is auto-created at runtime.")]
    public bool useFixedWorldPlacement = true;
    [Tooltip("Detach this receiver from any camera/player rig parent so streamed actors cannot inherit head tracking.")]
    public bool detachFromParentForWorldPlacement = true;
    public Vector3 worldBoardPosition = new Vector3(0f, 1.25f, 3.5f);
    public Vector3 worldBoardEulerAngles = new Vector3(0f, 180f, 0f);
    public float worldActorSpacing = 0.95f;
    public float cameraDebugDepthScale = 0.02f;
    [Tooltip("1.0 means Kinect meters map to Unity meters. Adjust this if the body double feels too large or too small.")]
    public float skeletonScale = 1f;
    [Tooltip("Flatten depth for a readable debug card. Leave off for a 1:1 body-double/stage stand-in.")]
    public bool flattenSkeletonDepth = false;
    [Tooltip("Ignore Kinect actor depth and lay multiple actors side-by-side. Leave off for 1:1 stage placement.")]
    public bool useDebugActorSlots = false;
    public Vector3 kinectOriginOffset = Vector3.zero;
    public float kinectYawDegrees = 0f;
    public float kinectScale = 1f;

    [Header("Labels")]
    public string actor1Name = "Eris";
    public string actor2Name = "Officiant";
    public string actor3Name = "Actor 3";

    [Header("Bone Debug")]
    public bool showBoneDebugText = true;
    public Vector3 debugTextWorldOffset = new Vector3(-1.35f, 0.95f, 0f);

    // Actor visualization objects
    private Dictionary<int, ActorMarker> _markers = new Dictionary<int, ActorMarker>();
    private int _lastActorCount;
    private int _lastFrame;
    private int _lastTotalJoints;
    private string _lastJointSample = "none";
    private float _lastFrameRealtime = -999f;
    private TextMesh _boneDebugText;
    private readonly Dictionary<string, Material> _colorMaterials = new Dictionary<string, Material>();

    private class ActorMarker
    {
        public GameObject root;
        public GameObject body;     // Capsule for body
        public GameObject head;     // Sphere for head
        public GameObject label;    // Floating name
        public TextMesh labelText;
        public Vector3 targetPosition;
        public Vector3 targetLocalPosition;
        public Vector3 lastKinectPosition;
        public Quaternion targetRotation = Quaternion.identity;
        public Dictionary<string, Transform> joints = new Dictionary<string, Transform>();
        public List<Transform> bones = new List<Transform>();
        public Color color;
        public float lastSeenTime;
        public bool active;
    }

    void Start()
    {
        if (useTransformAsStageAnchor && applyFallbackPlacementWhenAtOrigin &&
            transform.position == Vector3.zero && transform.rotation == Quaternion.identity)
        {
            transform.SetPositionAndRotation(worldBoardPosition, GetBoardRotation());
        }

        if (!useTransformAsStageAnchor && useFixedWorldPlacement && detachFromParentForWorldPlacement && transform.parent != null)
        {
            transform.SetParent(null, true);
        }

        // Pre-create markers for up to 3 actors.
        CreateMarker(0, actor1Name, actor1Color);
        CreateMarker(1, actor2Name, actor2Color);
        CreateMarker(2, actor3Name, actor3Color);

        if (showBoneDebugText)
        {
            CreateBoneDebugText();
        }

        // Register to receive actor tracking data
        // This will be called by RetargetStreamer when it receives actor_tracking messages
    }

    void CreateMarker(int id, string actorName, Color color)
    {
        var marker = new ActorMarker();

        // Root object
        marker.root = new GameObject($"ActorMarker_{actorName}");
        marker.root.transform.SetParent(transform);
        marker.root.transform.localRotation = Quaternion.identity;
        marker.root.SetActive(false);

        // Body capsule (translucent)
        marker.body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
        marker.body.transform.SetParent(marker.root.transform);
        marker.body.transform.localScale = new Vector3(markerRadius * 2, markerHeight / 2, markerRadius * 2);
        marker.body.transform.localPosition = new Vector3(0, markerHeight / 2, 0);
        ApplyPrimitiveColor(marker.body.GetComponent<Renderer>(), new Color(color.r, color.g, color.b, 0.55f));
        Destroy(marker.body.GetComponent<Collider>());
        marker.body.SetActive(showBodyCapsules);

        // Head sphere
        marker.head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        marker.head.transform.SetParent(marker.root.transform);
        marker.head.transform.localScale = Vector3.one * markerRadius * 2.5f;
        marker.head.transform.localPosition = new Vector3(0, markerHeight, 0);
        ApplyPrimitiveColor(marker.head.GetComponent<Renderer>(), new Color(color.r, color.g, color.b, 0.8f));
        Destroy(marker.head.GetComponent<Collider>());
        marker.head.SetActive(showBodyCapsules);

        // Name label
        marker.label = new GameObject($"Label_{actorName}");
        marker.label.transform.SetParent(marker.root.transform);
        marker.label.transform.localPosition = new Vector3(0, markerHeight + 0.3f, 0);
        marker.labelText = marker.label.AddComponent<TextMesh>();
        marker.labelText.text = actorName;
        marker.labelText.fontSize = 80;
        marker.labelText.characterSize = 0.02f;
        marker.labelText.anchor = TextAnchor.MiddleCenter;
        marker.labelText.alignment = TextAlignment.Center;
        marker.labelText.color = color;
        marker.labelText.fontStyle = FontStyle.Bold;

        marker.targetPosition = Vector3.zero;
        marker.color = color;
        marker.active = false;
        CreateStickFigure(marker, color);

        _markers[id] = marker;
    }

    void CreateBoneDebugText()
    {
        var go = new GameObject("KinectBoneDebugText");
        go.transform.SetParent(transform);
        go.transform.localPosition = debugTextWorldOffset;
        go.transform.localRotation = Quaternion.identity;
        _boneDebugText = go.AddComponent<TextMesh>();
        _boneDebugText.fontSize = 74;
        _boneDebugText.characterSize = 0.0065f;
        _boneDebugText.anchor = TextAnchor.UpperLeft;
        _boneDebugText.alignment = TextAlignment.Left;
        _boneDebugText.color = Color.yellow;
        _boneDebugText.text = "Kinect bone debug: waiting";
    }

    void CreateStickFigure(ActorMarker marker, Color color)
    {
        foreach (string jointName in KEY_JOINTS)
        {
            var joint = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            joint.name = $"Joint_{jointName}";
            joint.transform.SetParent(marker.root.transform);
            joint.transform.localScale = Vector3.one * jointRadius;
            ApplyPrimitiveColor(joint.GetComponent<Renderer>(), new Color(color.r, color.g, color.b, 1f));
            Destroy(joint.GetComponent<Collider>());
            marker.joints[jointName] = joint.transform;
            joint.SetActive(showStickFigures);
        }

        foreach (var pair in BONE_PAIRS)
        {
            var boneGO = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            boneGO.name = $"Bone_{pair.a}_{pair.b}";
            boneGO.transform.SetParent(marker.root.transform);
            Destroy(boneGO.GetComponent<Collider>());
            ApplyPrimitiveColor(boneGO.GetComponent<Renderer>(), new Color(color.r, color.g, color.b, 1f));
            boneGO.SetActive(false);
            marker.bones.Add(boneGO.transform);
        }
    }

    void ApplyPrimitiveColor(Renderer renderer, Color color)
    {
        if (renderer == null) return;

        renderer.sharedMaterial = GetOrCreateColorMaterial(color);
        renderer.sortingOrder = skeletonSortingOrder;
    }

    Material GetOrCreateColorMaterial(Color color)
    {
        string key = ColorUtility.ToHtmlStringRGBA(color);
        if (_colorMaterials.TryGetValue(key, out Material existing) && existing != null)
        {
            return existing;
        }

        Shader shader = Shader.Find("ROOT/XRUnlitColor")
            ?? Shader.Find("Unlit/Color")
            ?? Shader.Find("Sprites/Default");

        var material = new Material(shader)
        {
            color = color
        };

        if (material.HasProperty("_Color"))
        {
            material.SetColor("_Color", color);
        }

        material.renderQueue = skeletonRenderQueue;
        _colorMaterials[key] = material;
        return material;
    }

    /// <summary>
    /// Called by RetargetStreamer when actor_tracking data arrives.
    /// </summary>
    public void UpdateActorPositions(string jsonData)
    {
        try
        {
            JObject data = JObject.Parse(jsonData);
            JArray actors = data["actors"] as JArray;
            if (actors == null) return;

            _lastActorCount = (int?)data["actorCount"] ?? actors.Count;
            _lastFrame = (int?)data["frame"] ?? _lastFrame;
            _lastTotalJoints = 0;
            _lastJointSample = "";
            _lastFrameRealtime = Time.realtimeSinceStartup;

            foreach (JToken actorToken in actors)
            {
                int actorId = (int?)actorToken["id"] ?? -1;
                if (actorId < 0 || actorId >= maxActors) continue;
                if (_markers.TryGetValue(actorId, out var marker))
                {
                    Vector3 actorPosition = ReadVec3(actorToken["position"], Vector3.zero);
                    marker.lastKinectPosition = new Vector3(actorPosition.x, 0f, actorPosition.z);
                    if (useTransformAsStageAnchor)
                    {
                        marker.targetLocalPosition = TransformKinectPosition(actorId, marker.lastKinectPosition);
                    }
                    else
                    {
                        marker.targetPosition = TransformKinectPosition(actorId, marker.lastKinectPosition);
                    }
                    marker.active = true;
                    marker.lastSeenTime = Time.realtimeSinceStartup;

                    if (!marker.root.activeSelf)
                    {
                        marker.root.SetActive(true);
                        Debug.Log($"[ActorViz] {marker.labelText.text} appeared!");
                    }

                    JArray joints = actorToken["joints"] as JArray;
                    int jointCount = joints?.Count ?? 0;
                    _lastTotalJoints += jointCount;
                    if (jointCount > 0 && _lastJointSample.Length < 120)
                    {
                        if (_lastJointSample.Length > 0) _lastJointSample += " | ";
                        _lastJointSample += $"{marker.labelText.text}: {SampleJointNames(joints, 4)}";
                    }

                    UpdateStickFigure(marker, actorPosition, joints);
                }
            }

            if (string.IsNullOrEmpty(_lastJointSample))
            {
                _lastJointSample = "no joint array parsed";
            }
        }
        catch (System.Exception ex)
        {
            Debug.LogWarning($"[ActorViz] Parse error: {ex.Message}");
        }
    }

    Vector3 ReadVec3(JToken token, Vector3 fallback)
    {
        if (token == null) return fallback;
        return new Vector3(
            (float?)token["x"] ?? fallback.x,
            (float?)token["y"] ?? fallback.y,
            (float?)token["z"] ?? fallback.z
        );
    }

    string SampleJointNames(JArray joints, int max)
    {
        var names = new List<string>();
        for (int i = 0; i < joints.Count && i < max; i++)
        {
            JToken joint = joints[i];
            string name = (string)joint["name"] ?? "?";
            Vector3 pos = ReadVec3(joint["position"], Vector3.zero);
            Vector3 rot = ReadVec3(joint["rotationEuler"], Vector3.zero);
            names.Add($"{name} p({pos.x:F2},{pos.y:F2},{pos.z:F2}) r({rot.x:F0},{rot.y:F0},{rot.z:F0})");
        }
        return string.Join(",", names);
    }

    void UpdateStickFigure(ActorMarker marker, Vector3 actorPosition, JArray joints)
    {
        if (!showStickFigures) return;

        if (joints == null || joints.Count == 0)
        {
            ApplyFallbackHumanoidPose(marker);
            UpdateBoneLines(marker);
            return;
        }

        foreach (JToken joint in joints)
        {
            string jointName = (string)joint["name"];
            if (string.IsNullOrEmpty(jointName)) continue;
            if (!marker.joints.TryGetValue(jointName, out Transform jointTransform)) continue;

            Vector3 jointOffset = joint["localPosition"] != null
                ? ReadVec3(joint["localPosition"], Vector3.zero)
                : ReadVec3(joint["position"], actorPosition) - actorPosition;
            jointTransform.localPosition = MapJointOffsetToDisplay(jointOffset);
            jointTransform.localRotation = Quaternion.identity;
            jointTransform.gameObject.SetActive(true);
        }

        UpdateBoneLines(marker);
    }

    void ApplyFallbackHumanoidPose(ActorMarker marker)
    {
        SetJoint(marker, "Pelvis", new Vector3(0f, 0.9f, 0f));
        SetJoint(marker, "SpineNavel", new Vector3(0f, 1.1f, 0f));
        SetJoint(marker, "SpineChest", new Vector3(0f, 1.35f, 0f));
        SetJoint(marker, "Neck", new Vector3(0f, 1.55f, 0f));
        SetJoint(marker, "Head", new Vector3(0f, 1.75f, 0f));

        SetJoint(marker, "ShoulderLeft", new Vector3(-0.22f, 1.42f, 0f));
        SetJoint(marker, "ElbowLeft", new Vector3(-0.42f, 1.18f, 0f));
        SetJoint(marker, "WristLeft", new Vector3(-0.5f, 0.95f, 0f));
        SetJoint(marker, "HandLeft", new Vector3(-0.53f, 0.82f, 0f));

        SetJoint(marker, "ShoulderRight", new Vector3(0.22f, 1.42f, 0f));
        SetJoint(marker, "ElbowRight", new Vector3(0.42f, 1.18f, 0f));
        SetJoint(marker, "WristRight", new Vector3(0.5f, 0.95f, 0f));
        SetJoint(marker, "HandRight", new Vector3(0.53f, 0.82f, 0f));

        SetJoint(marker, "HipLeft", new Vector3(-0.14f, 0.85f, 0f));
        SetJoint(marker, "KneeLeft", new Vector3(-0.18f, 0.45f, 0f));
        SetJoint(marker, "AnkleLeft", new Vector3(-0.2f, 0.1f, 0f));
        SetJoint(marker, "FootLeft", new Vector3(-0.24f, 0.02f, 0.08f));

        SetJoint(marker, "HipRight", new Vector3(0.14f, 0.85f, 0f));
        SetJoint(marker, "KneeRight", new Vector3(0.18f, 0.45f, 0f));
        SetJoint(marker, "AnkleRight", new Vector3(0.2f, 0.1f, 0f));
        SetJoint(marker, "FootRight", new Vector3(0.24f, 0.02f, 0.08f));
    }

    void SetJoint(ActorMarker marker, string jointName, Vector3 localPosition)
    {
        if (!marker.joints.TryGetValue(jointName, out Transform joint)) return;
        joint.localPosition = flattenSkeletonDepth
            ? new Vector3(localPosition.x * skeletonScale, localPosition.y * skeletonScale, 0f)
            : localPosition * skeletonScale;
        joint.gameObject.SetActive(true);
    }

    void UpdateBoneLines(ActorMarker marker)
    {
        int lineIndex = 0;
        foreach (var pair in BONE_PAIRS)
        {
            if (lineIndex >= marker.bones.Count) break;
            Transform bone = marker.bones[lineIndex++];
            if (marker.joints.TryGetValue(pair.a, out Transform a) &&
                marker.joints.TryGetValue(pair.b, out Transform b) &&
                a.gameObject.activeSelf &&
                b.gameObject.activeSelf)
            {
                PositionBoneCylinder(bone, a.localPosition, b.localPosition);
                bone.gameObject.SetActive(true);
            }
            else
            {
                bone.gameObject.SetActive(false);
            }
        }
    }

    void PositionBoneCylinder(Transform bone, Vector3 start, Vector3 end)
    {
        Vector3 delta = end - start;
        float length = delta.magnitude;
        if (length < 0.001f)
        {
            bone.gameObject.SetActive(false);
            return;
        }

        bone.localPosition = (start + end) * 0.5f;
        bone.localRotation = Quaternion.FromToRotation(Vector3.up, delta.normalized);
        bone.localScale = new Vector3(boneLineWidth, length * 0.5f, boneLineWidth);
    }

    Vector3 TransformKinectPosition(int actorId, Vector3 kinectPosition)
    {
        if (useTransformAsStageAnchor)
        {
            return MapKinectPositionToStageLocal(actorId, kinectPosition);
        }

        if (useFixedWorldPlacement)
        {
            Vector3 boardLocal = MapKinectPositionToStageLocal(actorId, kinectPosition);
            return worldBoardPosition + GetBoardRotation() * boardLocal;
        }

        return kinectOriginOffset + RotateKinectOffset(kinectPosition);
    }

    Vector3 MapKinectPositionToStageLocal(int actorId, Vector3 kinectPosition)
    {
        if (useDebugActorSlots)
        {
            float centeredIndex = actorId - 1f;
            return Vector3.right * (centeredIndex * worldActorSpacing + kinectPosition.x * 0.08f)
                + Vector3.forward * Mathf.Clamp(kinectPosition.z * cameraDebugDepthScale, -0.15f, 0.25f);
        }

        return new Vector3(kinectPosition.x, 0f, kinectPosition.z) * kinectScale;
    }

    Vector3 MapJointOffsetToDisplay(Vector3 offset)
    {
        if (flattenSkeletonDepth)
        {
            // Fixed world view is a readable skeleton card. Flatten depth so
            // Kinect Z noise cannot turn limbs into a scattered 3D point cloud.
            return new Vector3(
                offset.x * skeletonScale,
                offset.y * skeletonScale,
                0f
            );
        }

        return offset * skeletonScale;
    }

    Vector3 RotateKinectOffset(Vector3 offset)
    {
        float scale = useFixedWorldPlacement ? skeletonScale : kinectScale;
        return Quaternion.Euler(0f, kinectYawDegrees, 0f) * (offset * scale);
    }

    Quaternion GetBoardRotation()
    {
        return Quaternion.Euler(worldBoardEulerAngles);
    }

    void Update()
    {
        // Smoothly move markers to target positions
        foreach (var kvp in _markers)
        {
            var marker = kvp.Value;
            if (!marker.active) continue;

            if (Time.realtimeSinceStartup - marker.lastSeenTime > actorTimeoutSeconds)
            {
                marker.active = false;
                marker.root.SetActive(false);
                continue;
            }

            if (useTransformAsStageAnchor)
            {
                marker.root.transform.localPosition = Vector3.Lerp(
                    marker.root.transform.localPosition,
                    marker.targetLocalPosition,
                    Time.deltaTime * 10f
                );
                marker.root.transform.localRotation = Quaternion.identity;
            }
            else
            {
                marker.root.transform.position = Vector3.Lerp(
                    marker.root.transform.position,
                    marker.targetPosition,
                    Time.deltaTime * 10f
                );
            }

            if (useFixedWorldPlacement && !useTransformAsStageAnchor)
            {
                marker.root.transform.rotation = GetBoardRotation();
            }
        }

        UpdateBoneDebugText();
    }

    void UpdateBoneDebugText()
    {
        if (_boneDebugText == null) return;

        _boneDebugText.transform.localPosition = debugTextWorldOffset;
        _boneDebugText.transform.localRotation = Quaternion.identity;

        float age = _lastFrameRealtime < 0 ? -1f : Time.realtimeSinceStartup - _lastFrameRealtime;
        string ageText = age < 0 ? "never" : $"{age:F1}s";
        _boneDebugText.text =
            $"KINECT BONE DEBUG\n" +
            $"actors: {_lastActorCount}  joints: {_lastTotalJoints}\n" +
            $"frame: {_lastFrame}  age: {ageText}\n" +
            $"{_lastJointSample}";
    }

    public string GetStatusText()
    {
        float age = _lastFrameRealtime < 0 ? -1f : Time.realtimeSinceStartup - _lastFrameRealtime;
        string ageText = age < 0 ? "never" : $"{age:F1}s ago";
        return $"Kinect actors: {_lastActorCount} | joints {_lastTotalJoints} | frame {_lastFrame} | {ageText}";
    }

    public bool HasRecentKinectData(float maxAgeSeconds = 2f)
    {
        return _lastFrameRealtime > 0 && Time.realtimeSinceStartup - _lastFrameRealtime <= maxAgeSeconds;
    }

    // JSON data classes for deserialization
    [System.Serializable]
    public class Vec3 { public float x, y, z; }

    [System.Serializable]
    public class ActorData
    {
        public int id;
        public string name;
        public Vec3 position;
        public JointData[] joints;
    }

    [System.Serializable]
    public class JointData
    {
        public string name;
        public Vec3 position;
    }

    [System.Serializable]
    public class ActorTrackingData
    {
        public int frame;
        public long timestamp;
        public int actorCount;
        public ActorData[] actors;
    }

    private static readonly string[] KEY_JOINTS =
    {
        "Pelvis", "SpineNavel", "SpineChest", "Neck", "Head",
        "ShoulderLeft", "ElbowLeft", "WristLeft", "HandLeft",
        "ShoulderRight", "ElbowRight", "WristRight", "HandRight",
        "HipLeft", "KneeLeft", "AnkleLeft", "FootLeft",
        "HipRight", "KneeRight", "AnkleRight", "FootRight"
    };

    private struct BonePair
    {
        public string a;
        public string b;
        public BonePair(string a, string b)
        {
            this.a = a;
            this.b = b;
        }
    }

    private static readonly BonePair[] BONE_PAIRS =
    {
        new BonePair("Pelvis", "SpineNavel"),
        new BonePair("SpineNavel", "SpineChest"),
        new BonePair("SpineChest", "Neck"),
        new BonePair("Neck", "Head"),
        new BonePair("SpineChest", "ShoulderLeft"),
        new BonePair("ShoulderLeft", "ElbowLeft"),
        new BonePair("ElbowLeft", "WristLeft"),
        new BonePair("WristLeft", "HandLeft"),
        new BonePair("SpineChest", "ShoulderRight"),
        new BonePair("ShoulderRight", "ElbowRight"),
        new BonePair("ElbowRight", "WristRight"),
        new BonePair("WristRight", "HandRight"),
        new BonePair("Pelvis", "HipLeft"),
        new BonePair("HipLeft", "KneeLeft"),
        new BonePair("KneeLeft", "AnkleLeft"),
        new BonePair("AnkleLeft", "FootLeft"),
        new BonePair("Pelvis", "HipRight"),
        new BonePair("HipRight", "KneeRight"),
        new BonePair("KneeRight", "AnkleRight"),
        new BonePair("AnkleRight", "FootRight")
    };
}
#endif
