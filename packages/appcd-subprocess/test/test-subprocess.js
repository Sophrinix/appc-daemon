import * as subprocess from '../src/subprocess';
import path from 'path';

const executable = `test${subprocess.exe}`;
const dir = path.join(__dirname, 'fixtures');
const fullpath = path.join(dir, executable);

describe('subprocess', () => {
	beforeEach(function () {
		this.PATH = process.env.PATH;
	});

	afterEach(function () {
		process.env.PATH = this.PATH;
	});

	describe('which()', () => {
		it('should find a well-known executable', done => {
			process.env.PATH = path.join(__dirname, 'fixtures');
			subprocess.which(executable)
				.then(result => {
					expect(result).to.be.a.String;
					expect(result).to.equal(fullpath);
					done();
				})
				.catch(done);
		});

		it('should not find an invalid executable', done => {
			subprocess.which('no_way_does_this_already_exist')
				.then(executable => {
					done(new Error(`Somehow there's an executable called "${executable}"`));
				})
				.catch(err => {
					expect(err).to.be.instanceof(Error);
					done();
				});
		});

		it('should scan list of executables and find well-known executable', done => {
			process.env.PATH = path.join(__dirname, 'fixtures');
			subprocess.which(['no_way_does_this_already_exist', executable])
				.then(result => {
					expect(result).to.be.a.String;
					expect(result).to.equal(fullpath);
					done();
				})
				.catch(done);
		});

		it('should scan list of invalid executables', done => {
			subprocess.which(['no_way_does_this_already_exist', 'this_also_should_not_exist'])
				.then(executable => {
					done(new Error(`Somehow there's an executable called "${executable}"`));
				})
				.catch(err => {
					expect(err).to.be.instanceof(Error);
					done();
				});
		});
	});

	describe('run()', () => {
		it('should run a subprocess that exits successfully', done => {
			subprocess.run(process.execPath, ['-e', 'process.stdout.write("foo");process.stderr.write("bar");process.exit(0);'])
				.then(({ stdout, stderr }) => {
					expect(stdout).to.equal('foo');
					expect(stderr).to.equal('bar');
					done();
				})
				.catch(done);
		});

		it('should run a subprocess that exits unsuccessfully', done => {
			subprocess.run(process.execPath, ['-e', 'process.stdout.write("foo");process.stderr.write("bar");process.exit(1);'])
				.then(({ stdout, stderr }) => {
					done(new Error('Expected subprocess to fail'));
				})
				.catch(({ code, stdout, stderr }) => {
					expect(code).to.equal(1);
					expect(stdout).to.equal('foo');
					expect(stderr).to.equal('bar');
					done();
				});
		});

		it('should run a subprocess without args and without options', done => {
			subprocess.run(fullpath)
				.then(({ stdout, stderr }) => {
					expect(stdout.trim()).to.equal('this is a test');
					expect(stderr.trim()).to.equal('');
					done();
				})
				.catch(done);
		});

		it('should run a subprocess without args and with options', done => {
			subprocess.run(fullpath, {})
				.then(({ code, stdout, stderr }) => {
					expect(stdout.trim()).to.equal('this is a test');
					expect(stderr.trim()).to.equal('');
					done();
				})
				.catch(done);
		});
	});
});
