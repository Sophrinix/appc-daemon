global.chai = require('chai');
global.chai.use(require('chai-as-promised'));
global.chai.use(require('sinon-chai'));
global.expect = global.chai.expect;
global.sinon = require('sinon');

beforeEach(function () {
	this.sandbox = global.sinon.sandbox.create();
	global.spy = this.sandbox.spy.bind(this.sandbox);
	global.stub = this.sandbox.stub.bind(this.sandbox);
});

afterEach(function () {
	delete global.spy;
	delete global.stub;
	this.sandbox.restore();
});

process.env.SNOOPLOGG_MIN_BRIGHTNESS = '100';
