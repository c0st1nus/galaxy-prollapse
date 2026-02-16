import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.tinytidy.app',
	appName: 'TinyTidy',
	webDir: 'build',
	server: {
		androidScheme: 'https'
	}
};

export default config;
