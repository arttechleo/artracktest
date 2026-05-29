/** 8th Wall XR8 TypeScript declarations */

interface XR8PipelineModule {
  name: string;
  onStart?: (args: { canvas: HTMLCanvasElement; canvasWidth: number; canvasHeight: number }) => void;
  onUpdate?: (args: { processCpuResult: any; frameStartResult: any }) => void;
  onRender?: () => void;
  onDetach?: () => void;
  onException?: (error: Error) => void;
  requiredPermissions?: () => any[];
}

interface XR8Threejs {
  pipelineModule: () => XR8PipelineModule;
  xrScene: () => { scene: THREE.Scene; camera: THREE.Camera; renderer: THREE.WebGLRenderer };
}

interface XR8XrController {
  hitTest: (x: number, y: number, types: string[]) => any;
  updateCameraProjectionMatrix: (args: { origin: any; facing: any }) => void;
  configure: (args: any) => void;
  pipelineModule: () => XR8PipelineModule;
}

interface XR8GlTextureRenderer {
  pipelineModule: () => XR8PipelineModule;
}

interface XR8 {
  run: (args: { canvas: HTMLCanvasElement }) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  addCameraPipelineModule: (module: XR8PipelineModule) => void;
  addCameraPipelineModules: (modules: XR8PipelineModule[]) => void;
  removeCameraPipelineModule: (name: string) => void;
  Threejs: XR8Threejs;
  XrController: XR8XrController;
  GlTextureRenderer: XR8GlTextureRenderer;
}

interface Window {
  XR8?: XR8;
}
