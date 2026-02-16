import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';

export type DeviceCoordinates = {
	latitude: number;
	longitude: number;
	accuracy?: number;
};

export function isNativeRuntime() {
	return Capacitor.isNativePlatform();
}

export async function readCurrentPosition(timeoutMs = 10_000): Promise<DeviceCoordinates> {
	if (isNativeRuntime()) {
		const perm = await Geolocation.checkPermissions();
		if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
			const req = await Geolocation.requestPermissions();
			if (req.location !== 'granted' && req.coarseLocation !== 'granted') {
				throw new Error('location permission denied');
			}
		}
		const pos = await Geolocation.getCurrentPosition({
			enableHighAccuracy: true,
			timeout: timeoutMs
		});
		return {
			latitude: pos.coords.latitude,
			longitude: pos.coords.longitude,
			accuracy: pos.coords.accuracy ?? undefined
		};
	}

	if (typeof window === 'undefined' || !('geolocation' in navigator)) {
		throw new Error('geolocation is not available on this device');
	}
	return new Promise((resolve, reject) => {
		navigator.geolocation.getCurrentPosition(
			(position) => {
				resolve({
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
					accuracy: position.coords.accuracy
				});
			},
			(error) => {
				reject(new Error(error.message || 'failed to read current position'));
			},
			{
				enableHighAccuracy: true,
				timeout: timeoutMs,
				maximumAge: 0
			}
		);
	});
}

function permissionGranted(value: string | undefined) {
	return value === 'granted' || value === 'limited';
}

export async function capturePhotoWithNativeCamera(
	fileNamePrefix: string,
	quality = 85
): Promise<File> {
	if (!isNativeRuntime() || !Capacitor.isPluginAvailable('Camera')) {
		throw new Error('native camera is not available on this device');
	}

	const currentPermissions = await Camera.checkPermissions();
	const hasCamera = permissionGranted(currentPermissions.camera);

	if (!hasCamera) {
		const requestedPermissions = await Camera.requestPermissions({
			permissions: ['camera']
		});
		const grantedCamera = permissionGranted(requestedPermissions.camera);
		if (!grantedCamera) {
			throw new Error('camera permission denied');
		}
	}

	try {
		const captured = await Camera.getPhoto({
			quality,
			source: CameraSource.Camera,
			resultType: CameraResultType.DataUrl,
			correctOrientation: true,
			saveToGallery: false
		});
		if (!captured.dataUrl) {
			throw new Error('camera did not return image data');
		}
		return dataUrlToFile(captured.dataUrl, fileNamePrefix);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err || '');
		if (/cancel/i.test(message)) {
			throw new Error('camera capture canceled');
		}
		throw err;
	}
}

export function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error('failed to read file'));
		reader.onload = () => resolve(String(reader.result || ''));
		reader.readAsDataURL(file);
	});
}

export async function dataUrlToFile(dataUrl: string, fallbackName: string) {
	const response = await fetch(dataUrl);
	const blob = await response.blob();
	const extension = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') ? 'jpg' : 'bin';
	return new File([blob], `${fallbackName}.${extension}`, {
		type: blob.type || 'application/octet-stream'
	});
}
