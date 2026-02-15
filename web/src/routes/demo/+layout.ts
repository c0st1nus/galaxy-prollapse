import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';

export function load() {
	if (env.PUBLIC_ENABLE_DEV_UI !== '1') {
		throw error(404, 'Not found');
	}
}
