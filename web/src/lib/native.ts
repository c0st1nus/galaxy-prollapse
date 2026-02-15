export type DeviceCoordinates = {
	latitude: number;
	longitude: number;
	accuracy?: number;
};

export function readCurrentPosition(timeoutMs = 10_000): Promise<DeviceCoordinates> {
	if (typeof window === 'undefined' || !('geolocation' in navigator)) {
		return Promise.reject(new Error('geolocation is not available on this device'));
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
