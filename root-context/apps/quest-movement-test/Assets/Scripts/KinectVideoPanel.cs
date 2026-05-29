using System;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Displays low-FPS Kinect color frames in the Quest performer view.
/// Uses a world-space UI RawImage instead of a 3D mesh material so Android/Quest
/// builds do not depend on runtime-created mesh shaders.
/// </summary>
public class KinectVideoPanel : MonoBehaviour
{
    [Header("World Placement")]
    public bool followCamera = false;
    public bool placeInFrontOfCameraOnStart = false;
    public Vector3 cameraOffset = new Vector3(0.85f, 0f, 3.5f);
    public Vector3 worldPosition = new Vector3(1.25f, 1.55f, 3.5f);
    public Vector3 worldEulerAngles = new Vector3(0f, 180f, 0f);

    [Header("Panel")]
    [Tooltip("Assign this when using a scene/prefab UI panel. If empty, a fallback world-space panel is created.")]
    public RawImage targetRawImage;
    [Tooltip("When using a scene/prefab RawImage, leave this off to position the prefab manually in the scene.")]
    public bool controlAssignedPanelTransform = false;
    public bool createPanelIfMissing = true;
    [Tooltip("Lower than ActorVisualizer.skeletonRenderQueue so the skeleton draws over video.")]
    public int videoRenderQueue = 3000;
    public int videoSortingOrder = 0;
    public Vector2 panelSizeMeters = new Vector2(1.1f, 0.62f);
    public bool flipVertical = false;
    public bool showDebugLabel = true;

    private Texture2D _texture;
    private Canvas _canvas;
    private RectTransform _canvasRect;
    private RawImage _rawImage;
    private Text _label;
    private Renderer _quadRenderer;
    private Material _videoMaterial;
    private int _framesReceived;
    private long _lastTimestamp;
    private float _lastFrameRealtime = -999f;
    private bool _worldPlacementInitialized;
    private bool _usesAssignedRawImage;

    void Start()
    {
        ResolveOrCreatePanel();
        _texture = new Texture2D(2, 2, TextureFormat.RGB24, false);
        if (_rawImage != null)
        {
            _rawImage.texture = _texture;
            _rawImage.color = Color.white;
            _rawImage.material = GetOrCreateVideoMaterial();
        }

        if (_quadRenderer != null)
        {
            _quadRenderer.sharedMaterial = GetOrCreateVideoMaterial();
            _quadRenderer.sortingOrder = videoSortingOrder;
            SetVideoMaterialTexture(_texture);
        }
        ApplyWorldPlacement();
    }

    void ResolveOrCreatePanel()
    {
        if (targetRawImage != null)
        {
            _usesAssignedRawImage = true;
            _rawImage = targetRawImage;
            _canvas = _rawImage.GetComponentInParent<Canvas>();
            _canvasRect = _canvas != null
                ? _canvas.GetComponent<RectTransform>()
                : _rawImage.GetComponent<RectTransform>();

            if (_canvas != null)
            {
                _canvas.renderMode = RenderMode.WorldSpace;
            }

            if (_rawImage != null)
            {
                _rawImage.raycastTarget = false;
            }
            return;
        }

        if (createPanelIfMissing)
        {
            CreateFallbackPanel();
        }
    }

    void CreateFallbackPanel()
    {
        var quad = GameObject.CreatePrimitive(PrimitiveType.Quad);
        quad.name = "KinectVideoQuad";
        quad.transform.SetParent(transform, false);
        quad.transform.localScale = new Vector3(panelSizeMeters.x, panelSizeMeters.y, 1f);
        Destroy(quad.GetComponent<Collider>());
        _quadRenderer = quad.GetComponent<Renderer>();

        var canvasGO = new GameObject("KinectVideoCanvas");
        canvasGO.transform.SetParent(transform, false);
        _canvas = canvasGO.AddComponent<Canvas>();
        _canvas.renderMode = RenderMode.WorldSpace;
        _canvas.sortingOrder = 50;
        canvasGO.AddComponent<CanvasScaler>().dynamicPixelsPerUnit = 1000;

        _canvasRect = canvasGO.GetComponent<RectTransform>();
        _canvasRect.sizeDelta = panelSizeMeters;

        var imageGO = new GameObject("KinectVideoRawImage");
        imageGO.transform.SetParent(canvasGO.transform, false);
        _rawImage = imageGO.AddComponent<RawImage>();
        _rawImage.color = Color.white;
        _rawImage.raycastTarget = false;
        _rawImage.enabled = false;

        RectTransform imageRect = imageGO.GetComponent<RectTransform>();
        imageRect.anchorMin = Vector2.zero;
        imageRect.anchorMax = Vector2.one;
        imageRect.offsetMin = Vector2.zero;
        imageRect.offsetMax = Vector2.zero;

        if (flipVertical)
        {
            imageRect.localScale = new Vector3(1f, -1f, 1f);
        }

        if (!showDebugLabel) return;

        var labelGO = new GameObject("KinectVideoLabel");
        labelGO.transform.SetParent(canvasGO.transform, false);
        _label = labelGO.AddComponent<Text>();
        _label.text = "Kinect video: waiting";
        _label.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
        _label.fontSize = 28;
        _label.alignment = TextAnchor.UpperCenter;
        _label.color = Color.cyan;
        _label.raycastTarget = false;

        RectTransform labelRect = labelGO.GetComponent<RectTransform>();
        labelRect.anchorMin = new Vector2(0f, 0f);
        labelRect.anchorMax = new Vector2(1f, 0f);
        labelRect.pivot = new Vector2(0.5f, 1f);
        labelRect.anchoredPosition = new Vector2(0f, -0.04f);
        labelRect.sizeDelta = new Vector2(0f, 0.18f);
    }

    Material GetOrCreateVideoMaterial()
    {
        if (_videoMaterial != null) return _videoMaterial;

        Shader shader = Shader.Find("ROOT/XRUnlitTexture")
            ?? Shader.Find("Unlit/Texture")
            ?? Shader.Find("Sprites/Default")
            ?? Shader.Find("UI/Default");

        _videoMaterial = new Material(shader);
        if (_videoMaterial.HasProperty("_Color"))
        {
            _videoMaterial.SetColor("_Color", Color.white);
        }
        _videoMaterial.renderQueue = videoRenderQueue;
        return _videoMaterial;
    }

    void SetVideoMaterialTexture(Texture texture)
    {
        if (_videoMaterial == null || texture == null) return;
        if (_videoMaterial.HasProperty("_MainTex"))
        {
            _videoMaterial.SetTexture("_MainTex", texture);
        }
    }

    public void UpdateVideoFrame(string jsonData)
    {
        try
        {
            var data = JsonUtility.FromJson<KinectVideoData>(jsonData);
            if (data == null || string.IsNullOrEmpty(data.imageBase64)) return;
            if (data.timestamp <= _lastTimestamp) return;

            byte[] jpg = Convert.FromBase64String(data.imageBase64);
            if (_texture == null)
            {
                _texture = new Texture2D(2, 2, TextureFormat.RGB24, false);
            }

            if (_texture.LoadImage(jpg, false))
            {
                _lastTimestamp = data.timestamp;
                _lastFrameRealtime = Time.realtimeSinceStartup;
                _framesReceived++;
                if (_rawImage != null)
                {
                    _rawImage.texture = _texture;
                    _rawImage.color = Color.white;
                }
                SetVideoMaterialTexture(_texture);
            }
        }
        catch (Exception ex)
        {
            Debug.LogWarning($"[KinectVideoPanel] Failed to decode video frame: {ex.Message}");
        }
    }

    void ApplyWorldPlacement()
    {
        if (_canvasRect == null || _worldPlacementInitialized) return;
        if (_usesAssignedRawImage && !controlAssignedPanelTransform)
        {
            _worldPlacementInitialized = true;
            return;
        }

        Transform panelTransform = _canvasRect.transform;
        if (_quadRenderer != null)
        {
            panelTransform = transform;
        }

        if (placeInFrontOfCameraOnStart && Camera.main != null)
        {
            Transform cam = Camera.main.transform;
            panelTransform.position = cam.position
                + cam.right * cameraOffset.x
                + cam.up * cameraOffset.y
                + cam.forward * cameraOffset.z;
            panelTransform.LookAt(cam);
            worldPosition = panelTransform.position;
            worldEulerAngles = panelTransform.eulerAngles;
        }
        else
        {
            panelTransform.position = worldPosition;
            panelTransform.rotation = Quaternion.Euler(worldEulerAngles);
        }

        _worldPlacementInitialized = true;
    }

    void LateUpdate()
    {
        if (_canvasRect != null && !_worldPlacementInitialized)
        {
            ApplyWorldPlacement();
        }

        if (_usesAssignedRawImage && !controlAssignedPanelTransform)
        {
            UpdateLabel();
            return;
        }

        Transform panelTransform = _quadRenderer != null ? transform : _canvasRect.transform;

        if (followCamera && panelTransform != null && Camera.main != null)
        {
            Transform cam = Camera.main.transform;
            panelTransform.position = cam.position
                + cam.right * cameraOffset.x
                + cam.up * cameraOffset.y
                + cam.forward * cameraOffset.z;
            panelTransform.LookAt(cam);
        }
        else if (panelTransform != null && !placeInFrontOfCameraOnStart)
        {
            panelTransform.position = worldPosition;
            panelTransform.rotation = Quaternion.Euler(worldEulerAngles);
        }

        UpdateLabel();
    }

    void UpdateLabel()
    {
        if (_label == null) return;
        _label.text = _framesReceived > 0
            ? $"Kinect video: {_framesReceived}"
            : "Kinect video: waiting";
    }

    public string GetStatusText()
    {
        float age = _lastFrameRealtime < 0 ? -1f : Time.realtimeSinceStartup - _lastFrameRealtime;
        string ageText = age < 0 ? "never" : $"{age:F1}s ago";
        return $"Kinect video: {_framesReceived} frames | {ageText}";
    }

    public bool HasRecentVideo(float maxAgeSeconds = 2f)
    {
        return _lastFrameRealtime > 0 && Time.realtimeSinceStartup - _lastFrameRealtime <= maxAgeSeconds;
    }

    [Serializable]
    public class KinectVideoData
    {
        public int frame;
        public long timestamp;
        public int width;
        public int height;
        public string mimeType;
        public string imageBase64;
    }
}
