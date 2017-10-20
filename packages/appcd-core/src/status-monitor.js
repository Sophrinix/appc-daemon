import Agent from 'appcd-agent';
import gawk from 'gawk';
import os from 'os';
import Response, { codes } from 'appcd-response';
import appcdLogger from './logger';

import { DispatcherError, ServiceDispatcher } from 'appcd-dispatcher';

const logger = appcdLogger('appcd:core:status');
const { alert, highlight, note, ok } = appcdLogger.styles;
const { arrowUp, arrowDown } = appcdLogger.symbols;
const { filesize } = appcdLogger.humanize;

/**
 * Monitors the Appc Daemon status.
 */
export default class StatusMonitor extends ServiceDispatcher {
	/**
	 * Initalizes the status and kicks off the timers to refresh the dynamic
	 * status information.
	 */
	constructor() {
		super('/:filter*');

		/**
		 * The user and system time this process has used.
		 * @type {Object}
		 */
		this.initCpu = this.currentCpu = process.cpuUsage();

		/**
		 * The high resolution timer for the amount of time this process has run.
		 * @type {Array.<Number>}
		 */
		this.initHrtime = this.currentHrTime = process.hrtime();

		/**
		 * The daemon status wrapped in a gawk object.
		 * @type {Object}
		 */
		this.status = gawk({
			pid:          process.pid,
			memory:       undefined,
			uptime:       process.uptime(),

			process: {
				execPath: process.execPath,
				execArgv: process.execArgv,
				argv:     process.argv,
				env:      process.env,
			},

			node: {
				version:  process.version.replace(/^v/, ''),
				versions: process.versions
			},

			system: {
				platform: process.platform,
				arch:     process.arch,
				cpus:     os.cpus().length,
				hostname: os.hostname(),
				loadavg:  undefined,
				memory:   undefined
			}
		});

		/**
		 * The latest stats from the agent.
		 * @type {Object}
		 */
		this.stats = null;

		/**
		 * The Node.js process agent.
		 * @type {Agent}
		 */
		this.agent = new Agent()
			.on('stats', stats => {
				this.stats = stats;

				gawk.mergeDeep(this.status, {
					memory: {
						heapTotal: stats.heapTotal,
						heapUsed:  stats.heapUsed,
						rss:       stats.rss
					},
					uptime: process.uptime(),
					system: {
						loadavg: os.loadavg(),
						memory: {
							free:  stats.freemem,
							total: os.totalmem()
						}
					}
				});
			})
			.on('error', () => {}); // suppress uncaught exceptions
	}

	/**
	 * Determines the topic for the incoming request.
	 *
	 * @param {DispatcherContext} ctx - The dispatcher request context object.
	 * @returns {String}
	 * @access private
	 */
	getTopic(ctx) {
		const { params, topic } = ctx.request;
		return topic || (params && params.filter && params.filter.replace(/^\//, '').split(/\.|\//).join('.')) || '';
	}

	/**
	 * Responds to "call" service requests.
	 *
	 * @param {Object} ctx - A dispatcher request context.
	 * @access private
	 */
	onCall(ctx) {
		if (ctx.data) {
			if (typeof data !== 'object') {
				throw new DispatcherError(codes.BAD_REQUEST);
			}
			this.merge(ctx.data);
			ctx.response = new Response(codes.OK);
		} else {
			const node = this.get(this.getTopic(ctx));
			if (!node) {
				throw new DispatcherError(codes.NOT_FOUND);
			}
			ctx.response = node;
		}
	}

	/**
	 * Initializes the status watch for the filter.
	 *
	 * @param {Object} params - Various parameters.
	 * @param {String} [params.topic] - The filter to apply.
	 * @param {Function} params.publish - A function used to publish data to a dispatcher client.
	 * @access private
	 */
	initSubscription({ topic: filter, publish }) {
		logger.debug('Starting status gawk watch: %s', highlight(filter || 'no filter'));
		gawk.watch(this.status, filter, publish);
	}

	/**
	 * Handles a new subscriber.
	 *
	 * @param {Object} params - Various parameters.
	 * @param {String} [params.topic] - The filter to apply.
	 * @param {Function} params.publish - A function used to publish data to a dispatcher client.
	 * @access private
	 */
	onSubscribe({ topic: filter, publish }) {
		publish(this.get(filter));
	}

	/**
	 * Stops watching status updates.
	 *
	 * @param {Object} params - Various parameters.
	 * @param {Function} params.publish - The function used to publish data to a dispatcher client.
	 * This is the same publish function as the one passed to `onSubscribe()`.
	 * @access private
	 */
	destroySubscription({ publish }) {
		logger.debug('Removing status gawk watch');
		gawk.unwatch(this.status, publish);
	}

	/**
	 * Returns the complete or filtered status values.
	 *
	 * Important! This function returns an internal reference and it's critical that the result is
	 * not modified. If you need to modify the status result, then clone it first.
	 *
	 * @param {Array.<String>} [filter] - An array of namespaces used to filter and return a deep
	 * object.
	 * @return {*}
	 * @access public
	 */
	get(filter) {
		if (filter && !Array.isArray(filter)) {
			throw new TypeError('Expected filter to be an array');
		}

		let obj = this.status;

		if (filter) {
			for (let i = 0, len = filter.length; obj && typeof obj === 'object' && i < len; i++) {
				if (!obj.hasOwnProperty(filter[i])) {
					return null;
				}
				obj = obj[filter[i]];
			}
		}

		return obj;
	}

	/**
	 * Mixes an object into the status.
	 *
	 * @param {Object} obj - An object of values to merge into the status object.
	 * @returns {StatusMonitor}
	 * @access public
	 */
	merge(obj) {
		gawk.mergeDeep(this.status, obj);
		return this;
	}

	/**
	 * Starts monitoring the system.
	 *
	 * @returns {StatusMonitor}
	 * @access public
	 */
	start() {
		clearTimeout(this.logTimer);
		this.logTimer = setInterval(this.log.bind(this), 2000);
		this.agent.start();
		return this;
	}

	/**
	 * Stops the monitoring timers.
	 *
	 * @returns {StatusMonitor}
	 * @access public
	 */
	shutdown() {
		clearTimeout(this.logTimer);
		this.agent.stop();
		return this;
	}

	/**
	 * Logs the current CPU, memory, and uptime.
	 *
	 * @access private
	 */
	log() {
		if (!this.stats) {
			return;
		}

		const { cpu } = this.stats;
		const currentCPUUsage = cpu.toFixed(1);

		let cpuUsage = '';
		if (currentCPUUsage && this.prevCPUUsage) {
			if (currentCPUUsage < this.prevCPUUsage) {
				cpuUsage = ok((arrowDown + currentCPUUsage + '%').padStart(7));
			} else if (currentCPUUsage > this.prevCPUUsage) {
				cpuUsage = alert((arrowUp + currentCPUUsage + '%').padStart(7));
			}
		}
		if (!cpuUsage) {
			cpuUsage = note((' ' + (currentCPUUsage ? currentCPUUsage : '?') + '%').padStart(7));
		}
		this.prevCPUUsage = currentCPUUsage;

		const currentMemoryUsage = this.status.memory;
		const heapUsed  = filesize(currentMemoryUsage.heapUsed).toUpperCase();
		const heapTotal = filesize(currentMemoryUsage.heapTotal).toUpperCase();
		const rss       = filesize(currentMemoryUsage.rss).toUpperCase();
		let heapUsage   = note(heapUsed.padStart(11)) + ' /' + note(heapTotal.padStart(11));
		let rssUsage    = note(rss.padStart(10));

		if (this.prevMemory) {
			if (currentMemoryUsage.heapUsed < this.prevMemory.heapUsed) {
				heapUsage = ok((arrowDown + heapUsed).padStart(11));
			} else if (currentMemoryUsage.heapUsed > this.prevMemory.heapUsed) {
				heapUsage = alert((arrowUp + heapUsed).padStart(11));
			} else {
				heapUsage = note(heapUsed.padStart(11));
			}

			heapUsage += ' /';

			if (currentMemoryUsage.heapTotal < this.prevMemory.heapTotal) {
				heapUsage += ok((arrowDown + heapTotal).padStart(11));
			} else if (currentMemoryUsage.heapTotal > this.prevMemory.heapTotal) {
				heapUsage += alert((arrowUp + heapTotal).padStart(11));
			} else {
				heapUsage += note(heapTotal.padStart(11));
			}

			if (currentMemoryUsage.rss < this.prevMemory.rss) {
				rssUsage = ok((arrowDown + rss).padStart(10));
			} else if (currentMemoryUsage.rss > this.prevMemory.rss) {
				rssUsage = alert((arrowUp + rss).padStart(10));
			}
		}

		// need to clone the object so we don't reference the object that gets updated
		this.prevMemory = { ...currentMemoryUsage };

		logger.log(
			`CPU: ${cpuUsage}  `
			+ `Heap:${heapUsage}  ` // purposely don't put a space after the ':', heapUsage is already left padded
			+ `RSS: ${rssUsage}  `
			+ `Uptime: ${note(`${(this.status.uptime / 60).toFixed(2)}m`)}`
		);
	}
}
