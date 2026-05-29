using UnityEditor;
using UnityEngine;

public class BuildScript
{
    [MenuItem("Build/Build Android APK")]
    public static void BuildAndroid()
    {
        string[] scenes = { "Assets/Samples/Meta XR Movement SDK/83.0.0/Body Tracking Samples/Scenes/MovementBody.unity" };
        string outputPath = "Builds/ROOTMovementTest.apk";

        // Ensure output directory exists
        System.IO.Directory.CreateDirectory("Builds");

        BuildPlayerOptions buildOptions = new BuildPlayerOptions
        {
            scenes = scenes,
            locationPathName = outputPath,
            target = BuildTarget.Android,
            options = BuildOptions.None
        };

        var result = BuildPipeline.BuildPlayer(buildOptions);
        if (result.summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded)
        {
            Debug.Log($"Build succeeded: {outputPath} ({result.summary.totalSize} bytes)");
        }
        else
        {
            Debug.LogError($"Build failed: {result.summary.result}");
            EditorApplication.Exit(1);
        }
    }
}
