import type { CapacitorConfig } from '@capacitor/cli';

const capServerUrl = process.env.CAP_SERVER_URL?.trim() || '';
const capAllowNavigation = (process.env.CAP_ALLOW_NAVIGATION || '')
	.split(',')
	.map((entry) => entry.trim())
	.filter(Boolean);

const config: CapacitorConfig = {
	appId: 'com.tinytidy.app',
	appName: 'TinyTidy',
	webDir: 'build',
	server: {
		androidScheme: 'https',
		iosScheme: 'https',
		...(capServerUrl ? { url: capServerUrl } : {}),
		...(capAllowNavigation.length ? { allowNavigation: capAllowNavigation } : {})
	},
	plugins: {
		Geolocation: {
			permissions: ['location', 'coarseLocation']
		},
		Camera: {
			presentationStyle: 'fullscreen',
			saveToGallery: false
		}
	}
};

export default config;
