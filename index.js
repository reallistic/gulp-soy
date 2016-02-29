var through = require('through2'),
    gutil = require('gulp-util'),
    Buffer = require('buffer').Buffer,
    PluginError = gutil.PluginError,
    fs = require('fs'),
    os = require('os'),
    File = gutil.File,
    closureTemplates = require('closure-templates'),
    path = require('path'),
    spawn = require('child_process').spawn,
    md5 = require('MD5');

module.exports = function (options) {
    if (typeof options !== 'object') {
        options = {};
    }

    var tmp = path.resolve(options.tmpDir || path.join(os.tmpdir(), 'soy')),
        addSoyUtils = options.hasOwnProperty('soyutils') ? options.soyutils : true,
        compilerFlags = options.hasOwnProperty('flags') ? options.flags : [],
        compiler = path.resolve(options.compilerPath || closureTemplates['SoyToJsSrcCompiler.jar']),
        files = [];
    var useProvide = compilerFlags.indexOf('--shouldProvideRequireSoyNamespaces') != -1;
    var soyUtils = path.resolve(closureTemplates[useProvide ? 'soyutils_usegoog.js' : 'soyutils.js']);

    function write(file, enc, cb){
        if (file.isNull()) {
            cb();
            return;
        }
        if (file.isStream()) {
            var err = new PluginError('gulp-soy',  'Streaming not supported');
            this.emit('error', err);
            cb(err, file);
            return;
        }
        files.push(file);
        cb();
    }

    function newFile(file, contentPath, opt_path) {
        var path = opt_path ? opt_path : file.path.replace(/\.soy$/, '.js');
        return new File({
            cwd: file.cwd,
            base: file.base,
            path: path,
            contents: new Buffer(fs.readFileSync(contentPath, 'utf8'))
        });
    }

    function emitFiles(self, cb) {
        if (addSoyUtils && files.length > 0) {
            var soyPath = path.join(files[0].base, 'soyutils.js');
            var soyFile = newFile(files[0], soyUtils, soyPath)
            self.emit('data', soyFile);
            cb(null, soyFile);
        }
        files.forEach(function (file) {
            var tmpPath = path.join(tmp, path.basename(file.path));
            var lastFile = newFile(file, tmpPath.replace(/\.soy$/, '.js'));
            self.emit('data', lastFile);
            cb(null, lastFile);
            gutil.log('Out:', lastFile.relative);
        });
    }

    function handleFlush(cb) {
        var self = this;

        if (files.length < 0) {
            cb();
            return;
        }

        var filePaths = files.map(function (file) {
          return file.path;
        });

        var cp,
            stderr = '',
            stdout = '',
            args = [
                '-jar', compiler,
                '--codeStyle', 'concat'];
            args = args.concat(compilerFlags);
            args = args.concat([
                '--outputPathFormat', path.join(tmp, '{INPUT_FILE_NAME_NO_EXT}.js')
            ]);
            args = args.concat(filePaths);

        cp = spawn('java', args);

        cp.stdout.on('data', function (data) {
            stdout += data
        });

        cp.stderr.on('data', function (data) {
            stderr += data
        });

        cp.on('exit', function (exitCode) {
            if (exitCode) {
                gutil.log('Compile error\n', stderr);
                self.emit('error', new Error('Error compiling templates'), false);
            }
            else {
                if (stdout.length > 0) {
                    gutil.log('Compilation succeeded\n', stdout);
                }
                emitFiles(self, cb);
            }
            self.emit('end');
        });
    }

    return through.obj(write, handleFlush);
};
