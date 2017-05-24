/* istanbul ignore if */
if (!Error.prepareStackTrace) {
	require('source-map-support/register');
}

export { default, default as SubprocessManager } from './subprocess-manager';
export * from './subprocess';
