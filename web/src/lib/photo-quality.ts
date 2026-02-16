import { Capacitor, registerPlugin } from '@capacitor/core';
import { fileToDataUrl } from '$lib/native';

export type PhotoCheckStage = 'before' | 'after' | 'checklist';

export type PhotoQualityIssueCode =
	| 'unsupported_format'
	| 'file_too_large'
	| 'low_resolution'
	| 'too_dark'
	| 'too_bright'
	| 'blurry'
	| 'low_contrast'
	| 'unreadable';

export type PhotoQualityIssueSeverity = 'warning' | 'error';

export type PhotoQualityIssue = {
	code: PhotoQualityIssueCode;
	severity: PhotoQualityIssueSeverity;
	message: string;
	value?: number;
	threshold?: number;
};

export type PhotoQualityMetrics = {
	width?: number;
	height?: number;
	brightness_mean?: number;
	brightness_std_dev?: number;
	dark_ratio?: number;
	bright_ratio?: number;
	blur_laplacian_variance?: number;
	file_size_bytes?: number;
};

export type PhotoQualityResult = {
	ok: boolean;
	analyzer: 'native_aicore' | 'heuristic';
	issues: PhotoQualityIssue[];
	metrics: PhotoQualityMetrics;
};

type NativePhotoQualityIssue = {
	code?: string;
	severity?: string;
	message?: string;
	value?: number;
	threshold?: number;
};

type NativePhotoQualityResult = {
	ok?: boolean;
	issues?: NativePhotoQualityIssue[];
	metrics?: Record<string, unknown>;
};

interface LocalPhotoQualityPlugin {
	assessCleaningPhoto(input: {
		dataUrl: string;
		stage: PhotoCheckStage;
	}): Promise<NativePhotoQualityResult>;
}

const LocalPhotoQuality = registerPlugin<LocalPhotoQualityPlugin>('LocalPhotoQuality');

const MAX_FILE_SIZE_BYTES = 12 * 1024 * 1024;
const MIN_WIDTH = 640;
const MIN_HEIGHT = 480;
const MAX_ANALYSIS_DIMENSION = 512;

function normalizeIssueCode(value: string): PhotoQualityIssueCode | null {
	if (value === 'unsupported_format') return 'unsupported_format';
	if (value === 'file_too_large') return 'file_too_large';
	if (value === 'low_resolution') return 'low_resolution';
	if (value === 'too_dark') return 'too_dark';
	if (value === 'too_bright') return 'too_bright';
	if (value === 'blurry') return 'blurry';
	if (value === 'low_contrast') return 'low_contrast';
	if (value === 'unreadable') return 'unreadable';
	return null;
}

function normalizeSeverity(value: string | undefined): PhotoQualityIssueSeverity {
	return value?.toLowerCase() === 'warning' ? 'warning' : 'error';
}

function makeIssue(
	code: PhotoQualityIssueCode,
	severity: PhotoQualityIssueSeverity,
	message: string,
	value?: number,
	threshold?: number
): PhotoQualityIssue {
	return { code, severity, message, value, threshold };
}

function isImageMime(mime: string): boolean {
	return mime.toLowerCase().startsWith('image/');
}

function blockingIssueCount(result: PhotoQualityResult): number {
	return result.issues.filter((issue) => issue.severity === 'error').length;
}

function isBrowserRuntime(): boolean {
	return typeof window !== 'undefined' && typeof document !== 'undefined';
}

async function readImageBitmapFromFile(file: File): Promise<{
	sourceWidth: number;
	sourceHeight: number;
	sampleWidth: number;
	sampleHeight: number;
	data: Uint8ClampedArray;
}> {
	if (!isBrowserRuntime()) {
		throw new Error('photo checks are available only in browser runtime');
	}

	const drawImageToCanvas = (
		sourceWidth: number,
		sourceHeight: number,
		drawer: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
	) => {
		const scale = Math.min(1, MAX_ANALYSIS_DIMENSION / Math.max(sourceWidth, sourceHeight));
		const sampleWidth = Math.max(1, Math.round(sourceWidth * scale));
		const sampleHeight = Math.max(1, Math.round(sourceHeight * scale));
		const canvas = document.createElement('canvas');
		canvas.width = sampleWidth;
		canvas.height = sampleHeight;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) throw new Error('canvas context is unavailable');
		drawer(context, sampleWidth, sampleHeight);
		const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight);
		return {
			sourceWidth,
			sourceHeight,
			sampleWidth,
			sampleHeight,
			data: imageData.data
		};
	};

	if (typeof createImageBitmap === 'function') {
		const bitmap = await createImageBitmap(file);
		try {
			return drawImageToCanvas(bitmap.width, bitmap.height, (ctx, width, height) => {
				ctx.drawImage(bitmap, 0, 0, width, height);
			});
		} finally {
			bitmap.close();
		}
	}

	const objectUrl = URL.createObjectURL(file);
	try {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const element = new Image();
			element.onload = () => resolve(element);
			element.onerror = () => reject(new Error('failed to decode image'));
			element.src = objectUrl;
		});
		return drawImageToCanvas(img.naturalWidth, img.naturalHeight, (ctx, width, height) => {
			ctx.drawImage(img, 0, 0, width, height);
		});
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
}

function analyzeHeuristicMetrics(image: {
	sourceWidth: number;
	sourceHeight: number;
	sampleWidth: number;
	sampleHeight: number;
	data: Uint8ClampedArray;
}) {
	const pixelCount = image.sampleWidth * image.sampleHeight;
	const luminance = new Float32Array(pixelCount);
	let sum = 0;
	let sumSquares = 0;
	let darkPixels = 0;
	let brightPixels = 0;

	for (let i = 0, p = 0; i < image.data.length; i += 4, p += 1) {
		const r = image.data[i];
		const g = image.data[i + 1];
		const b = image.data[i + 2];
		const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
		luminance[p] = y;
		sum += y;
		sumSquares += y * y;
		if (y < 40) darkPixels += 1;
		if (y > 220) brightPixels += 1;
	}

	const mean = sum / pixelCount;
	const variance = Math.max(0, sumSquares / pixelCount - mean * mean);
	const stdDev = Math.sqrt(variance);
	const darkRatio = darkPixels / pixelCount;
	const brightRatio = brightPixels / pixelCount;

	let laplacianEnergy = 0;
	let laplacianCount = 0;
	for (let y = 1; y < image.sampleHeight - 1; y += 1) {
		for (let x = 1; x < image.sampleWidth - 1; x += 1) {
			const idx = y * image.sampleWidth + x;
			const laplacian =
				4 * luminance[idx] -
				luminance[idx - 1] -
				luminance[idx + 1] -
				luminance[idx - image.sampleWidth] -
				luminance[idx + image.sampleWidth];
			laplacianEnergy += laplacian * laplacian;
			laplacianCount += 1;
		}
	}
	const blurVariance = laplacianCount ? laplacianEnergy / laplacianCount : 0;

	return {
		width: image.sourceWidth,
		height: image.sourceHeight,
		brightness_mean: Number(mean.toFixed(2)),
		brightness_std_dev: Number(stdDev.toFixed(2)),
		dark_ratio: Number(darkRatio.toFixed(4)),
		bright_ratio: Number(brightRatio.toFixed(4)),
		blur_laplacian_variance: Number(blurVariance.toFixed(2))
	};
}

async function tryNativeAiCorePhotoCheck(
	file: File,
	stage: PhotoCheckStage
): Promise<PhotoQualityResult | null> {
	if (!Capacitor.isNativePlatform()) return null;

	try {
		const dataUrl = await fileToDataUrl(file);
		const nativeResult = await LocalPhotoQuality.assessCleaningPhoto({ dataUrl, stage });
		if (!nativeResult || typeof nativeResult !== 'object') return null;

		const issues: PhotoQualityIssue[] = Array.isArray(nativeResult.issues)
			? nativeResult.issues
					.map((raw) => {
						if (!raw || typeof raw !== 'object') return null;
						const code = normalizeIssueCode(String(raw.code || ''));
						if (!code) return null;
						return makeIssue(
							code,
							normalizeSeverity(typeof raw.severity === 'string' ? raw.severity : undefined),
							typeof raw.message === 'string'
								? raw.message
								: `Photo quality issue: ${code.replaceAll('_', ' ')}`,
							typeof raw.value === 'number' ? raw.value : undefined,
							typeof raw.threshold === 'number' ? raw.threshold : undefined
						);
					})
					.filter((item): item is PhotoQualityIssue => item !== null)
			: [];

		const metricsSource =
			nativeResult.metrics && typeof nativeResult.metrics === 'object' ? nativeResult.metrics : {};
		const metrics: PhotoQualityMetrics = {};
		const acceptedMetricKeys: Array<keyof PhotoQualityMetrics> = [
			'width',
			'height',
			'brightness_mean',
			'brightness_std_dev',
			'dark_ratio',
			'bright_ratio',
			'blur_laplacian_variance'
		];
		for (const key of acceptedMetricKeys) {
			const value = (metricsSource as Record<string, unknown>)[key];
			if (typeof value === 'number' && Number.isFinite(value)) metrics[key] = value;
		}

		const ok =
			typeof nativeResult.ok === 'boolean'
				? nativeResult.ok
				: issues.every((issue) => issue.severity !== 'error');

		return {
			ok,
			analyzer: 'native_aicore',
			issues,
			metrics
		};
	} catch {
		return null;
	}
}

async function runHeuristicPhotoCheck(
	file: File,
	issues: PhotoQualityIssue[],
	baseMetrics: PhotoQualityMetrics
): Promise<PhotoQualityResult> {
	try {
		const image = await readImageBitmapFromFile(file);
		const metrics = {
			...baseMetrics,
			...analyzeHeuristicMetrics(image)
		};

		if ((metrics.width || 0) < MIN_WIDTH || (metrics.height || 0) < MIN_HEIGHT) {
			issues.push(
				makeIssue(
					'low_resolution',
					'error',
					`Image resolution is too low. Minimum is ${MIN_WIDTH}x${MIN_HEIGHT}.`,
					Math.min(metrics.width || 0, metrics.height || 0),
					Math.min(MIN_WIDTH, MIN_HEIGHT)
				)
			);
		}

		if ((metrics.brightness_mean || 0) < 55 || (metrics.dark_ratio || 0) > 0.7) {
			issues.push(
				makeIssue(
					'too_dark',
					'error',
					'Photo is too dark for reliable cleaning assessment.',
					metrics.brightness_mean,
					55
				)
			);
		}

		if ((metrics.brightness_mean || 0) > 215 || (metrics.bright_ratio || 0) > 0.55) {
			issues.push(
				makeIssue(
					'too_bright',
					'warning',
					'Photo appears overexposed; details may be lost.',
					metrics.brightness_mean,
					215
				)
			);
		}

		if ((metrics.blur_laplacian_variance || 0) < 45) {
			issues.push(
				makeIssue(
					'blurry',
					'error',
					'Photo looks blurry. Retake with stable focus.',
					metrics.blur_laplacian_variance,
					45
				)
			);
		}

		if ((metrics.brightness_std_dev || 0) < 22) {
			issues.push(
				makeIssue(
					'low_contrast',
					'warning',
					'Low contrast makes stains and residue harder to verify.',
					metrics.brightness_std_dev,
					22
				)
			);
		}

		return {
			ok: issues.every((issue) => issue.severity !== 'error'),
			analyzer: 'heuristic',
			issues,
			metrics
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : 'failed to decode image';
		issues.push(makeIssue('unreadable', 'error', message));
		return {
			ok: false,
			analyzer: 'heuristic',
			issues,
			metrics: baseMetrics
		};
	}
}

export async function assessCleaningPhotoBeforeSend(
	file: File,
	stage: PhotoCheckStage
): Promise<PhotoQualityResult> {
	const issues: PhotoQualityIssue[] = [];
	const metrics: PhotoQualityMetrics = {
		file_size_bytes: file.size
	};

	if (!isImageMime(file.type)) {
		issues.push(
			makeIssue(
				'unsupported_format',
				'error',
				'Only image files are allowed for cleaning review photos.'
			)
		);
	}
	if (file.size > MAX_FILE_SIZE_BYTES) {
		issues.push(
			makeIssue(
				'file_too_large',
				'error',
				`Photo exceeds ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB.`,
				file.size,
				MAX_FILE_SIZE_BYTES
			)
		);
	}

	if (issues.length) {
		return {
			ok: false,
			analyzer: 'heuristic',
			issues,
			metrics
		};
	}

	const nativeResult = await tryNativeAiCorePhotoCheck(file, stage);
	if (nativeResult) {
		return {
			...nativeResult,
			metrics: {
				...metrics,
				...nativeResult.metrics
			}
		};
	}

	return runHeuristicPhotoCheck(file, issues, metrics);
}

export function formatPhotoQualityFailure(
	result: PhotoQualityResult,
	stage: PhotoCheckStage
): string {
	const stageLabel = stage === 'before' ? 'before' : stage === 'after' ? 'after' : 'checklist';
	const blocking = result.issues.filter((issue) => issue.severity === 'error');
	if (!blocking.length) return '';
	const details = blocking.map((issue) => issue.message).join(' ');
	return `Cannot send ${stageLabel} photo. ${details}`;
}

export function describePhotoQualityWarnings(result: PhotoQualityResult): string {
	const warnings = result.issues.filter((issue) => issue.severity === 'warning');
	if (!warnings.length) return '';
	return warnings.map((issue) => issue.message).join(' ');
}

export function hasBlockingPhotoQualityIssues(result: PhotoQualityResult): boolean {
	return blockingIssueCount(result) > 0;
}
