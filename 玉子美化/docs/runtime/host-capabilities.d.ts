import type { YuziBeautifyRuntimeContext, YuziBeautifyActions } from './yuzi-beautify-runtime-v1';
export interface ImageCanvas {
  tableName: string;
  stableIdentityFields: string[];
  canvas: string;
  promptFields: string[];
  /** 经用户确认的构图与补充描述，不是图片宽高参数。 */
  promptSuffix?: string;
}
export interface ImageResult {
  ok: boolean;
  status: 'generated' | 'saved' | 'deleted' | 'ready' | 'empty' | 'disabled' | 'unavailable' | 'invalid-input' | 'invalid-target' | 'busy' | 'stale' | 'failed';
  reason?: string;
  /** 持久清空过的画布，不允许回退到旧上传槽。 */
  cleared?: boolean;
  imagePath?: string;
  previousImagePath?: string;
  record?: Readonly<Record<string, unknown>>;
}
export interface ImageGenerationActions {
  generateImage(canvasName: string, rowValues: Record<string, unknown>): Promise<ImageResult>;
  saveImage(canvasName: string, rowValues: Record<string, unknown>, image: Blob): Promise<ImageResult>;
  deleteImage(canvasName: string, rowValues: Record<string, unknown>): Promise<ImageResult>;
  readImage(canvasName: string, rowValues: Record<string, unknown>): Promise<ImageResult>;
  getImageGenerationState(canvasName: string, rowValues?: Record<string, unknown>): Promise<{
    available: boolean; status: ImageResult['status']; canvasName: string; sheetKey?: string; reason?: string;
  }>;
  subscribeImageGeneration(listener: (detail: unknown) => void): () => void;
}
/** 只在声明对应能力时提供；基础页面上下文的apiVersion仍为1。 */
export interface InlineDisplayTableSnapshot {
  readonly sheetKey: string;
  readonly tableName: string;
  readonly headers: readonly string[];
  readonly rawHeaders: readonly unknown[];
  readonly rows: readonly (readonly unknown[])[];
}

export interface InlineDisplayState {
  readonly version: number;
  readonly modelId: string;
  readonly presetId: string;
  readonly displayId: string;
  readonly kind: "inline";
  readonly tables: readonly InlineDisplayTableSnapshot[];
  readonly events: readonly unknown[];
  readonly settings: Readonly<Record<string, unknown>>;
}

export type InlineDisplayStateListener = (state: InlineDisplayState) => void;

export interface HostCapableInlineDisplayContext {
  readonly apiVersion: 1;
  readonly kind: "inline";
  readonly root: HTMLElement;
  readonly signal: AbortSignal;
  getState(): InlineDisplayState;
  subscribe(listener: InlineDisplayStateListener): () => void;
}

export interface HostCapablePageContext extends YuziBeautifyRuntimeContext {
  readonly actions: Readonly<YuziBeautifyActions & Partial<ImageGenerationActions>>;
}
