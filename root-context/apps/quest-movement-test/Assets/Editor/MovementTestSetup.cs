#if UNITY_ANDROID || UNITY_EDITOR_OSX
using UnityEngine;
using UnityEditor;

/// <summary>
/// ROOT Theater - Movement SDK Test Project Setup Helper
///
/// This editor script helps verify and configure the project
/// for Quest 3 body tracking with the Meta Movement SDK.
///
/// Access via menu: ROOT Theater > Setup Wizard
/// </summary>
public class MovementTestSetup : EditorWindow
{
    private Vector2 _scrollPos;

    [MenuItem("ROOT Theater/Setup Wizard")]
    public static void ShowWindow()
    {
        GetWindow<MovementTestSetup>("ROOT Movement Setup");
    }

    [MenuItem("ROOT Theater/Quick Check")]
    public static void QuickCheck()
    {
        Debug.Log("=== ROOT Movement Test - Quick Check ===");

        // Check Android build target
        if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android)
        {
            Debug.LogWarning("[ROOT] Build target is NOT Android! Switch via File > Build Settings > Android > Switch Platform");
        }
        else
        {
            Debug.Log("[ROOT] ✓ Build target: Android");
        }

        // Check for Movement SDK
        bool hasMovementSDK = System.Type.GetType("Meta.XR.Movement.Retargeting.CharacterRetargeter, Meta.XR.Movement") != null;
        if (hasMovementSDK)
            Debug.Log("[ROOT] ✓ Meta Movement SDK detected");
        else
            Debug.LogWarning("[ROOT] ✗ Meta Movement SDK NOT found — import it via Package Manager > Meta XR Movement SDK > Samples > Body Tracking");

        // Check scripting backend
        if (PlayerSettings.GetScriptingBackend(BuildTargetGroup.Android) == ScriptingImplementation.IL2CPP)
            Debug.Log("[ROOT] ✓ IL2CPP scripting backend");
        else
            Debug.LogWarning("[ROOT] ✗ Scripting backend should be IL2CPP for Quest");

        // Check minimum API level
        if (PlayerSettings.Android.minSdkVersion >= AndroidSdkVersions.AndroidApiLevel32)
            Debug.Log("[ROOT] ✓ Min SDK 32 (Quest 3 compatible)");
        else
            Debug.LogWarning("[ROOT] ✗ Min SDK should be 32+ for Quest 3");

        // Check color space
        if (PlayerSettings.colorSpace == ColorSpace.Linear)
            Debug.Log("[ROOT] ✓ Linear color space");
        else
            Debug.LogWarning("[ROOT] ✗ Color space should be Linear for Quest VR rendering");

        // Check Newtonsoft JSON
        bool hasNewtonsoft = System.Type.GetType("Newtonsoft.Json.JsonConvert, Newtonsoft.Json") != null;
        if (hasNewtonsoft)
            Debug.Log("[ROOT] ✓ Newtonsoft JSON available");
        else
            Debug.LogWarning("[ROOT] ✗ Newtonsoft JSON not found — needed for WebSocket serialization");

        Debug.Log("=== Quick Check Complete ===");
    }

    void OnGUI()
    {
        _scrollPos = EditorGUILayout.BeginScrollView(_scrollPos);

        GUILayout.Label("ROOT Theater — Movement SDK Test Setup", EditorStyles.boldLabel);
        GUILayout.Space(10);

        EditorGUILayout.HelpBox(
            "This project tests Meta Movement SDK body tracking with streaming to the ROOT WebAR audience app.\n\n" +
            "Follow the steps below to get body tracking working on Quest 3.",
            MessageType.Info);

        GUILayout.Space(10);

        // Step 1
        GUILayout.Label("Step 1: Switch to Android", EditorStyles.boldLabel);
        GUILayout.Label("File > Build Settings > Android > Switch Platform");
        if (GUILayout.Button("Switch to Android Now"))
        {
            EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android);
        }
        GUILayout.Space(10);

        // Step 2
        GUILayout.Label("Step 2: Import Movement SDK Body Tracking Samples", EditorStyles.boldLabel);
        GUILayout.Label("Window > Package Manager > Meta XR Movement SDK -> Samples tab -> Import 'Body Tracking Samples'");
        GUILayout.Space(10);

        // Step 3
        GUILayout.Label("Step 3: Open Body Tracking Sample Scene", EditorStyles.boldLabel);
        GUILayout.Label("After importing, open: Assets/Samples/Meta XR Movement SDK/*/Body Tracking Samples/Scenes/");
        if (GUILayout.Button("Search for Body Tracking Scenes"))
        {
            string[] guids = AssetDatabase.FindAssets("t:Scene BodyTracking");
            if (guids.Length > 0)
            {
                foreach (string guid in guids)
                {
                    string path = AssetDatabase.GUIDToAssetPath(guid);
                    Debug.Log($"[ROOT] Found scene: {path}");
                }
                Debug.Log($"[ROOT] Found {guids.Length} body tracking scene(s). Double-click one in Project window to open.");
            }
            else
            {
                Debug.LogWarning("[ROOT] No body tracking scenes found! Import the samples first (Step 2).");
            }
        }
        GUILayout.Space(10);

        // Step 4
        GUILayout.Label("Step 4: Add RetargetStreamer to Avatar", EditorStyles.boldLabel);
        GUILayout.Label("In the sample scene, find the avatar with CharacterRetargeter. " +
                        "Add the RetargetStreamer component to it. " +
                        "Set the relay server URL (your ngrok wss:// URL).");
        if (GUILayout.Button("Find CharacterRetargeter in Scene"))
        {
            var retargeters = FindObjectsOfType<Meta.XR.Movement.Retargeting.CharacterRetargeter>();
            if (retargeters.Length > 0)
            {
                foreach (var r in retargeters)
                {
                    Debug.Log($"[ROOT] Found CharacterRetargeter on: {r.gameObject.name}");
                    Selection.activeGameObject = r.gameObject;
                }
            }
            else
            {
                Debug.LogWarning("[ROOT] No CharacterRetargeter found in scene! Open a body tracking sample scene first.");
            }
        }

        if (GUILayout.Button("Add RetargetStreamer to Selected Object"))
        {
            if (Selection.activeGameObject != null)
            {
                if (Selection.activeGameObject.GetComponent<RetargetStreamer>() == null)
                {
                    Selection.activeGameObject.AddComponent<RetargetStreamer>();
                    Debug.Log($"[ROOT] Added RetargetStreamer to {Selection.activeGameObject.name}");
                }
                else
                {
                    Debug.Log("[ROOT] RetargetStreamer already exists on this object.");
                }
            }
            else
            {
                Debug.LogWarning("[ROOT] Select a GameObject first!");
            }
        }
        GUILayout.Space(10);

        // Step 5
        GUILayout.Label("Step 5: Build APK", EditorStyles.boldLabel);
        GUILayout.Label("File > Build Settings > Build. Or use the button below for a quick build.");
        if (GUILayout.Button("Build APK"))
        {
            string path = EditorUtility.SaveFilePanel("Save APK", "", "ROOT-Movement-Test.apk", "apk");
            if (!string.IsNullOrEmpty(path))
            {
                var scenes = new string[] { UnityEngine.SceneManagement.SceneManager.GetActiveScene().path };
                BuildPipeline.BuildPlayer(scenes, path, BuildTarget.Android, BuildOptions.None);
            }
        }
        GUILayout.Space(10);

        // Run Quick Check
        GUILayout.Label("Diagnostics", EditorStyles.boldLabel);
        if (GUILayout.Button("Run Quick Check (Console)"))
        {
            QuickCheck();
        }

        EditorGUILayout.EndScrollView();
    }
}
#endif
