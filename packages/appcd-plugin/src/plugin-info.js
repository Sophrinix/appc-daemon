import fs from 'fs';
import path from 'path';
import semver from 'semver';
import snooplogg from 'snooplogg';

import { expandPath } from 'appcd-path';
import { GawkObject } from 'gawk';
import { isDir, isFile } from 'appcd-fs';

const logger = snooplogg.config({ theme: 'detailed' })('appcd:plugin:plugin-info');
const { highlight } = snooplogg.styles;

/**
 * Contains information about a plugin.
 */
export default class PluginInfo extends GawkObject {
	/**
	 * Determines if the specified directory is a plugin and then loads it's meta data.
	 *
	 * @param {String} dir - The path to the plugin.
	 */
	constructor(dir) {
		if (!isDir(dir)) {
			throw new Error(`Plugin directory does not exist: ${dir}`);
		}

		const pkgJsonFile = path.join(dir, 'package.json');
		if (!isFile(pkgJsonFile)) {
			throw new Error(`Plugin directory does not contain a package.json: ${dir}`);
		}

		let pkgJson;
		try {
			pkgJson = JSON.parse(fs.readFileSync(pkgJsonFile, 'utf8'));
		} catch (e) {
			throw new Error(`Error reading plugin ${pkgJsonFile}: ${e.message}`);
		}

		// make sure package.json has a name
		if (!pkgJson.name) {
			throw new Error(`Plugin package.json doesn't have a name: ${dir}`);
		}

		// find the main file
		const main = pkgJson.main || 'index.js';
		let mainFile = main;
		if (!/\.js$/.test(mainFile)) {
			mainFile += '.js';
		}
		mainFile = expandPath(dir, mainFile);
		if (!isFile(mainFile)) {
			throw new Error(`Unable to find main file: ${main}`);
		}

		super();

		/**
		 * The plugin path.
		 * @type {String}
		 */
		this.path = dir;

		/**
		 * The plugin name.
		 * @type {String}
		 */
		this.name = pkgJson.name;

		/**
		 * The plugin version.
		 * @type {String}
		 */
		this.version = pkgJson.version;

		/**
		 * The plugin identifier.
		 * @type {String}
		 */
		this.id = `${this.name}@${this.version}`;

		/**
		 * The plugin type. Must be either `internal` or `external`.
		 * @type {String}
		 */
		this.type = pkgJson.appcd && pkgJson.appcd.type === 'internal' ? 'internal' : 'external';

		/**
		 * The plugin's Node.js version.
		 * @type {String}
		 */
		this.nodeVersion = pkgJson.engines && pkgJson.engines.node;
		if (!this.nodeVersion) {
			this.nodeVersion = process.version;
		} else if (this.type === 'internal' && !semver.satisfies(process.version, this.nodeVersion)) {
			throw new Error(`Internal plugin requires Node.js ${this.nodeVersion}, but core is currently running ${process.version}`);
		}

		/**
		 * The process id of the plugin host child process when the `type` is set to `external`. If
		 * the value is `null`, then the `type` is `internal` or the child process is not running.
		 * @type {?Number}
		 */
		this.pid = null;
	}

	/**
	 * Loads a plugin.
	 *
	 * @access public
	 */
	load() {
		if (this.type === 'internal') {
			// TODO: require()
		} else {
			// TODO: spawn plugin host
		}
	}

	/**
	 * Unloads an `external` plugin.
	 *
	 * @access public
	 */
	unload() {
		if (this.type === 'internal') {
			throw new Error('Cannot unload internal plugins');
		}

		// TODO: kill the child process
	}
}
